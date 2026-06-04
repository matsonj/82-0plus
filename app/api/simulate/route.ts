import { NextRequest } from "next/server";
import { simulateRoster } from "@/lib/scoring";
import { hydrateRoster } from "@/lib/queries";
import { canPlay, type SlotKind } from "@/lib/positions";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import type { SimPick } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Must mirror the client lineup board.
const KINDS: SlotKind[] = ["G", "FLEX", "W", "FLEX", "B"];

function parsePicks(raw: unknown): SimPick[] | null {
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

export async function POST(req: NextRequest) {
  const sessionHint = getSessionHint(req);
  const queryOptions = { sessionHint: sessionHint.value };
  try {
    const body = await req.json();
    const picks = parsePicks(body?.roster);
    if (!picks) {
      return jsonWithSessionHint(
        sessionHint,
        { error: "invalid roster" },
        { status: 400 },
      );
    }

    // Stats + Game Quality come from the server-side index, not the client.
    let scoring, lines, players;
    try {
      ({ scoring, lines, players } = await hydrateRoster(picks, queryOptions));
    } catch {
      return jsonWithSessionHint(
        sessionHint,
        { error: "unknown roster pick" },
        { status: 400 },
      );
    }

    // Every player must actually be eligible for the lineup slot they claim.
    for (let i = 0; i < picks.length; i++) {
      if (!canPlay(players[i], KINDS[picks[i].slot])) {
        return jsonWithSessionHint(
          sessionHint,
          { error: "illegal lineup" },
          { status: 400 },
        );
      }
    }

    const result = simulateRoster(scoring);
    return jsonWithSessionHint(sessionHint, { result, roster: lines });
  } catch (err) {
    console.error("[/api/simulate]", err);
    return jsonWithSessionHint(
      sessionHint,
      { error: "Couldn't simulate that season right now." },
      { status: 500 },
    );
  }
}
