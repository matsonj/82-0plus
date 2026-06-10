import { NextRequest } from "next/server";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import {
  authenticate,
  getDailyResult,
  getDailyLeaderboard,
} from "@/lib/dailyResults";
import { isPlayableDailyDate } from "@/lib/dailyDate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The daily leaderboard for a date: top players + the signed-in viewer's own
// neighbourhood, each row carrying its roster so the client can expand a row into
// the head-to-head pick diff without another call. POST because it carries the
// name+PIN (used to highlight "you" and locate your neighbourhood).
export async function POST(req: NextRequest) {
  const sessionHint = getSessionHint(req);
  try {
    const body = await req.json();
    const date = String(body?.date ?? "").slice(0, 10);
    if (!isPlayableDailyDate(date)) {
      return jsonWithSessionHint(sessionHint, { error: "invalid date" }, { status: 400 });
    }
    const auth = await authenticate(String(body?.name ?? ""), String(body?.pin ?? ""));
    if (!auth.ok) {
      return jsonWithSessionHint(sessionHint, { error: auth.reason }, { status: 401 });
    }
    // Each leaderboard row carries its roster, so withhold the whole board until the
    // viewer has played that day — otherwise any account could read everyone's picks
    // before drafting. The UI only opens this post-result; this is the boundary.
    const played = await getDailyResult(auth.userId, date);
    if (!played) {
      return jsonWithSessionHint(
        sessionHint,
        { error: "Play this daily before viewing the leaderboard." },
        { status: 403 },
      );
    }
    const leaderboard = await getDailyLeaderboard(auth.userId, date);
    return jsonWithSessionHint(sessionHint, { leaderboard });
  } catch (err) {
    console.error("[/api/daily/leaderboard]", err);
    return jsonWithSessionHint(sessionHint, { error: "Couldn't load the leaderboard." }, { status: 500 });
  }
}
