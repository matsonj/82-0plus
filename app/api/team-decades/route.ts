import { NextRequest } from "next/server";
import { getTeamDecades } from "@/lib/queries";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { signRoll, verifyRoll } from "@/lib/tournamentToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Decades in which a team has draftable players — used by the same-team decade
// skip so it never lands on an era where the team has nobody.
//
// DECADE-SKIP EXCHANGE: receipts are bound to (team, decade). To skip eras, the
// caller presents its current (team, decade) receipt; if it verifies, we mint a
// fresh receipt for EACH era that team has, so the client can adopt the one for
// the era it skips to. This proves the caller actually rolled that team (the
// receipt can't be forged), so it can't mint provenance for a team it never got.
export async function GET(req: NextRequest) {
  const sessionHint = getSessionHint(req);
  const queryOptions = { sessionHint: sessionHint.value };
  try {
    const sp = req.nextUrl.searchParams;
    const team = sp.get("team");
    if (!team || !/^[A-Z]{3}$/.test(team)) {
      return jsonWithSessionHint(
        sessionHint,
        { error: "invalid team" },
        { status: 400 },
      );
    }
    const decades = await getTeamDecades(team, queryOptions);

    // If a valid current (team, decade) receipt is presented, exchange it for a
    // map of {decade → fresh receipt} covering the team's eras. Without a valid
    // receipt we return only the decades list (no minting).
    const fromDecade = Number(sp.get("decade"));
    const receipt = sp.get("receipt");
    let receipts: Record<number, string> | undefined;
    if (
      receipt &&
      Number.isInteger(fromDecade) &&
      verifyRoll(receipt, team, fromDecade)
    ) {
      receipts = {};
      for (const d of decades) receipts[d] = signRoll(team, d);
    }

    return jsonWithSessionHint(sessionHint, { decades, receipts });
  } catch (err) {
    console.error("[/api/team-decades]", err);
    return jsonWithSessionHint(
      sessionHint,
      { error: "Couldn't load team decades right now." },
      { status: 500 },
    );
  }
}
