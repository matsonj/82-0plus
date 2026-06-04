import { NextRequest, NextResponse } from "next/server";
import { simulateRoster } from "@/lib/scoring";
import { hydrateRoster } from "@/lib/queries";
import type { SimPick } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parsePicks(raw: unknown): SimPick[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 5) return null;
  const picks: SimPick[] = [];
  for (const item of raw) {
    const r = (item ?? {}) as Record<string, unknown>;
    const entity_id = String(r.entity_id ?? "");
    const team = String(r.team ?? "");
    const decade = Number(r.decade);
    if (!entity_id || !/^[A-Z]{3}$/.test(team) || !Number.isInteger(decade)) {
      return null;
    }
    picks.push({ entity_id, team, decade });
  }
  return picks;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const picks = parsePicks(body?.roster);
    if (!picks) {
      return NextResponse.json({ error: "invalid roster" }, { status: 400 });
    }

    // Stats + Game Quality come from the server-side index, not the client.
    let scoring, lines;
    try {
      ({ scoring, lines } = await hydrateRoster(picks));
    } catch {
      return NextResponse.json({ error: "unknown roster pick" }, { status: 400 });
    }

    const result = simulateRoster(scoring);
    return NextResponse.json({ result, roster: lines });
  } catch (err) {
    console.error("[/api/simulate]", err);
    return NextResponse.json(
      { error: "Couldn't simulate that season right now." },
      { status: 500 },
    );
  }
}
