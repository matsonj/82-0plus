import { NextRequest } from "next/server";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { authenticate, listDailyResults, getDailyRank } from "@/lib/dailyResults";
import { recentDailyDates } from "@/lib/dailyDate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// List the signed-in player's daily completions for the recent (replayable)
// window in ONE call (POST because it carries the name+PIN). Powers the menu's
// "already played" state — today's card and the archive both read from this, so a
// finished day shows its result instead of "Play". daily_results is the source of
// truth (cross-device), replacing the old client-side completion cache.
export async function POST(req: NextRequest) {
  const sessionHint = getSessionHint(req);
  try {
    const body = await req.json();
    const auth = await authenticate(String(body?.name ?? ""), String(body?.pin ?? ""));
    if (!auth.ok) {
      return jsonWithSessionHint(sessionHint, { error: auth.reason }, { status: 401 });
    }
    // Floor the lookup at the oldest replayable date so we never scan beyond the
    // window the menu can actually show.
    const window = recentDailyDates();
    const since = window[window.length - 1];
    // window[0] is today (Pacific); the menu shows today's standing on its card.
    const [results, todayRank] = await Promise.all([
      listDailyResults(auth.userId, since),
      getDailyRank(auth.userId, window[0]),
    ]);
    return jsonWithSessionHint(sessionHint, { results, todayRank });
  } catch (err) {
    console.error("[/api/daily/results]", err);
    return jsonWithSessionHint(sessionHint, { error: "Couldn't look that up." }, { status: 500 });
  }
}
