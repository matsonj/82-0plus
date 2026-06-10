// Pure, client-safe rules for a private tournament's six-slot board.
//
// This module is the canonical home for the board's TYPES, CONSTANTS, and the
// PURE manual-board validator. It has NO Node/DB imports (and no "server-only"),
// so it can be imported by both the server (lib/privateBoard.ts, which layers an
// async playability check on top) and the client (the create form, for instant
// feedback). Keeping a single copy means the client and server can never drift
// on the board rule (slot count, distinct teams, per-decade cap, error strings).

// 5 starter slots in lineup order + 1 bench (sixth man). Mirrors daily.ts.
export const PRIVATE_STARTER_SLOTS = 5;
export const PRIVATE_TOTAL_SLOTS = PRIVATE_STARTER_SLOTS + 1;

// A manual board may repeat a decade at most this many times (six distinct
// teams, but e.g. two 1990s squads is fine; three is not).
export const MAX_PER_DECADE = 2;

export interface PrivateSlot {
  team: string;
  decade: number;
}

export interface PrivateBoard {
  slots: PrivateSlot[]; // exactly 5 starter slots, in lineup order [G,FLEX,W,FLEX,B]
  benchSlot: PrivateSlot; // the 6th (sixth man) — always present on a private board
  mode: "blind" | "manual";
}

/**
 * PURE validator for an admin-built manual board. Enforces, in order:
 *   1. exactly 6 slots,
 *   2. each slot well-formed (non-empty team, a numeric decade),
 *   3. six DISTINCT NBA teams (by abbreviation),
 *   4. no decade appears more than twice.
 * Does NOT check positional depth (per spec — that's not pre-validated; an empty
 * combo is caught only by the async playability check in lib/privateBoard.ts).
 * The first five slots are starters in the admin's order; the sixth is the bench.
 */
export function validateManualBoard(
  slots: PrivateSlot[],
): { ok: true; board: PrivateBoard } | { ok: false; reason: string } {
  if (slots.length !== PRIVATE_TOTAL_SLOTS) {
    return { ok: false, reason: "pick exactly 6 teams" };
  }
  for (const s of slots) {
    if (!s || !s.team || !Number.isFinite(s.decade)) {
      return { ok: false, reason: "every slot needs a team and a decade" };
    }
  }

  const teams = new Set(slots.map((s) => s.team));
  if (teams.size !== PRIVATE_TOTAL_SLOTS) {
    return { ok: false, reason: "six distinct teams — no repeats" };
  }

  const perDecade = new Map<number, number>();
  for (const s of slots) {
    const n = (perDecade.get(s.decade) ?? 0) + 1;
    perDecade.set(s.decade, n);
    if (n > MAX_PER_DECADE) {
      return { ok: false, reason: "a decade can appear at most twice" };
    }
  }

  return {
    ok: true,
    board: {
      slots: slots.slice(0, PRIVATE_STARTER_SLOTS),
      benchSlot: slots[PRIVATE_STARTER_SLOTS],
      mode: "manual",
    },
  };
}
