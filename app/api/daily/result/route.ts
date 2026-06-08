import { NextRequest } from "next/server";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { authenticate, getDailyResult } from "@/lib/dailyResults";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Look up the signed-in player's completion for a date (POST because it carries
// the name+PIN). Returns { result: DailyResult | null }; used to gate replay and
// drive the shared-link head-to-head compare.
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
    return jsonWithSessionHint(sessionHint, { result });
  } catch (err) {
    console.error("[/api/daily/result]", err);
    return jsonWithSessionHint(sessionHint, { error: "Couldn't look that up." }, { status: 500 });
  }
}
