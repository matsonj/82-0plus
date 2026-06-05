import { NextRequest } from "next/server";
import { getTeamDecades } from "@/lib/queries";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Decades in which a team has draftable players — used by the same-team decade
// skip so it never lands on an era where the team has nobody.
export async function GET(req: NextRequest) {
  const sessionHint = getSessionHint(req);
  const queryOptions = { sessionHint: sessionHint.value };
  try {
    const team = req.nextUrl.searchParams.get("team");
    if (!team || !/^[A-Z]{3}$/.test(team)) {
      return jsonWithSessionHint(
        sessionHint,
        { error: "invalid team" },
        { status: 400 },
      );
    }
    const decades = await getTeamDecades(team, queryOptions);
    // No receipt here — a decade skip keeps the already-rolled team, so the
    // team's /api/slot receipt carries through. (Signing arbitrary requested
    // teams here would let a caller mint provenance for any team.)
    return jsonWithSessionHint(sessionHint, { decades });
  } catch (err) {
    console.error("[/api/team-decades]", err);
    return jsonWithSessionHint(
      sessionHint,
      { error: "Couldn't load team decades right now." },
      { status: 500 },
    );
  }
}
