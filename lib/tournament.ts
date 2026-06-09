// ============================================================================
// Tournament Edition — pure, deterministic playoff simulation engine.
//
// Companion to lib/scoring.ts (the regular-season model). Same shape: a single
// `TOURNAMENT_CONFIG` of tunable knobs, a set of small pure functions, and a
// top-level `simulateBracket` entry point. Heavily commented because the buffs
// are the whole game — every modifier is itemized into a `GameBreakdown` so the
// UI can show exactly why a series broke the way it did, and so tuning is visible.
//
// DETERMINISM CONTRACT: nothing here calls Math.random or reads the clock. Every
// stochastic value comes from `mulberry32` seeded off a string via `hashSeed`,
// so a given (teams, seedKey) pair always produces a deeply-equal BracketResult.
//
// SEEDING INVARIANT: the engine NEVER recomputes a team's seeding strength. The
// caller precomputes `seedNet` (the five's netRating with NO tournament buffs)
// and hands it in. That structurally guarantees the buffs below can only affect
// game outcomes, never the seed line.
// ============================================================================

import { simulateRoster, type ScoringPlayer } from "./scoring";
import type {
  BracketPlayer,
  BracketResult,
  BracketTeam,
  Conference,
  GameBreakdown,
  GameResult,
  SeriesResult,
  StatKey,
  StatNorms,
} from "./types";
import { STAT_KEYS, NEGATIVE_STATS, FG_BASELINE, FT_BASELINE } from "./types";

/** Engine input. The five starters + the bench player, plus precomputed seeding
 *  strength. The app builds these from a submission; the engine treats them as
 *  immutable. `seedNet` is the five's netRating via simulateRoster with NO buffs
 *  — precomputed by the caller so the engine never re-derives seeding. */
export interface TournamentTeam {
  id: string;            // submission_id or ghost id (used as bracket team id)
  name: string;          // display name (<=8 char human or ghost name)
  isGhost: boolean;
  starters: ScoringPlayer[];  // exactly 5, slot order [G,FLEX,W,FLEX,B]
  sixthMan: ScoringPlayer;    // the bench player (NOT in the starting five)
  captainSlot: number;        // 0..4, index into starters
  ageAtPeak: number;          // team age proxy: AVERAGE age-at-peak across all SIX (starters + sixth man)
  sixthManAge: number;        // sixth man's age proxy (experience at peak); nudges recovery
  seedNet: number;            // netRating of the FIVE via simulateRoster — NO buffs.
  // OPTIONAL display fields threaded into the stored bracket for the expandable
  // team panel. Optional so the test factory / any caller still compiles.
  roster?: BracketPlayer[];      // 5 starters, slot order [G,FLEX,W,FLEX,B], captain flagged
  sixthManInfo?: BracketPlayer;  // bench player (named to avoid clashing with `sixthMan: ScoringPlayer`)
}

/**
 * Tunable knobs. Every game's adjusted net is:
 *   adj = seedNet + gameScoreBuff + heightBuff + homeBuff
 *         - fatigue - recoveryCarry + randomFactor
 * The buffs are deliberately small relative to a seedNet spread (which can be
 * tens of points): a better team should usually win, but a fresh underdog with
 * home court and a hot night can steal a game — and, occasionally, a series.
 */
export const TOURNAMENT_CONFIG = {
  // Home-court edge, split zero-sum: home +HOME_BUFF/2, away -HOME_BUFF/2.
  HOME_BUFF: 5.5,

  // Size edge: net per inch of summed-starter-height advantage vs the opponent,
  // capped both directions (zero-sum — what one team gains the other loses).
  HEIGHT_PER_INCH: 0.15,
  HEIGHT_CAP: 3.0,

  // Game-score buff — the one reward for TEAM COMPOSITION, so it's the strongest
  // matchup buff and it SCALES with how decisively you win the 8-category pairwise
  // comparison (winner's category count, out of 8):
  //   7–8 → +4.5, 6 → +3, 5 → +2.25, 4-4 or worse → 0. Loser always 0.
  // (Bumped 50% over the original 3/2/1.5 to make composition matter more.)
  GAME_SCORE_BUFF_SWEEP: 4.5, // 7 or 8 of 8 categories
  GAME_SCORE_BUFF_STRONG: 3, // 6
  GAME_SCORE_BUFF_EDGE: 2.25, // 5

  // Captain effect: the captain's 2 highest-z categories get a ×(1+PCT) bump and
  // their single lowest-z gets ×(1-PCT), applied to EVERY player on the team
  // (incl. the sixth man) before per-36 aggregation.
  CAPTAIN_BUFF_PCT: 0.05,

  // Fatigue: accrues across a series. Per-game slope × an age factor × the
  // sixth-man multiplier × (game-1). LEAGUE_AVG_EXP centers the age factor.
  FATIGUE_PER_GAME: 0.6,
  LEAGUE_AVG_EXP: 6,
  // OLDER teams decay faster: the above-average half of the age factor is steepened
  // by this multiplier (young teams' buff is unchanged). 4/3 ⇒ ~33% more severe.
  AGE_OLD_FATIGUE_MULT: 4 / 3,
  // A bench player always exists in this design, so the slope is always halved;
  // the knob stays explicit for tuning / to document the assumption.
  SIXTH_MAN_FATIGUE_MULT: 0.5,

  // Recovery between rounds: the PREVIOUS series' end-of-series fatigue rolls
  // over, recovered by a fraction keyed off how long that series went — a
  // dominant short series rests you, a grind doesn't. Only a SWEEP (4 games)
  // fully resets; 5/6/7-game series recover 80/55/30%. The carried fatigue is
  // endFatigue × (1 − recovery%).
  SERIES_RECOVERY_PCT: { 4: 1, 5: 0.8, 6: 0.55, 7: 0.3 } as Record<number, number>,
  // A non-sweep never fully resets even with a great bench (some fatigue always
  // carries), so cap the recovery for 5+ game series below 1.
  NON_SWEEP_RECOVERY_CAP: 0.95,
  // The SIXTH MAN then nudges recovery on top of the series-length base: a better
  // (higher GQ) and YOUNGER bench recovers a bit more. Deliberately a SMALL
  // effect (series length dominates) — was the primary driver before, too strong.
  BENCH_RECOVERY_GQ_WEIGHT: 0.4,
  BENCH_RECOVERY_AGE_WEIGHT: 0.02,

  // Per-game luck, bounded ±, drawn from a seeded PRNG (never Math.random).
  // Widened from ±1.5 to ±3.5 so the higher seed doesn't always win — a hot
  // night can steal games (and occasionally a series).
  RANDOM_FACTOR_MAX: 3.5,

  // Displayed box score: the game's total points come from the two teams' actual
  // offensive output (each five's reg-season team PTS, summed) knocked down for
  // playoff defense, then split by the net margin — not a flat ~100 base. A small
  // seeded per-game jitter keeps games in a series from showing identical totals.
  PLAYOFF_DEFENSE_PCT: 0.1, // shave 10% off combined scoring for playoff defense
  SCORE_JITTER_PCT: 0.04, // ± per-game wobble on the combined total
  // Believable-range guardrails on the combined two-team total, so a degenerate
  // roster (or a synthetic test team) still yields a sane box score.
  MIN_GAME_TOTAL: 192,
  MAX_GAME_TOTAL: 258,
} as const;

export type TournamentConfig = typeof TOURNAMENT_CONFIG;

// ---------------------------------------------------------------------------
// Small helpers (mirrors scoring.ts style).
// ---------------------------------------------------------------------------
const clamp = (x: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, x));

// ---------------------------------------------------------------------------
// Deterministic PRNG. mulberry32 is a tiny, well-distributed 32-bit generator;
// hashSeed turns a string into its 32-bit seed (FNV-1a-ish). Used everywhere a
// "random" number is needed so the whole bracket is reproducible from a seedKey.
// ---------------------------------------------------------------------------

/** mulberry32: deterministic [0,1) PRNG from a 32-bit integer seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic 32-bit hash of a string (so any string can seed mulberry32). */
export function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Stat layer: per-36 normalization, the captain category multipliers, team
// totals, and the pairwise 9-stat "game score" comparison.
// ---------------------------------------------------------------------------

/** Per-36 value of a counting stat for one player (guard mpg > 0). */
function per36(p: ScoringPlayer, raw: number): number {
  return p.mpg > 0 ? (raw * 36) / p.mpg : 0;
}

/** The per-36 value for a StatKey on one player. fgV/ftV are GQ-style volume-
 *  weighted shooting values: (pct − baseline) × per-36 attempts. */
function per36Stat(p: ScoringPlayer, k: StatKey): number {
  switch (k) {
    case "pts": return per36(p, p.pts);
    case "reb": return per36(p, p.reb);
    case "ast": return per36(p, p.ast);
    case "stl": return per36(p, p.stl);
    case "blk": return per36(p, p.blk);
    case "tov": return per36(p, p.tov);
    case "fgV":
      return p.fga > 0 ? (p.fgm / p.fga - FG_BASELINE) * per36(p, p.fga) : 0;
    case "ftV":
      return p.fta > 0 ? (p.ftm / p.fta - FT_BASELINE) * per36(p, p.fta) : 0;
  }
}

/** Per-StatKey multipliers from the captain profile (default 1 for every key). */
export type CaptainMultipliers = Record<StatKey, number>;

const NO_CAPTAIN_MULT = (): CaptainMultipliers => {
  const m = {} as CaptainMultipliers;
  for (const k of STAT_KEYS) m[k] = 1;
  return m;
};

/**
 * Captain profile → category multipliers. Compute the captain's z-score per
 * StatKey against the population norms ((per36 - mean)/std, guard std>0). For
 * `tov` (a NEGATIVE stat) NEGATE the z so that LOW turnovers reads as a strength.
 * Then the 2 highest-z categories get ×(1+PCT) and the single lowest-z gets
 * ×(1-PCT). These multipliers apply team-wide (see `per36Totals`).
 */
export function captainMultipliers(
  captain: ScoringPlayer,
  norms: StatNorms,
  cfg: TournamentConfig = TOURNAMENT_CONFIG,
): CaptainMultipliers {
  const zByKey = STAT_KEYS.map((k) => {
    const std = norms.std[k];
    let z = std > 0 ? (per36Stat(captain, k) - norms.mean[k]) / std : 0;
    if (NEGATIVE_STATS.has(k)) z = -z; // low TOV is good → flip its sign
    return { k, z };
  });

  // Highest z first; deterministic tie-break on StatKey order for stable output.
  const order = STAT_KEYS.indexOf.bind(STAT_KEYS);
  const byZDesc = [...zByKey].sort((a, b) => b.z - a.z || order(a.k) - order(b.k));

  const mult = NO_CAPTAIN_MULT();
  const top2 = byZDesc.slice(0, 2);
  const bottom = byZDesc[byZDesc.length - 1];
  for (const t of top2) mult[t.k] = 1 + cfg.CAPTAIN_BUFF_PCT;
  mult[bottom.k] = 1 - cfg.CAPTAIN_BUFF_PCT;
  return mult;
}

/**
 * Team per-36 totals over all SIX players (5 starters + sixth man) with the
 * captain category multipliers applied team-wide. Counting stats SUM; shooting
 * is the GQ-style VALUE fgV = (Σfgm/Σfga − 0.47)·Σfga, ftV = (Σftm/Σfta − 0.80)·Σfta
 * — volume-weighted, not bare rate. The captain multiplier for a shooting
 * category is applied to that category's MAKES so the value moves with the buff.
 */
export function per36Totals(
  team: TournamentTeam,
  norms?: StatNorms,
  cfg: TournamentConfig = TOURNAMENT_CONFIG,
): Record<StatKey, number> {
  const players = [...team.starters, team.sixthMan];
  const mult = norms
    ? captainMultipliers(team.starters[team.captainSlot], norms, cfg)
    : NO_CAPTAIN_MULT();

  // Aggregate per-36 makes/attempts so shooting rates can be recomputed.
  let fgm36 = 0, fga36 = 0, ftm36 = 0, fta36 = 0;
  const counting: Record<StatKey, number> = {} as Record<StatKey, number>;
  for (const k of STAT_KEYS) counting[k] = 0;

  for (const p of players) {
    // Counting stats: sum per-36 with the per-category captain multiplier.
    counting.pts += per36(p, p.pts) * mult.pts;
    counting.reb += per36(p, p.reb) * mult.reb;
    counting.ast += per36(p, p.ast) * mult.ast;
    counting.stl += per36(p, p.stl) * mult.stl;
    counting.blk += per36(p, p.blk) * mult.blk;
    counting.tov += per36(p, p.tov) * mult.tov;
    // Shooting: aggregate makes (buffed) / attempts so the value moves with the buff.
    fgm36 += per36(p, p.fgm) * mult.fgV;
    fga36 += per36(p, p.fga);
    ftm36 += per36(p, p.ftm) * mult.ftV;
    fta36 += per36(p, p.fta);
  }

  const totals = { ...counting };
  // GQ-style shooting value: (rate − baseline) × volume. Higher is better.
  totals.fgV = fga36 > 0 ? (fgm36 / fga36 - FG_BASELINE) * fga36 : 0;
  totals.ftV = fta36 > 0 ? (ftm36 / fta36 - FT_BASELINE) * fta36 : 0;
  return totals;
}

/**
 * Pairwise 8-category comparison (the playoff "game score", in the spirit of the
 * GQ round-robin): for each StatKey the team with the better value wins the
 * category. For `tov` (NEGATIVE) the LOWER value wins; ties award the category to
 * neither. The winner's category count feeds gameScoreBuff (caller).
 */
export function gameScoreCompare(
  aTotals: Record<StatKey, number>,
  bTotals: Record<StatKey, number>,
): { aWins: number; bWins: number } {
  let aWins = 0, bWins = 0;
  for (const k of STAT_KEYS) {
    const a = aTotals[k], b = bTotals[k];
    if (a === b) continue; // tie → neither
    const aBetter = NEGATIVE_STATS.has(k) ? a < b : a > b;
    if (aBetter) aWins++;
    else bWins++;
  }
  return { aWins, bWins };
}

/**
 * The game-score net buff for the team that WON `catWins` of the 8 categories.
 * Scales with dominance: 7–8 → SWEEP, 6 → STRONG, 5 → EDGE, ≤4 → 0. (The loser
 * and a 4-4 tie both get 0 — the caller only ever calls this for the winner.)
 */
export function gameScoreBuff(
  catWins: number,
  cfg: TournamentConfig = TOURNAMENT_CONFIG,
): number {
  if (catWins >= 7) return cfg.GAME_SCORE_BUFF_SWEEP;
  if (catWins === 6) return cfg.GAME_SCORE_BUFF_STRONG;
  if (catWins === 5) return cfg.GAME_SCORE_BUFF_EDGE;
  return 0;
}

// ---------------------------------------------------------------------------
// Per-team game modifiers (pure).
// ---------------------------------------------------------------------------

/** Age factor scaling fatigue: 1 at LEAGUE_AVG_EXP, rising for older teams (they
 *  decay faster across a series), falling for younger ones. The young side is
 *  bounded at -0.4; the OLD side (above average) is steepened by AGE_OLD_FATIGUE_MULT
 *  so older teams decay ~33% harder, then bounded at 0.8 × that multiplier. */
export function ageFactor(
  team: TournamentTeam,
  cfg: TournamentConfig = TOURNAMENT_CONFIG,
): number {
  const dev = clamp((team.ageAtPeak - cfg.LEAGUE_AVG_EXP) / 10, -0.4, 0.8);
  return 1 + (dev > 0 ? dev * cfg.AGE_OLD_FATIGUE_MULT : dev);
}

/** Cumulative fatigue (a POSITIVE amount that is SUBTRACTED) at game `gameNo`
 *  (1-based) of a series: FATIGUE_PER_GAME × ageFactor × SIXTH_MAN mult × (g-1).
 *  A sixth man always exists here, so the slope is always halved. Game 1 = 0. */
export function fatigue(
  team: TournamentTeam,
  gameNo: number,
  cfg: TournamentConfig = TOURNAMENT_CONFIG,
): number {
  return (
    cfg.FATIGUE_PER_GAME *
    ageFactor(team, cfg) *
    cfg.SIXTH_MAN_FATIGUE_MULT *
    (gameNo - 1)
  );
}

/**
 * Recovery carry (a POSITIVE amount SUBTRACTED, constant within a series): the
 * fatigue a team brings INTO this series from how its PREVIOUS series ended.
 *
 * The previous series' end-of-series fatigue ROLLS OVER, recovered by a fraction
 * keyed off how long that series went:
 *   swept (4 games) → 100% recovered → carry 0 (ONLY a sweep fully resets);
 *   5 → 80%, 6 → 55%, 7 → 30% recovered.
 * A better/younger SIXTH MAN recovers a bit more on top (a small nudge — series
 * length dominates), but a non-sweep never fully resets (recovery capped < 1).
 * `gamesPlayedPrev` is how many games the team's last series went (4–7), or 0 in
 * round 1 (no previous series → carry 0). carry = endFatigue × (1 − recovery).
 */
export function recoveryCarry(
  team: TournamentTeam,
  gamesPlayedPrev: number,
  cfg: TournamentConfig = TOURNAMENT_CONFIG,
): number {
  if (gamesPlayedPrev <= 0) return 0; // round 1 — no prior series
  const games = clamp(Math.round(gamesPlayedPrev), 4, 7);
  const baseRecovery = cfg.SERIES_RECOVERY_PCT[games];
  const benchBonus =
    (team.sixthMan.gq - 0.5) * cfg.BENCH_RECOVERY_GQ_WEIGHT +
    (cfg.LEAGUE_AVG_EXP - team.sixthManAge) * cfg.BENCH_RECOVERY_AGE_WEIGHT;
  // A sweep always fully resets; otherwise the bench can nudge recovery but never
  // to a full reset, so some fatigue always carries out of a 5+ game series.
  const recovery =
    games <= 4 ? 1 : clamp(baseRecovery + benchBonus, 0, cfg.NON_SWEEP_RECOVERY_CAP);
  const endFatigue = fatigue(team, games, cfg); // fatigue accrued by the last game
  return endFatigue * (1 - recovery);
}

// ---------------------------------------------------------------------------
// Bracket construction + series play.
// ---------------------------------------------------------------------------

// Real-NBA conference by (modern-lineage) franchise abbreviation. A player on a
// West team is worth +1, an East team −1. A team's region score sums its six
// players, with the captain counted twice, so it ranges −7..+7. Unknown or
// conference-ambiguous historical abbreviations are neutral (0). Aligned to
// MODERN reality on purpose — the split is meant to be a fun, slightly
// West-favoring nod to recent seasons, not historical pre-merger divisions.
const WEST_TEAMS: ReadonlySet<string> = new Set([
  "DAL", "DEN", "GSW", "HOU", "LAC", "LAL", "MEM", "MIN", "NOP", "OKC",
  "PHX", "POR", "SAC", "SAS", "UTA",
  // relocated / historical lineage → West
  "SEA", "VAN", "NOH", "NOK", "SDC", "KCK", "SDR", "PHW", "MNL",
]);
const EAST_TEAMS: ReadonlySet<string> = new Set([
  "ATL", "BOS", "BKN", "CHA", "CHI", "CLE", "DET", "IND", "MIA", "MIL",
  "NYK", "ORL", "PHI", "TOR", "WAS",
  // relocated / historical lineage → East
  "NJN", "WSB", "CHH", "SYR", "BAL", "CIN", "BUF", "ROC", "FTW",
]);

/** Conference value of a franchise: +1 West, −1 East, 0 unknown/ambiguous. */
function confVal(team: string): number {
  if (WEST_TEAMS.has(team)) return 1;
  if (EAST_TEAMS.has(team)) return -1;
  return 0;
}

/**
 * Region affinity score for a team (−7..+7): +1 per West player, −1 per East
 * player across the six (5 starters + sixth man), with the CAPTAIN counted an
 * extra time. Higher → more Western. Reads the display roster (which carries
 * each player's franchise); 0 when roster info is absent.
 */
export function regionScore(team: TournamentTeam): number {
  let score = 0;
  for (const p of team.roster ?? []) {
    const v = confVal(p.team);
    score += v;
    if (p.captain) score += v; // captain counts double
  }
  if (team.sixthManInfo) score += confVal(team.sixthManInfo.team);
  return score;
}

/** Summed real height of all SIX players (five starters + sixth man) — drives
 *  the size matchup. The bench player's height counts. */
function teamHeight(team: TournamentTeam): number {
  return (
    team.starters.reduce((a, p) => a + p.height_in, 0) + team.sixthMan.height_in
  );
}

/** Every round is best-of-7 (clinch = 4). The bo5 entries remain for the type
 *  but are unused now. */
const CLINCH: Record<5 | 7, number> = { 5: 3, 7: 4 };

/** Home/away game ownership by the HIGHER seed (`hi`): 2-2-1 / 2-3-2. */
const HOME_OWNER: Record<5 | 7, ("hi" | "lo")[]> = {
  5: ["hi", "hi", "lo", "lo", "hi"],
  7: ["hi", "hi", "lo", "lo", "lo", "hi", "hi"],
};

/** Static (per-matchup) buffs that don't change game to game within a series. */
interface SeriesStatics {
  gameScoreBuff: Record<string, number>; // teamId → 0 or GAME_SCORE_BUFF
  heightBuff: Record<string, number>;    // teamId → ± capped height edge
  carry: Record<string, number>;         // teamId → recovery carry (from prev series)
}

/**
 * Play one series to its clinch number and return the SeriesResult plus, for
 * each team, how many games OVER the series minimum it took (used by the NEXT
 * round's recovery carry). `statics` are computed once per matchup; fatigue and
 * the random factor vary per game.
 */
function playSeries(
  hi: TournamentTeam,
  lo: TournamentTeam,
  bestOf: 5 | 7,
  statics: SeriesStatics,
  seedKey: string,
  round: number,
  seriesIdx: number,
  cfg: TournamentConfig,
): { result: SeriesResult; gamesOverMin: Record<string, number> } {
  const clinch = CLINCH[bestOf];
  const owners = HOME_OWNER[bestOf];
  const games: GameResult[] = [];
  let scoreHi = 0, scoreLo = 0;

  // Each five's reg-season team PTS (the same figure shown on the result card)
  // drives the displayed box score: the two summed and shaved for playoff defense
  // give the game's total points, split by the per-game net margin below.
  const teamPts: Record<string, number> = {
    [hi.id]: simulateRoster(hi.starters).teamBox.pts,
    [lo.id]: simulateRoster(lo.starters).teamBox.pts,
  };
  const combinedBase =
    (teamPts[hi.id] + teamPts[lo.id]) * (1 - cfg.PLAYOFF_DEFENSE_PCT);

  for (let g = 1; g <= bestOf && scoreHi < clinch && scoreLo < clinch; g++) {
    const homeIsHi = owners[g - 1] === "hi";
    const home = homeIsHi ? hi : lo;
    const away = homeIsHi ? lo : hi;

    // ONE zero-sum luck draw per game: +r to the home side, −r to the away side
    // (not two independent draws). Seeded by the game so the bracket stays
    // reproducible.
    const gameRng = mulberry32(
      hashSeed(`${seedKey}:${round}:${seriesIdx}:${g}`),
    );
    const r = (gameRng() * 2 - 1) * cfg.RANDOM_FACTOR_MAX;

    const build = (
      team: TournamentTeam,
      isHome: boolean,
      randomFactor: number,
    ): GameBreakdown => {
      const homeBuff = isHome ? cfg.HOME_BUFF / 2 : -cfg.HOME_BUFF / 2;
      const fat = fatigue(team, g, cfg);
      const carry = statics.carry[team.id];
      const adj =
        team.seedNet +
        statics.gameScoreBuff[team.id] +
        statics.heightBuff[team.id] +
        homeBuff -
        fat -
        carry +
        randomFactor;
      return {
        seedNet: team.seedNet,
        gameScoreBuff: statics.gameScoreBuff[team.id],
        heightBuff: statics.heightBuff[team.id],
        homeBuff,
        fatigue: fat,          // positive; subtracted above
        recoveryCarry: carry,  // positive; subtracted above
        randomFactor,
        adj,
      };
    };

    const homeBd = build(home, true, r);
    const awayBd = build(away, false, -r);
    const homeWon = homeBd.adj >= awayBd.adj;
    const winnerId = homeWon ? home.id : away.id;
    if (winnerId === hi.id) scoreHi++; else scoreLo++;

    const margin = homeBd.adj - awayBd.adj; // positive ⇒ home won
    // Box score: the game total = the two teams' combined reg-season PTS minus
    // playoff defense (constant per series), wobbled a little per game, then split
    // by half the net margin and nudged so the winner is always strictly ahead.
    const scoreRng = mulberry32(
      hashSeed(`${seedKey}:${round}:${seriesIdx}:${g}:score`),
    );
    const total = clamp(
      combinedBase * (1 + (scoreRng() * 2 - 1) * cfg.SCORE_JITTER_PCT),
      cfg.MIN_GAME_TOTAL,
      cfg.MAX_GAME_TOTAL,
    );
    const half = total / 2;
    let homeScore = Math.round(half + margin / 2);
    let awayScore = Math.round(half - margin / 2);
    if (homeWon && homeScore <= awayScore) homeScore = awayScore + 1;
    else if (!homeWon && awayScore <= homeScore) awayScore = homeScore + 1;

    games.push({
      gameNo: g,
      homeId: home.id,
      awayId: away.id,
      winnerId,
      margin,
      homeScore,
      awayScore,
      breakdown: { [home.id]: homeBd, [away.id]: awayBd },
    });
  }

  const winnerId = scoreHi > scoreLo ? hi.id : lo.id;
  const played = games.length;
  // Series minimum = clinch (a sweep). Games over the minimum drives next-round carry.
  const gamesOverMin = { [hi.id]: played - clinch, [lo.id]: played - clinch };

  return {
    result: { hiId: hi.id, loId: lo.id, bestOf, games, winnerId, scoreHi, scoreLo },
    gamesOverMin,
  };
}

/**
 * Top-level entry: 16 teams → a fully resolved BracketResult.
 *
 * 1. Region-affinity split: score each team by its players' real conferences
 *    (West +1 / East −1, captain doubled), top 8 → West / bottom 8 → East (ties
 *    to seedNet). Within each conference sort by seedNet desc → seeds 1..8.
 * 2. Fixed tree (NO reseed): pairings 1v8 / 4v5 / 3v6 / 2v7. Every round best-of-7; conf
 *    semis, conf finals and the Final are best-of-7. rounds = [8, 4, 2, 1].
 * 3. Each series: higher seed = home court. Per game, adjusted net comes from the
 *    breakdown; the winner is the higher adj; recovery carry flows from the
 *    team's previous series; fatigue grows within the series; luck is seeded.
 */
export function simulateBracket(
  teams: TournamentTeam[],
  seedKey: string,
  statNorms: StatNorms,
  cfg: TournamentConfig = TOURNAMENT_CONFIG,
): BracketResult {
  if (teams.length !== 16) {
    throw new Error(`simulateBracket requires exactly 16 teams, got ${teams.length}`);
  }

  // ---- 1. Region-affinity split into conferences, then seed within each. ----
  // Sort by region score (West-leaning first); ties broken by seedNet (higher →
  // West), so the West ends up slightly stronger. Top 8 → West, bottom 8 → East.
  const byRegion = [...teams].sort(
    (a, b) =>
      regionScore(b) - regionScore(a) ||
      b.seedNet - a.seedNet ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const westRaw = byRegion.slice(0, 8);
  const eastRaw = byRegion.slice(8, 16);

  const byStrength = (a: TournamentTeam, b: TournamentTeam) =>
    b.seedNet - a.seedNet || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  const seedConf = (raw: TournamentTeam[], conference: Conference) => {
    const sorted = [...raw].sort(byStrength);
    return sorted.map((t, i) => ({
      team: t,
      bracket: {
        id: t.id,
        name: t.name,
        isGhost: t.isGhost,
        conference,
        seed: i + 1, // 1..8
        seedNet: t.seedNet,
        roster: t.roster,
        sixthMan: t.sixthManInfo,
      } as BracketTeam,
    }));
  };

  const east = seedConf(eastRaw, "East");
  const west = seedConf(westRaw, "West");
  const teamsOut: BracketTeam[] = [...east, ...west].map((e) => e.bracket);

  // teamId → TournamentTeam (for series play after we only carry BracketTeams).
  const byId = new Map(teams.map((t) => [t.id, t] as const));

  // ---- Static per-matchup buffs. ----
  const computeStatics = (
    hi: TournamentTeam,
    lo: TournamentTeam,
    carry: Record<string, number>,
  ): SeriesStatics => {
    // Game-score buff: pairwise 8-stat comparison; the winner's net buff SCALES
    // with how many categories it won (7-8 → +3, 6 → +2, 5 → +1.5, ≤4 → 0).
    const hiTot = per36Totals(hi, statNorms, cfg);
    const loTot = per36Totals(lo, statNorms, cfg);
    const cmp = gameScoreCompare(hiTot, loTot);
    const gsBuff: Record<string, number> = { [hi.id]: 0, [lo.id]: 0 };
    if (cmp.aWins > cmp.bWins) gsBuff[hi.id] = gameScoreBuff(cmp.aWins, cfg);
    else if (cmp.bWins > cmp.aWins) gsBuff[lo.id] = gameScoreBuff(cmp.bWins, cfg);

    // Height: zero-sum, capped both directions, from the six-player height diff.
    const diff = teamHeight(hi) - teamHeight(lo);
    const hiHeight = clamp(diff * cfg.HEIGHT_PER_INCH, -cfg.HEIGHT_CAP, cfg.HEIGHT_CAP);
    const heightBuff: Record<string, number> = { [hi.id]: hiHeight, [lo.id]: -hiHeight };

    return { gameScoreBuff: gsBuff, heightBuff, carry };
  };

  // ---- 2/3. Play each conference's bracket, then the Final. ----
  const rounds: SeriesResult[][] = [];
  // Track how each team's last series ended (games over minimum) for next-round carry.
  const lastGamesOver = new Map<string, number>();
  // Track the deepest round each team reached (0 = lost R1 … 4 = champion).
  const reached = new Map<string, number>();
  for (const t of teams) reached.set(t.id, 0);

  // R1 pairing order within a conference (seed indices, 0-based): 1v8,4v5,3v6,2v7.
  const R1_PAIRS: [number, number][] = [[0, 7], [3, 4], [2, 5], [1, 6]];

  // A "slot" carries the surviving team plus whatever its bracket entry was.
  type Slot = { team: TournamentTeam };

  const playRound = (
    matchups: [Slot, Slot][],
    bestOf: 5 | 7,
    round: number,
    confOffset: number, // so East/West series indices don't collide within a round
  ): { series: SeriesResult[]; winners: Slot[] } => {
    const series: SeriesResult[] = [];
    const winners: Slot[] = [];
    matchups.forEach(([sa, sb], idx) => {
      // Higher seed = the team with the better seedNet (tie-break id) = home court.
      const [hi, lo] =
        byStrength(sa.team, sb.team) <= 0 ? [sa.team, sb.team] : [sb.team, sa.team];
      // Games the team's PREVIOUS series went (gamesOverMin + clinch), or 0 if it
      // hasn't played yet (round 1). Drives how much fatigue rolls over.
      const gamesPlayedPrev = (id: string) =>
        lastGamesOver.has(id) ? lastGamesOver.get(id)! + CLINCH[7] : 0;
      const carry: Record<string, number> = {
        [hi.id]: recoveryCarry(hi, gamesPlayedPrev(hi.id), cfg),
        [lo.id]: recoveryCarry(lo, gamesPlayedPrev(lo.id), cfg),
      };
      const statics = computeStatics(hi, lo, carry);
      const { result, gamesOverMin } = playSeries(
        hi, lo, bestOf, statics, seedKey, round, confOffset + idx, cfg,
      );
      series.push(result);
      for (const id of Object.keys(gamesOverMin)) lastGamesOver.set(id, gamesOverMin[id]);
      const winId = result.winnerId;
      const winTeam = byId.get(winId)!;
      winners.push({ team: winTeam });
      reached.set(winId, round); // advancing past round R-1 means you reached round R
    });
    return { series, winners };
  };

  // Build conference R1 matchups in seed order.
  const confR1 = (seeded: { team: TournamentTeam }[]): [Slot, Slot][] =>
    R1_PAIRS.map(([a, b]) => [{ team: seeded[a].team }, { team: seeded[b].team }]);

  // Round 1 (best-of-7, like every round): 8 series total (4 East + 4 West).
  const eR1 = playRound(confR1(east), 7, 1, 0);
  const wR1 = playRound(confR1(west), 7, 1, 4);
  rounds.push([...eR1.series, ...wR1.series]);

  // Conference semifinals (best-of-7): winners of (1v8 vs 4v5) and (3v6 vs 2v7).
  const semiPairs = (w: Slot[]): [Slot, Slot][] => [[w[0], w[1]], [w[2], w[3]]];
  const eR2 = playRound(semiPairs(eR1.winners), 7, 2, 0);
  const wR2 = playRound(semiPairs(wR1.winners), 7, 2, 2);
  rounds.push([...eR2.series, ...wR2.series]);

  // Conference finals (best-of-7): the two semifinal winners in each conference.
  const eR3 = playRound([[eR2.winners[0], eR2.winners[1]]], 7, 3, 0);
  const wR3 = playRound([[wR2.winners[0], wR2.winners[1]]], 7, 3, 1);
  rounds.push([...eR3.series, ...wR3.series]);

  // The Final (best-of-7): East champ vs West champ.
  const fin = playRound([[eR3.winners[0], wR3.winners[0]]], 7, 4, 0);
  rounds.push(fin.series);

  const championId = fin.series[0].winnerId;
  const championName = byId.get(championId)!.name;

  return { teams: teamsOut, rounds, championId, championName };
}
