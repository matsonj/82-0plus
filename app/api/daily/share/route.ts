import { NextRequest } from "next/server";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { authenticate, getDailyResult } from "@/lib/dailyResults";
import { getUserTeams } from "@/lib/tournamentQueries";
import { signDailyShare } from "@/lib/dailyShareToken";
import { assertTournamentSecret } from "@/lib/secret";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Mint a signed share token for the signed-in player's OWN stored daily result on
// a date (used by the tournament share path, where there's no completion call to
// piggyback the token on). Authenticated so you can only mint a token for your
// own record, and the numbers come from the stored row — not the client.
export async function POST(req: NextRequest) {
  const sessionHint = getSessionHint(req);
  try {
    const body = await req.json();
    const date = String(body?.date ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return jsonWithSessionHint(sessionHint, { error: "invalid date" }, { status: 400 });
    }
    // Fail before authenticate() (which can create an account) if signing is
    // misconfigured — never mutate when we couldn't return a valid token anyway.
    assertTournamentSecret();
    const auth = await authenticate(String(body?.name ?? ""), String(body?.pin ?? ""));
    if (!auth.ok) {
      return jsonWithSessionHint(sessionHint, { error: auth.reason }, { status: 401 });
    }
    const result = await getDailyResult(auth.userId, date);
    if (!result) {
      return jsonWithSessionHint(sessionHint, { error: "no result for that date" }, { status: 404 });
    }
    // If the sharer ALSO entered this daily into the tournament, bake their bracket
    // run into the token so the share link is a true head-to-head (both the
    // reg-season record and the tournament run). Newest matching team wins. The
    // numbers come from the stored row — never the client — so they can't be forged.
    const tourn = (await getUserTeams(auth.userId)).find(
      (t) => t.mode === "daily" && t.dailyDate === date,
    );
    const share = signDailyShare({
      d: date, u: auth.name, w: result.wins, l: result.losses, n: result.margin, p: result.perfect,
      t: tourn
        ? { w: tourn.recordW, l: tourn.recordL, n: tourn.realizedMargin, r: tourn.reachedRound }
        : undefined,
    });
    return jsonWithSessionHint(sessionHint, { share });
  } catch (err) {
    console.error("[/api/daily/share]", err);
    return jsonWithSessionHint(sessionHint, { error: "Couldn't make a share link." }, { status: 500 });
  }
}
