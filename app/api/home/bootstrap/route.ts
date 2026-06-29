import { NextRequest } from "next/server";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { authenticate, listDailyResults, getDailyRank } from "@/lib/dailyResults";
import { recentDailyDates } from "@/lib/dailyDate";
import { getPrivateNotifications } from "@/lib/privateNotifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One authenticated round trip for signed-in home hydration. Body: { name, pin }.
// Replaces the home page's two separate authenticated calls — POST /api/daily/results
// and POST /api/private-tournament/notifications, each of which re-ran the name+PIN
// scrypt verification — with a single authenticate() + parallel reads:
//   • dailyResults   — completions in the replayable window + today's rank
//   • notifications  — the private-tournament "needs attention" feed
export async function POST(req: NextRequest) {
  const sessionHint = getSessionHint(req);
  try {
    const body = await req.json();
    const auth = await authenticate(String(body?.name ?? ""), String(body?.pin ?? ""));
    if (!auth.ok) {
      return jsonWithSessionHint(sessionHint, { error: auth.reason }, { status: 401 });
    }
    // window[0] is today (Pacific); window[last] is the oldest replayable date.
    const window = recentDailyDates();
    const since = window[window.length - 1];
    const [results, todayRank, notifications] = await Promise.all([
      listDailyResults(auth.userId, since),
      getDailyRank(auth.userId, window[0]),
      getPrivateNotifications(auth.userId),
    ]);
    return jsonWithSessionHint(sessionHint, {
      dailyResults: { results, todayRank },
      notifications,
    });
  } catch (err) {
    console.error("[/api/home/bootstrap]", err);
    return jsonWithSessionHint(
      sessionHint,
      { error: "Couldn't load your home data." },
      { status: 500 },
    );
  }
}
