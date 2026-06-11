// Shared types for the 82-0+ game.
import type { Role } from "./positions";

/**
 * Public, client-safe player shape returned by /api/players. Deliberately omits
 * Game Quality (`value`) and the scoring-only inputs (FGA/FG3A/FG3M/FTA/TOV) so
 * those never reach the browser. Display stats + mpg are populated in Classic
 * mode and null in Ranked.
 */
export interface PublicPlayer {
  entity_id: string;
  player_name: string;
  best_season: number;
  positions: Role[]; // eligible lineup roles (G/W/B), computed server-side
  pos: string | null; // real b-ref position label for display (e.g. "C-F")
  allDef: number | null; // All-Defensive team that season (1/2/0); Classic only
  mpg: number | null;
  pts: number | null;
  reb: number | null;
  ast: number | null;
  stl: number | null;
  blk: number | null;
}

/**
 * What the client submits to /api/simulate — identifiers + the lineup slot the
 * player fills (index into the fixed [G, FLEX, W, FLEX, B] board), never stats.
 */
export interface SimPick {
  entity_id: string;
  team: string;
  decade: number;
  slot: number;
}

/** Server-hydrated roster line returned by /api/simulate for the results display. */
export interface SimRosterLine {
  entity_id: string;
  player_name: string;
  team: string;
  best_season: number;
  positions: Role[]; // eligible lineup roles (G/W/B) — for the player card's pills
  pts: number;
  reb: number;
  ast: number;
  gq: number; // Game Quality as a 0–100 integer (revealed only on the summary)
  allDef: number; // All-Defensive team that season: 1 (1st), 2 (2nd), 0 (none)
}

/** Output of the bespoke scoring model. */
export interface SimResult {
  wins: number;
  losses: number;
  perfect: boolean;
  seedNet: number; // unrounded net rating used for tournament seeding/tier math
  netRating: number; // team point differential per game (after all adjustments)
  baseNet: number; // GQ-derived net rating BEFORE construction adjustments
  teamFit: number; // all construction factors collapsed (= netRating − baseNet − defBuff), after the floor
  meanGQ: number; // era-neutral team quality (avg peak GQ)
  pf: number; // implied points for (display)
  pa: number; // implied points allowed (display)
  // fit factors / counts
  usageFactor: number; // possession-budget headroom (1 = no shot-overlap problem)
  assistFactor: number; // assisted-FG% vs target (1 = shares the ball)
  nonShooters: number; // count of FT/3P "non-shooters" in the five
  totalAst: number; // team assists (for display)
  assistedPct: number; // share of made FGs that were assisted (0–1)
  // net-rating points each adjustment moved (penalties subtract, synergy adds)
  usagePen: number;
  outsidePen: number;
  ballhogPen: number;
  balancePen: number;
  sizePen: number; // too-short penalty (total height, All-Def adds effective inches)
  defBuff: number; // All-Defense margin bonus (GQ undercounts defense)
  synergyBonus: number;
  avgHeight: number; // team average height in inches (display)
  allDefCount: number; // # All-Defensive selections on the five (display)
  roleCounts: { G: number; W: number; B: number };
  totalPoss: number;
  // Aggregate team box score (sum of the five starters' per-game lines), all
  // whole integers. fgPct/ftPct are attempt-weighted whole percentages.
  teamBox: {
    pts: number;
    reb: number;
    ast: number;
    stl: number;
    blk: number;
    fgPct: number;
    ftPct: number;
    tov: number;
    fg3m: number; // made threes (9th category; shown on the daily share card)
  };
}

export type GameMode = "classic" | "hoopiq";

// Which tournament pool a team belongs to. Distinct from GameMode (which only
// governs stat visibility): "daily" teams hide stats like hoopiq but compete in
// their own date-partitioned pool against daily-constrained ghosts.
export type TournamentMode = "classic" | "hoopiq" | "daily";

// ============================================================================
// Tournament Edition
//
// Output/wire types only — they never reference ScoringPlayer, so they live here
// safely (scoring.ts imports from this file). The engine's INPUT type
// (`TournamentTeam`, which carries ScoringPlayer[]) is defined in lib/tournament.ts
// to avoid a circular import.
// ============================================================================

export type Conference = "East" | "West";

/** The nine Game-Quality stat categories used by the tournament stat layer.
 *  Counting stats are per-36; fgV/ftV are volume-weighted shooting values
 *  ((pct − baseline)·attempts, like GQ's fg_v/ft_v); `tov` is a NEGATIVE
 *  stat (lower is better) and is sign-inverted wherever "better" is judged. */
// Eight era-stable categories. `fg3m` is deliberately EXCLUDED: pre-1980 players
// have a fabricated 3PM estimate on zero attempts (incoherent across eras), and
// made threes are already credited inside fgV (they're field goals). stl/blk/tov
// are backfilled to era-comparable values, so they stay.
export type StatKey =
  | "pts" | "reb" | "ast" | "stl" | "blk" | "fgV" | "ftV" | "tov";

export const STAT_KEYS: StatKey[] = [
  "pts", "reb", "ast", "stl", "blk", "fgV", "ftV", "tov",
];

// Shooting "value" baselines, mirroring the Game Quality view: a category's
// value is (pct − baseline) × attempts, so it rewards efficient VOLUME, not bare
// rate. fg_v = (fg% − 0.47)·FGA, ft_v = (ft% − 0.80)·FTA.
export const FG_BASELINE = 0.47;
export const FT_BASELINE = 0.8;

/** `tov` is the only category where a lower value is better. */
export const NEGATIVE_STATS: ReadonlySet<StatKey> = new Set<StatKey>(["tov"]);

/** Population mean + std for each per-36 category, for the captain's z-scores. */
export interface StatNorms {
  mean: Record<StatKey, number>;
  std: Record<StatKey, number>;
}

/** Itemized net-margin modifiers for ONE team in ONE game (display + tuning).
 *  `fatigue` and `recoveryCarry` are stored as positive amounts that are
 *  SUBTRACTED; `adj` is the resulting adjusted net the game is decided on. */
export interface GameBreakdown {
  seedNet: number;
  gameScoreBuff: number;
  heightBuff: number;
  homeBuff: number;
  fatigue: number;
  recoveryCarry: number;
  randomFactor: number;
  adj: number;
}

/** One game in a series. `margin = adj(home) - adj(away)` (positive ⇒ home won). */
export interface GameResult {
  gameNo: number;
  homeId: string;
  awayId: string;
  winnerId: string;
  margin: number;
  homeScore: number; // display box score (~95–105 base, split by the margin); never tied
  awayScore: number;
  // Per-team modifier breakdown (the "WHY"). Tuning/debug data — stripped at the
  // API boundary in normal play (see stripBreakdown), so it's optional here.
  breakdown?: Record<string, GameBreakdown>; // keyed by team id (home & away)
}

/** A playoff series. `hi` = higher seed (owns home court under 2-2-1 / 2-3-2).
 *  `bestOf` is 7 for every main-bracket round; 1 only appears internally for the
 *  size-20 play-in (which is surfaced as a PlayInResult, not in `rounds`). */
export interface SeriesResult {
  hiId: string;
  loId: string;
  bestOf: 1 | 5 | 7;
  games: GameResult[];
  winnerId: string;
  scoreHi: number;
  scoreLo: number;
}

/** One player on a team's displayed roster (for the expandable team panel). */
export interface BracketPlayer {
  name: string;
  team: string; // 3-letter franchise
  season: number; // best_season year (e.g. 1996)
  captain?: boolean; // true on the one starter designated captain
}

/** Lightweight team identity carried into the stored bracket for display. */
export interface BracketTeam {
  id: string;
  name: string;
  isGhost: boolean;
  conference: Conference;
  seed: number; // 1..N within conference (N = size/2)
  seedNet: number; // seeding net rating (NO buffs)
  // Roster for the expandable team panel. Optional: brackets stored before this
  // field shipped won't carry it (the viewer degrades gracefully).
  roster?: BracketPlayer[]; // the five starters, slot order [G,FLEX,W,FLEX,B]
  sixthMan?: BracketPlayer; // the bench player
  // Size-20 play-in flag: true if this team lost its conference play-in game and
  // never reached the main bracket. The UI shows "Lost Play-In" next to the
  // team's regular-season record. Absent (undefined) for every other size/team.
  lostPlayIn?: boolean;
}

/** One size-20 play-in matchup: a SINGLE game (best-of-1, modeled like a real
 *  NBA play-in game). `forSeed` is the bracket seed being decided (7 or 8) so the
 *  UI can label it; the loser of the 8-seed game is flagged `lostPlayIn` on its
 *  BracketTeam. Play-in games AFFECT advancement + fatigue but are EXCLUDED from
 *  a team's displayed playoff W-L (they live here, not in `rounds`). */
export interface PlayInResult {
  conference: Conference;
  // The seed at stake: 7 for the 7v8 game, 8 for the deciding 8-seed game. The
  // 9v10 FEEDER also carries 8 (its winner advances to the 8-seed decider — it
  // doesn't seat a seed directly), so the UI should distinguish the feeder from
  // the decider by game order within a conference, not by forSeed alone.
  forSeed: number;
  hiId: string; // higher-seeded entrant (home court)
  loId: string;
  game: GameResult; // the single play-in game
  winnerId: string;
}

/** The full resolved bracket — the stored, immutable artifact (`bracket_json`). */
export interface BracketResult {
  teams: BracketTeam[]; // all `size` teams, with conference + seed
  rounds: SeriesResult[][]; // main bracket, e.g. size 16 → [R1: 8, R2: 4, ConfFinals: 2, Final: 1]
  championId: string;
  championName: string;
  // Bracket size: one of 4 | 8 | 12 | 16 | 20. Optional + defaulted at the read
  // site so brackets stored before this field shipped (always size 16) still load.
  size?: number;
  // Size-20 only: the per-conference play-in games (single games, EXCLUDED from
  // displayed W-L since they aren't in `rounds`). Absent for every other size.
  playIn?: PlayInResult[];
}

/** Identifies the human's own team within a stored bracket (for the results view). */
export interface TournamentYou {
  id: string;
  name: string;
  conference: Conference;
  seed: number;
  reachedRound: number; // 0 = lost R1 … 4 = won the Final (champion)
}

/** POST /api/tournament/submit request body. `name`+`pin` are the USER account
 *  (old-school: same name+pin → another team on that account); `teamName` is this
 *  entry's franchise name, shown in the bracket. */
export interface TournamentSubmitRequest {
  name: string; // username (account handle)
  pin: string;
  teamName: string; // this team's display name
  mode: GameMode; // which tournament: classic teams play classic, hoopiq play hoopiq
  runToken: string; // signed proof that /api/simulate scored this five
  roster: SimPick[]; // the five starters (slots 0..4 = [G,FLEX,W,FLEX,B])
  captainSlot: number; // 0..4, index into the five
  sixthPick: { entity_id: string; team: string; decade: number }; // bench player (no slot)
}

/** Response for /api/tournament/submit and /api/tournament/team (a single run). */
export interface TournamentRunResponse {
  bracket: BracketResult;
  you: TournamentYou;
  teamId?: string; // the persisted team this run was saved as
  // For the (spoiler-free) daily share card: the five's reg-season 9-stat box and
  // the ACTUAL avg playoff scoring margin.
  teamBox?: SimResult["teamBox"];
  realizedMargin?: number;
}

/** One memorialized team in a user's list (lightweight — no bracket payload). */
export interface TournamentTeamSummary {
  teamId: string;
  teamName: string;
  mode: TournamentMode;
  recordW: number;
  recordL: number;
  realizedMargin: number; // avg point margin in the playoffs, e.g. +5.2
  championName: string;
  reachedRound: number; // 0 = lost R1 … 4 = champion
  seedNet: number; // seeding net rating (drives the tier badge)
  dailyDate?: string | null; // YYYY-MM-DD for mode='daily'; null otherwise
  createdAt: string; // ISO timestamp
  roster?: BracketPlayer[]; // the five starters (quick peek)
  sixthMan?: BracketPlayer;
}

/** Response for /api/tournament/lookup — a user (name) and their teams. */
export interface TournamentLookupResponse {
  name: string; // the user handle (normalized)
  teams: TournamentTeamSummary[];
}

/** One private tournament row from POST /api/private-tournament/my — the full
 *  list of tournaments the account has an entry in (newest first), INCLUDING
 *  viewed-completed ones (unlike /notifications). `needsAttention` drives the
 *  unread dot. */
export interface MyPrivateRow {
  tournamentId: string;
  name: string;
  mode: string;
  modeLabel: string;
  size: number;
  status: "open" | "completed";
  championName: string | null;
  expiresAt: string;
  finalizedAt: string | null;
  viewedFinalAt: string | null;
  entryStatus: string;
  finalRecordW: number | null;
  finalRecordL: number | null;
  finalStatus: string | null;
  provisionalRecordW: number | null;
  provisionalRecordL: number | null;
  provisionalStatus: string | null;
  needsAttention: boolean;
}
