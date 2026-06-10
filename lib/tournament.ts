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
  PlayInResult,
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
  // Trimmed 25% (5.5 → 4.125) so home court matters a bit less.
  HOME_BUFF: 4.125,

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

/**
 * Recovery carry for a PLAY-IN survivor entering round 1 (size 20 only).
 *
 * The play-in is a SINGLE game (best-of-1) the night before the bracket, so by
 * product rule the survivor gets NO recovery from it — it must carry play-in
 * fatigue straight into round 1. The normal `recoveryCarry` table can't express
 * this: it keys off series length, clamps 1→4 (a "sweep"), and a sweep recovers
 * 100% → carry 0. So we model the play-in carry EXPLICITLY here instead of
 * abusing the best-of-7 SERIES_RECOVERY_PCT table.
 *
 * The carry is the fatigue cost of HAVING PLAYED the play-in game, with 0%
 * recovery. `fatigue()` measures fatigue going INTO game N (game 1 → 0), so the
 * cost of completing one game is `fatigue(team, 2)` — one game's accrued slope:
 * FATIGUE_PER_GAME × ageFactor × SIXTH_MAN mult. No recovery is applied (the
 * play-in is "yesterday"), so the full amount carries. Deterministic; older
 * teams carry more via ageFactor. Bye teams / normal R1 entrants never call this.
 */
export function recoveryCarryFromPlayIn(
  team: TournamentTeam,
  cfg: TournamentConfig = TOURNAMENT_CONFIG,
): number {
  // One game's worth of fatigue (fatigue going into game 2), carried in full —
  // i.e. effectively ~0% recovery from the play-in game.
  return fatigue(team, 2, cfg);
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

/** Series length the engine knows how to play. Main-bracket rounds are all
 *  best-of-7; the size-20 play-in is a SINGLE game (best-of-1). bo5 remains for
 *  the type but is unused in the main bracket. */
export type BestOf = 1 | 5 | 7;

/** Every main-bracket round is best-of-7 (clinch = 4). best-of-1 (the play-in)
 *  clinches at 1 game; the bo5 entry remains for the type but is unused now. */
const CLINCH: Record<BestOf, number> = { 1: 1, 5: 3, 7: 4 };

/** Home/away game ownership by the HIGHER seed (`hi`): 2-2-1 / 2-2-1-1-1 (the
 *  modern NBA format — the 7-game series alternates after the first four). The
 *  best-of-1 play-in is a single game hosted by the higher seed. */
export const HOME_OWNER: Record<BestOf, ("hi" | "lo")[]> = {
  1: ["hi"],
  5: ["hi", "hi", "lo", "lo", "hi"],
  7: ["hi", "hi", "lo", "lo", "hi", "lo", "hi"],
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
  bestOf: BestOf,
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

/** Supported bracket sizes (teams). 16 is the original; the rest are added. */
export type BracketSize = 4 | 8 | 12 | 16 | 20;
const VALID_SIZES: ReadonlySet<number> = new Set([4, 8, 12, 16, 20]);

/**
 * Top-level entry: `size` teams (default 16) → a fully resolved BracketResult.
 *
 * 1. STRENGTH-FIRST seeding: sort ALL teams by seedNet desc (id tie-break), then
 *    assign conferences by region affinity (West +1 / East −1, captain doubled).
 *    Walking strongest-first, each team goes to its affinity-preferred conference
 *    while that side has open slots (size/2), else the other. Affinity decides
 *    only WHICH conference; it can never seed a weaker team above a stronger one.
 *    Seeds within each conference follow seedNet desc → seeds 1..N (N = size/2).
 * 2. Fixed tree per size (NO reseed). Every main-bracket round is best-of-7:
 *      4  → [ConfFinals: 2, Final: 1]
 *      8  → [Semis: 4, ConfFinals: 2, Final: 1]
 *      12 → seeds 1-2 BYE; seeds 3-6 play an opening round (3v6,4v5); then
 *           [Open: 4, Semis: 4, ConfFinals: 2, Final: 1] (byes enter the semis)
 *      16 → [R1: 8, Semis: 4, ConfFinals: 2, Final: 1]  (UNCHANGED original)
 *      20 → per-conference NBA play-in (single games) decides seeds 7 & 8, then a
 *           normal 8-team conference bracket. Play-in games live in `playIn`, not
 *           `rounds`, so they're EXCLUDED from displayed W-L.
 * 3. Each series: higher seed = home court. Per game, adjusted net comes from the
 *    breakdown; the winner is the higher adj; recovery carry flows from the
 *    team's previous series; fatigue grows within the series; luck is seeded.
 */
export function simulateBracket(
  teams: TournamentTeam[],
  seedKey: string,
  statNorms: StatNorms,
  cfg: TournamentConfig = TOURNAMENT_CONFIG,
  size: BracketSize = 16,
): BracketResult {
  if (!VALID_SIZES.has(size)) {
    throw new Error(`simulateBracket: unsupported size ${size} (must be 4/8/12/16/20)`);
  }
  if (teams.length !== size) {
    throw new Error(`simulateBracket requires exactly ${size} teams, got ${teams.length}`);
  }
  const half = size / 2; // conference size N

  const byStrength = (a: TournamentTeam, b: TournamentTeam) =>
    b.seedNet - a.seedNet || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  // ---- 1. STRENGTH-BALANCED SNAKE seeding. ----
  // Strength (seedNet) is the PRIMARY key: sort ALL teams high-to-low by seedNet
  // (id tie-break) FIRST. Then SERPENTINE them into the two conferences so the
  // bracket is FAIR — the two STRONGEST teams must land in DIFFERENT conferences
  // (they can only meet in the Final, never round 1), and each conference gets a
  // balanced spread of strength.
  //
  // Snake pattern over the strength-sorted list (index → conference):
  //   0→E, 1→W, 2→W, 3→E, 4→E, 5→W, 6→W, 7→E, …  (i%4 ∈ {0,3} → East else West)
  // For any even `size` this fills both conferences to exactly `half`, puts the #1
  // and #2 overall as the two conferences' #1 seeds, and (re-sorting each side by
  // strength below) keeps seeds WITHIN a conference in seedNet order.
  //
  // (Region affinity / regionScore is intentionally NOT used to assign conferences
  // anymore: affinity could stack the two best teams into the same conference, so
  // the field's two strongest played in round 1 while the Final was decided
  // against a weak team. A balanced snake is the standard fair-bracket seeding.)
  const byStrengthAll = [...teams].sort(byStrength);
  const eastRaw: TournamentTeam[] = [];
  const westRaw: TournamentTeam[] = [];
  byStrengthAll.forEach((t, i) => {
    const toEast = i % 4 === 0 || i % 4 === 3;
    (toEast ? eastRaw : westRaw).push(t);
  });

  const seedConf = (raw: TournamentTeam[], conference: Conference) => {
    const sorted = [...raw].sort(byStrength);
    return sorted.map((t, i) => ({
      team: t,
      bracket: {
        id: t.id,
        name: t.name,
        isGhost: t.isGhost,
        conference,
        seed: i + 1, // 1..N
        seedNet: t.seedNet,
        roster: t.roster,
        sixthMan: t.sixthManInfo,
      } as BracketTeam,
    }));
  };

  const east = seedConf(eastRaw, "East");
  const west = seedConf(westRaw, "West");
  const teamsOut: BracketTeam[] = [...east, ...west].map((e) => e.bracket);
  // teamId → BracketTeam, so play-in losers can be flagged after the fact.
  const bracketById = new Map(teamsOut.map((b) => [b.id, b] as const));

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

  const rounds: SeriesResult[][] = [];
  // Track how each team's last series ended (games over the bo7 minimum) for the
  // next round's recovery carry. The play-in writes here too (its winners carry
  // play-in fatigue straight into round 1 with NO recovery — see below).
  const lastGamesOver = new Map<string, number>();
  // Some teams' carry must reflect a best-of-1 (play-in), so record each team's
  // previous series length directly: gamesPlayed (4..7) or 1 (play-in), 0 if none.
  const lastGamesPlayed = new Map<string, number>();
  // Play-in survivors (size 20 only) carry play-in fatigue into round 1 via the
  // EXPLICIT `recoveryCarryFromPlayIn` path — NOT the best-of-7 recovery table,
  // which would otherwise treat their 1-game play-in as a sweep and grant a full
  // (carry-0) reset. Membership here routes a team to that explicit path once.
  const playInSurvivors = new Set<string>();

  // A "slot" carries the surviving team plus whatever its bracket entry was.
  type Slot = { team: TournamentTeam };

  const playRound = (
    matchups: [Slot, Slot][],
    bestOf: BestOf,
    round: number,
    confOffset: number, // so East/West series indices don't collide within a round
  ): { series: SeriesResult[]; winners: Slot[] } => {
    const series: SeriesResult[] = [];
    const winners: Slot[] = [];
    matchups.forEach(([sa, sb], idx) => {
      // Higher seed = the team with the better seedNet (tie-break id) = home court.
      const [hi, lo] =
        byStrength(sa.team, sb.team) <= 0 ? [sa.team, sb.team] : [sb.team, sa.team];
      // Games the team's PREVIOUS series went, or 0 if it hasn't played yet.
      // For bo7 series this is gamesOverMin + 4; for a play-in winner it's the
      // single play-in game (recorded directly in lastGamesPlayed). A team coming
      // off a BYE has no prior series → 0 → no carry.
      const gamesPlayedPrev = (id: string) => lastGamesPlayed.get(id) ?? 0;
      // Play-in survivors enter R1 via the explicit play-in carry (no recovery);
      // everyone else uses the standard series-length recovery table.
      const carryFor = (t: TournamentTeam) =>
        playInSurvivors.has(t.id)
          ? recoveryCarryFromPlayIn(t, cfg)
          : recoveryCarry(t, gamesPlayedPrev(t.id), cfg);
      const carry: Record<string, number> = {
        [hi.id]: carryFor(hi),
        [lo.id]: carryFor(lo),
      };
      const statics = computeStatics(hi, lo, carry);
      const { result, gamesOverMin } = playSeries(
        hi, lo, bestOf, statics, seedKey, round, confOffset + idx, cfg,
      );
      series.push(result);
      const played = result.games.length;
      for (const id of Object.keys(gamesOverMin)) {
        lastGamesOver.set(id, gamesOverMin[id]);
        lastGamesPlayed.set(id, played);
      }
      const winId = result.winnerId;
      winners.push({ team: byId.get(winId)! });
    });
    return { series, winners };
  };

  // ---- 0. (size 20 only) NBA-style conference play-in. ----
  // 7v8 → winner is the 7 seed. 9v10 → its winner then visits the LOSER of 7v8
  // for the 8 seed (NBA format). Single games (best-of-1). Play-in games AFFECT
  // fatigue/advancement but are EXCLUDED from displayed W-L (they go in `playIn`,
  // not `rounds`); the 8-seed game's loser is flagged `lostPlayIn`. Winners get
  // NO recovery before round 1 — the single game's fatigue (game 1 = 0 anyway)
  // and, more importantly, the carry-from-prior-series machinery treats the
  // play-in as their "previous series" of length 1 with the same recovery rule.
  const playIn: PlayInResult[] = [];
  // After the play-in resolves, `seeded[6]`/`seeded[7]` (the 7 & 8 seeds) are
  // replaced by the play-in winners for the main bracket below.
  const resolvePlayIn = (
    seeded: { team: TournamentTeam }[],
    conference: Conference,
    confOffset: number, // distinct series indices for East/West within round 0
  ): { team: TournamentTeam }[] => {
    const s7 = seeded[6].team, s8 = seeded[7].team;
    const s9 = seeded[8].team, s10 = seeded[9].team;
    // A play-in game reuses playSeries as a best-of-1; statics carry 0 (no prior
    // series feeds these). round = 0 keeps its RNG seeds distinct from round 1.
    const single = (a: TournamentTeam, b: TournamentTeam, idx: number) => {
      const [hi, lo] = byStrength(a, b) <= 0 ? [a, b] : [b, a];
      const carry: Record<string, number> = { [hi.id]: 0, [lo.id]: 0 };
      const statics = computeStatics(hi, lo, carry);
      const { result } = playSeries(hi, lo, 1, statics, seedKey, 0, confOffset + idx, cfg);
      // Record the play-in as each entrant's previous series (length 1). The
      // surviving 7/8 seeds are marked as play-in survivors below so round 1 uses
      // the EXPLICIT `recoveryCarryFromPlayIn` path (no recovery from the play-in
      // game), NOT the best-of-7 recovery table — which, keyed on series length,
      // would clamp this 1-game series to a 4-game sweep and grant a 100% reset.
      lastGamesPlayed.set(hi.id, 1);
      lastGamesPlayed.set(lo.id, 1);
      lastGamesOver.set(hi.id, 1 - CLINCH[7]);
      lastGamesOver.set(lo.id, 1 - CLINCH[7]);
      return { hi, lo, result };
    };

    // Game A: 7v8 → winner is the 7 seed; loser drops to the 8-seed game.
    const a = single(s7, s8, 0);
    const sevenWinId = a.result.winnerId;
    const sevenLoserId = sevenWinId === a.hi.id ? a.lo.id : a.hi.id;
    playIn.push({
      conference, forSeed: 7, hiId: a.hi.id, loId: a.lo.id,
      game: a.result.games[0], winnerId: sevenWinId,
    });
    // Game B: 9v10 → winner advances to the 8-seed game.
    const b = single(s9, s10, 1);
    const nineWinId = b.result.winnerId;
    playIn.push({
      conference, forSeed: 8 /* feeder; the deciding 8-seed game is C */, hiId: b.hi.id, loId: b.lo.id,
      game: b.result.games[0], winnerId: nineWinId,
    });
    // Game C: loser of (7v8) HOSTS winner of (9v10) for the 8 seed.
    const c = single(byId.get(sevenLoserId)!, byId.get(nineWinId)!, 2);
    const eightWinId = c.result.winnerId;
    const eightLoserId = eightWinId === c.hi.id ? c.lo.id : c.hi.id;
    playIn.push({
      conference, forSeed: 8, hiId: c.hi.id, loId: c.lo.id,
      game: c.result.games[0], winnerId: eightWinId,
    });
    // The 9/10 entrant that lost game B, and the loser of game C, are eliminated.
    // Only the game-C loser is flagged "Lost Play-In" (it reached the 8-seed game
    // — the closest near-miss the UI surfaces); the 9v10 loser is out outright too.
    const bLoserId = nineWinId === b.hi.id ? b.lo.id : b.hi.id;
    for (const id of [eightLoserId, bLoserId]) {
      const bt = bracketById.get(id);
      if (bt) bt.lostPlayIn = true;
    }
    // The two survivors (the resolved 7 & 8 seeds) carry play-in fatigue into
    // round 1 with NO recovery — route them through `recoveryCarryFromPlayIn`.
    playInSurvivors.add(sevenWinId);
    playInSurvivors.add(eightWinId);
    // Resolved 7 & 8 seeds replace slots 6 & 7; seeds 9/10 are gone.
    const out = seeded.slice(0, 6);
    out.push({ team: byId.get(sevenWinId)! });
    out.push({ team: byId.get(eightWinId)! });
    return out;
  };

  // ---- 2/3. Per-size conference tree, then the Final. ----
  // Each conference plays its rounds; the two conference champions meet in the
  // Final. Round NUMBERS and per-round series INDICES are chosen so size 16 is
  // byte-identical to the original (R1 idx 0..3 E / 4..7 W; semis 0..1 E / 2..3 W;
  // conf finals 0 E / 1 W; Final 0).

  // Conference bracket: returns { confRounds, champion } given seeded slots 0..N-1.
  // `roundBase` is the round number of the conference's FIRST played round.
  type ConfPlan = {
    rounds: SeriesResult[][]; // one entry per conference round, in order
    champion: Slot;
  };

  // Pairing helpers (0-based seed indices within the conference).
  const pairBySeeds = (seeded: { team: TournamentTeam }[], pairs: [number, number][]): [Slot, Slot][] =>
    pairs.map(([a, b]) => [{ team: seeded[a].team }, { team: seeded[b].team }]);
  // Re-pair a list of winners into adjacent pairs: [w0,w1],[w2,w3],…
  const pairAdjacent = (w: Slot[]): [Slot, Slot][] => {
    const out: [Slot, Slot][] = [];
    for (let i = 0; i < w.length; i += 2) out.push([w[i], w[i + 1]]);
    return out;
  };

  // Play one conference to its champion for the given size, recording each round.
  // eastOffsets/westOffsets give each round its confOffset so E/W indices don't
  // collide. Returns the per-round series (already merged is done by caller).
  const playConference = (
    seededIn: { team: TournamentTeam }[],
    confOffsets: number[], // confOffset per played round (length = #rounds)
  ): ConfPlan => {
    const confRounds: SeriesResult[][] = [];
    let seeded = seededIn;
    let roundIdx = 0; // index into confOffsets / into the conference's round list

    if (size === 4) {
      // 2 per conf: a single conference final (round 1), then the Final (round 2).
      const r = playRound(pairBySeeds(seeded, [[0, 1]]), 7, 1, confOffsets[roundIdx]);
      confRounds.push(r.series);
      return { rounds: confRounds, champion: r.winners[0] };
    }

    if (size === 8) {
      // 4 per conf: semis (1v4,2v3 → round 1), conf final (round 2), Final (3).
      const semis = playRound(pairBySeeds(seeded, [[0, 3], [1, 2]]), 7, 1, confOffsets[roundIdx++]);
      confRounds.push(semis.series);
      const cf = playRound(pairAdjacent(semis.winners), 7, 2, confOffsets[roundIdx++]);
      confRounds.push(cf.series);
      return { rounds: confRounds, champion: cf.winners[0] };
    }

    if (size === 12) {
      // 6 per conf: seeds 1-2 BYE. Opening round 3v6,4v5 (round 1). Winners join
      // seeds 1,2 in the semis (round 2): seed1 vs winner(4v5), seed2 vs winner(3v6).
      // Then conf final (round 3), Final (round 4). Opening-round winners carry
      // fatigue into the semis; the two bye teams enter fresh (no prior series).
      const open = playRound(pairBySeeds(seeded, [[2, 5], [3, 4]]), 7, 1, confOffsets[roundIdx++]);
      confRounds.push(open.series);
      // open.winners[0] = winner of 3v6, open.winners[1] = winner of 4v5.
      const semiMatch: [Slot, Slot][] = [
        [{ team: seeded[0].team }, open.winners[1]], // seed 1 vs winner(4v5)
        [{ team: seeded[1].team }, open.winners[0]], // seed 2 vs winner(3v6)
      ];
      const semis = playRound(semiMatch, 7, 2, confOffsets[roundIdx++]);
      confRounds.push(semis.series);
      const cf = playRound(pairAdjacent(semis.winners), 7, 3, confOffsets[roundIdx++]);
      confRounds.push(cf.series);
      return { rounds: confRounds, champion: cf.winners[0] };
    }

    // size 16 or 20 → an 8-team conference bracket (for 20, `seeded` is already
    // the post-play-in 8 seeds). Pairings 1v8,4v5,3v6,2v7 → semis → conf final.
    // For size 16 this is byte-identical to the original (round numbers 1/2/3).
    const R1_PAIRS: [number, number][] = [[0, 7], [3, 4], [2, 5], [1, 6]];
    const r1 = playRound(pairBySeeds(seeded, R1_PAIRS), 7, 1, confOffsets[roundIdx++]);
    confRounds.push(r1.series);
    // semis: (1v8 vs 4v5) and (3v6 vs 2v7).
    const semis = playRound(pairAdjacent(r1.winners), 7, 2, confOffsets[roundIdx++]);
    confRounds.push(semis.series);
    const cf = playRound(pairAdjacent(semis.winners), 7, 3, confOffsets[roundIdx++]);
    confRounds.push(cf.series);
    return { rounds: confRounds, champion: cf.winners[0] };
  };

  // For size 20, resolve each conference's play-in BEFORE seeding into the tree.
  let eastSeeded = east as { team: TournamentTeam }[];
  let westSeeded = west as { team: TournamentTeam }[];
  if (size === 20) {
    // East play-in series indices 0..2, West 3..5 within round 0.
    eastSeeded = resolvePlayIn(eastSeeded, "East", 0);
    westSeeded = resolvePlayIn(westSeeded, "West", 3);
  }

  // confOffsets per conference round. East rounds use offset 0; West offsets are
  // shifted by the number of East series in that same round so indices don't
  // collide. The per-round East series counts (= West shift) by size:
  //   4 → [1];  8 → [2,1];  12 → [2,2,1];  16/20 → [4,2,1].
  const westShiftByRound: number[] =
    size === 4 ? [1] :
    size === 8 ? [2, 1] :
    size === 12 ? [2, 2, 1] :
    [4, 2, 1];
  const eastOffsets = westShiftByRound.map(() => 0);
  const westOffsets = [...westShiftByRound];

  const eastPlan = playConference(eastSeeded, eastOffsets);
  const westPlan = playConference(westSeeded, westOffsets);

  // Merge conference rounds pairwise (East series first, then West) — matches the
  // original [E…, W…] ordering within each round for size 16.
  for (let i = 0; i < eastPlan.rounds.length; i++) {
    rounds.push([...eastPlan.rounds[i], ...westPlan.rounds[i]]);
  }

  // The Final: round number is one past the last conference round.
  const finalRound = eastPlan.rounds.length + 1;
  const fin = playRound([[eastPlan.champion, westPlan.champion]], 7, finalRound, 0);
  rounds.push(fin.series);

  const championId = fin.series[0].winnerId;
  const championName = byId.get(championId)!.name;

  const result: BracketResult = { teams: teamsOut, rounds, championId, championName, size };
  if (size === 20) result.playIn = playIn;
  return result;
}
