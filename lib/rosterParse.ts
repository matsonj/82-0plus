// Shared roster-shape parsers for the tournament + private-tournament submit
// paths. Extracted verbatim from app/api/tournament/submit/route.ts so the
// public submit, the private submit, and the private partial-save routes all
// validate a roster's SHAPE identically (5 distinct slots covering
// [G,FLEX,W,FLEX,B], distinct players, well-formed teams; a well-formed sixth
// man). PROVENANCE (receipts / board match), eligibility, and off-list checks
// live in the routes — this module is purely structural and has no I/O.

import type { SlotKind } from "./positions";
import type { SimPick } from "./types";

// Must mirror the client lineup board (same as /api/simulate).
export const KINDS: SlotKind[] = ["G", "FLEX", "W", "FLEX", "B"];

/**
 * 5 entries, distinct slots covering all of [G,FLEX,W,FLEX,B], distinct players,
 * team matches /^[A-Z]{3}$/. Identical logic to /api/simulate's parsePicks.
 */
export function parsePicks(raw: unknown): SimPick[] | null {
  if (!Array.isArray(raw) || raw.length !== KINDS.length) return null;
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
      slot >= KINDS.length ||
      slotsSeen.has(slot) ||
      idsSeen.has(entity_id)
    ) {
      return null;
    }
    slotsSeen.add(slot);
    idsSeen.add(entity_id);
    picks.push({ entity_id, team, decade, slot });
  }
  return picks;
}

export interface SixthPick {
  entity_id: string;
  team: string;
  decade: number;
}

/** Validate the sixth man payload shape; null on malformed input. */
export function parseSixth(raw: unknown): SixthPick | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const entity_id = String(r.entity_id ?? "");
  const team = String(r.team ?? "");
  const decade = Number(r.decade);
  if (!entity_id || !/^[A-Z]{3}$/.test(team) || !Number.isInteger(decade)) {
    return null;
  }
  return { entity_id, team, decade };
}
