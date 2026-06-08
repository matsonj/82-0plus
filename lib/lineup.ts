import { canPlay, type RoleInput, type SlotKind } from "./positions";
import type { SimPick } from "./types";

// The fixed lineup board — must mirror the client. Shared by /api/simulate and
// /api/daily/complete so both validate the SAME way (shape + slot legality).
export const LINEUP_KINDS: SlotKind[] = ["G", "FLEX", "W", "FLEX", "B"];

/**
 * Validate the raw submitted roster into exactly five picks: one per lineup slot
 * (all slots, no dupes, in range), distinct players, well-formed team/decade.
 * Returns null on any violation. (Slot LEGALITY by position needs the hydrated
 * players — see `lineupEligible`.)
 */
export function parseLineupPicks(raw: unknown): SimPick[] | null {
  if (!Array.isArray(raw) || raw.length !== LINEUP_KINDS.length) return null;
  const picks: SimPick[] = [];
  const slotsSeen = new Set<number>();
  const idsSeen = new Set<string>();
  for (const item of raw) {
    const r = (item ?? {}) as Record<string, unknown>;
    const entity_id = String(r.entity_id ?? "");
    const team = String(r.team ?? "");
    const decade = Number(r.decade);
    const slot = Number(r.slot);
    if (
      !entity_id ||
      !/^[A-Z]{3}$/.test(team) ||
      !Number.isInteger(decade) ||
      !Number.isInteger(slot) ||
      slot < 0 ||
      slot >= LINEUP_KINDS.length ||
      slotsSeen.has(slot) || // one pick per lineup slot
      idsSeen.has(entity_id) // no duplicate players
    ) {
      return null;
    }
    slotsSeen.add(slot);
    idsSeen.add(entity_id);
    picks.push({ entity_id, team, decade, slot });
  }
  return picks; // length === 5, distinct slots (all of them), distinct players
}

/**
 * Every player must actually be eligible for the lineup slot they claim. `players`
 * are the hydrated rows in the SAME order as `picks` (as hydrateRoster returns).
 */
export function lineupEligible(players: RoleInput[], picks: SimPick[]): boolean {
  for (let i = 0; i < picks.length; i++) {
    if (!canPlay(players[i], LINEUP_KINDS[picks[i].slot])) return false;
  }
  return true;
}
