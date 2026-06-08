import { NextRequest } from "next/server";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { authenticate, getDailyResult } from "@/lib/dailyResults";
import { signDailyShare } from "@/lib/dailyShareToken";

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
    const auth = await authenticate(String(body?.name ?? ""), String(body?.pin ?? ""));
    if (!auth.ok) {
      return jsonWithSessionHint(sessionHint, { error: auth.reason }, { status: 401 });
    }
    const result = await getDailyResult(auth.userId, date);
    if (!result) {
      return jsonWithSessionHint(sessionHint, { error: "no result for that date" }, { status: 404 });
    }
    const share = signDailyShare({
      d: date, u: auth.name, w: result.wins, l: result.losses, n: result.margin, p: result.perfect,
    });
    return jsonWithSessionHint(sessionHint, { share });
  } catch (err) {
    console.error("[/api/daily/share]", err);
    return jsonWithSessionHint(sessionHint, { error: "Couldn't make a share link." }, { status: 500 });
  }
}
