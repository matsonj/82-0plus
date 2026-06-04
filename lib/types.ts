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
}

/** Output of the bespoke scoring model. */
export interface SimResult {
  wins: number;
  losses: number;
  perfect: boolean;
  netRating: number; // team point differential per game
  meanGQ: number; // era-neutral team quality (avg peak GQ)
  pf: number; // implied points for (display)
  pa: number; // implied points allowed (display)
  // fit factors in [0,1]
  usageFactor: number;
  pAst: number;
  p3: number;
  defenseFactor: number;
  // net-rating points each penalty cost (and the synergy bonus)
  usagePen: number;
  spacingPen: number;
  playmakingPen: number;
  defensePen: number;
  balancePen: number;
  synergyBonus: number;
  roleCounts: { G: number; W: number; B: number };
  totalPoss: number;
  totalAst: number;
  total3m: number;
  totalStocks: number;
}

export type GameMode = "classic" | "hoopiq";
