import { NextRequest, NextResponse } from "next/server";
import { simulateRoster, type ScoringPlayer } from "@/lib/scoring";
import type { PlayerLine } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIELDS: (keyof PlayerLine)[] = [
  "pts", "reb", "ast", "stl", "blk", "fga", "fg3a", "fg3m", "fta", "tov",
];

function toLine(raw: unknown): ScoringPlayer {
  const r = (raw ?? {}) as Record<string, unknown>;
  const line = {} as ScoringPlayer;
  for (const f of FIELDS) {
    const v = Number(r[f]);
    line[f] = Number.isFinite(v) ? v : 0;
  }
  // `value` carries the player's peak-season median Game Quality.
  const gq = Number(r.gq ?? r.value);
  line.gq = Number.isFinite(gq) ? gq : 0.5;
  return line;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const roster = body?.roster;
    if (!Array.isArray(roster) || roster.length === 0) {
      return NextResponse.json(
        { error: "roster must be a non-empty array" },
        { status: 400 },
      );
    }
    const result = simulateRoster(roster.map(toLine));
    return NextResponse.json({ result });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
