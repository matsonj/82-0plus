import { NextRequest } from "next/server";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { pacificDate, isPlayableDailyDate } from "@/lib/dailyDate";
import { computeDailyBoard } from "@/lib/daily";
import { authenticate, getDailyResult } from "@/lib/dailyResults";
import { getDraftRosters } from "@/lib/draftSourceRosters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Authenticated daily entrypoint. This replaces the old client-side pair of:
//   1. POST /api/daily/result to check the one-per-day gate
//   2. GET  /api/daily to fetch the board
// with a single fail-closed request. If the user already played, return the
// stored result; otherwise return today's/archive board plus all draft rosters.
export async function POST(req: NextRequest) {
  const sessionHint = getSessionHint(req);
  const queryOptions = { sessionHint: sessionHint.value };
  try {
    const body = await req.json();
    const requested = String(body?.date ?? "").slice(0, 10);
    const date = requested || pacificDate();
    if (!isPlayableDailyDate(date)) {
      return jsonWithSessionHint(
        sessionHint,
        { error: "that daily isn't playable" },
        { status: 400 },
      );
    }

    const auth = await authenticate(String(body?.name ?? ""), String(body?.pin ?? ""));
    if (!auth.ok) {
      return jsonWithSessionHint(sessionHint, { error: auth.reason }, { status: 401 });
    }

    const result = await getDailyResult(auth.userId, date);
    if (result) {
      return jsonWithSessionHint(sessionHint, {
        status: "played",
        date,
        result,
      });
    }

    const { slots, benchSlot } = await computeDailyBoard(date, queryOptions);
    const sources = [...slots, ...(benchSlot ? [benchSlot] : [])];
    return jsonWithSessionHint(sessionHint, {
      status: "open",
      date,
      slots,
      benchSlot,
      rosters: await getDraftRosters(sources, "hoopiq", queryOptions),
    });
  } catch (err) {
    console.error("[/api/daily/start]", err);
    return jsonWithSessionHint(
      sessionHint,
      { error: "Couldn't start that daily." },
      { status: 500 },
    );
  }
}
