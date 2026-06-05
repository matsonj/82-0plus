// Shared types for the 82-0+ game.
import type { Role } from "./positions";

/**
 * Public, client-safe player shape returned by /api/players. Deliberately omits
 * Game Quality (`value`) and the scoring-only inputs (FGA/FG3A/FG3M/FTA/TOV) so
 * those never reach the browser. Display stats + mpg are populated in Classic
 * mode and null in HoopIQ.
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
  netRating: number; // team point differential per game (after all adjustments)
  baseNet: number; // GQ-derived net rating BEFORE construction adjustments
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
  };
}

export type GameMode = "classic" | "hoopiq";

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
 *  Counting stats are per-36; fgPct/ftPct are 0–1 rates; `tov` is a NEGATIVE
 *  stat (lower is better) and is sign-inverted wherever "better" is judged. */
export type StatKey =
  | "pts" | "reb" | "ast" | "stl" | "blk" | "fg3m" | "fgPct" | "ftPct" | "tov";

export const STAT_KEYS: StatKey[] = [
  "pts", "reb", "ast", "stl", "blk", "fg3m", "fgPct", "ftPct", "tov",
];

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
  sixthManBuff: number;
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
  breakdown: Record<string, GameBreakdown>; // keyed by team id (home & away)
}

/** A playoff series. `hi` = higher seed (owns home court under 2-2-1 / 2-3-2). */
export interface SeriesResult {
  hiId: string;
  loId: string;
  bestOf: 5 | 7;
  games: GameResult[];
  winnerId: string;
  scoreHi: number;
  scoreLo: number;
}

/** Lightweight team identity carried into the stored bracket for display. */
export interface BracketTeam {
  id: string;
  name: string;
  isGhost: boolean;
  conference: Conference;
  seed: number; // 1..8 within conference
  seedNet: number; // seeding net rating (NO buffs)
}

/** The full resolved bracket — the stored, immutable artifact (`bracket_json`). */
export interface BracketResult {
  teams: BracketTeam[]; // all 16, with conference + seed
  rounds: SeriesResult[][]; // [R1: 8 series, R2: 4, ConfFinals: 2, Final: 1]
  championId: string;
  championName: string;
}

/** Identifies the human's own team within a stored bracket (for the results view). */
export interface TournamentYou {
  id: string;
  name: string;
  conference: Conference;
  seed: number;
  reachedRound: number; // 0 = lost R1 … 4 = won the Final (champion)
}

/** POST /api/tournament/submit request body. */
export interface TournamentSubmitRequest {
  name: string;
  pin: string;
  mode: GameMode; // which tournament: classic teams play classic, hoopiq play hoopiq
  roster: SimPick[]; // the five starters (slots 0..4 = [G,FLEX,W,FLEX,B])
  captainSlot: number; // 0..4, index into the five
  sixthPick: { entity_id: string; team: string; decade: number }; // bench player (no slot)
}

/** Response for both /api/tournament/submit and /api/tournament/lookup. */
export interface TournamentRunResponse {
  bracket: BracketResult;
  you: TournamentYou;
}
