import { NextRequest } from "next/server";
import { simulateRoster } from "@/lib/scoring";
import { hydrateRoster } from "@/lib/queries";
import { LINEUP_KINDS, parseLineupPicks, lineupEligible } from "@/lib/lineup";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const sessionHint = getSessionHint(req);
  const queryOptions = { sessionHint: sessionHint.value };
  try {
    const body = await req.json();
    const picks = parseLineupPicks(body?.roster);
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
    if (!lineupEligible(players, picks)) {
      return jsonWithSessionHint(
        sessionHint,
        { error: "illegal lineup" },
        { status: 400 },
      );
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
