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
  positions: Role[]; // eligible lineup roles, computed server-side
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
  synergyBonus: number;
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
