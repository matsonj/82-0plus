// Daily Challenge board — the fixed, date-seeded set of (team, decade) slots
// every player drafts from on a given day. Extracted from app/api/daily so the
// tournament submit route can RE-DERIVE the same board server-side and verify a
// daily entry's picks against it (the daily equivalent of a signed roll receipt:
// the board is deterministic, so picks that don't match it are forgeries).
//
// The board is 5 starter slots (lineup order [G,FLEX,W,FLEX,B]) plus a 6th BENCH
// slot for the sixth man — the same six a Classic/Ranked team fields. The first
// five are byte-identical to what /api/daily has always produced; the bench is a
// 6th draw appended to the same seeded sequence (so existing days don't shift).

import { buildTeamDecadeBoard } from "./boardGen";
import type { QueryOptions } from "./motherduck";

export const DAILY_STARTER_SLOTS = 5;
// 5 starters + 1 bench (sixth man).
const DAILY_TOTAL_SLOTS = DAILY_STARTER_SLOTS + 1;

export interface DailySlot {
  team: string;
  decade: number;
}

export interface DailyBoard {
  slots: DailySlot[]; // up to 5 starter slots, in lineup order
  benchSlot: DailySlot | null; // the 6th (sixth man); null on a sparse day
}

/**
 * The deterministic daily board for `date` (YYYY-MM-DD). Drafted teams never
 * repeat; used decades decay 90% per use so the slots spread across eras. Uses
 * the SAME FNV hash + mulberry32 seed as the original /api/daily so the first
 * five slots reproduce exactly; the bench is the 6th draw. On a sparse data day
 * it returns as many slots as it can (requireFull: false) — a missing bench
 * becomes a null benchSlot.
 */
export async function computeDailyBoard(
  date: string,
  options: QueryOptions = {},
): Promise<DailyBoard> {
  const all = await buildTeamDecadeBoard({
    seed: `82-0+:${date}`,
    totalSlots: DAILY_TOTAL_SLOTS,
    requireFull: false,
    options,
  });

  return {
    slots: all.slice(0, DAILY_STARTER_SLOTS),
    benchSlot: all[DAILY_STARTER_SLOTS] ?? null,
  };
}
