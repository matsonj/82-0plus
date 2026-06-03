// Shared types for the 82-0+ game.
import type { Role } from "./positions";

/** The 5 displayed box-score averages plus the hidden usage inputs the sim needs. */
export interface PlayerLine {
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  fga: number;
  fg3a: number;
  fg3m: number;
  fta: number;
  tov: number;
}

/** A selectable player for a given team+decade. `value` = peak season-median Game Quality. */
export interface PlayerOption extends PlayerLine {
  entity_id: string;
  player_name: string;
  best_season: number;
  value: number; // peak season-median Game Quality — used for scoring, never shown
  gp: number;
  mpg: number; // minutes per game — the visible sort key
}

/**
 * A slot the user is drafting: a decade, a required position, the rolled team,
 * and (once picked) the player. The position plan guarantees the final roster
 * has ≥1 G/W/B and ≤3 of any one position.
 */
export interface DraftSlot {
  decade: number;
  pos: Role;
  team: string | null;
  player: PlayerOption | null;
}

/** A filled roster entry handed to the simulation. */
export interface RosterEntry extends PlayerLine {
  entity_id: string;
  player_name: string;
  best_season: number;
  decade: number;
  team: string;
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
