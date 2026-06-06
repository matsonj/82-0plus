import { NextRequest } from "next/server";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { pacificDate } from "@/lib/dailyDate";
import { computeDailyBoard } from "@/lib/daily";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sessionHint = getSessionHint(req);
  const queryOptions = { sessionHint: sessionHint.value };
  try {
    // Daily resets at midnight Pacific (see lib/dailyDate).
    const date = (req.nextUrl.searchParams.get("date") ?? pacificDate()).slice(0, 10);
    // The board is the 5 starter slots + a 6th bench slot (for the daily
    // tournament's sixth man). The starter slots are unchanged from before.
    const { slots, benchSlot } = await computeDailyBoard(date, queryOptions);
    return jsonWithSessionHint(sessionHint, { date, slots, benchSlot });
  } catch (err) {
    console.error("[/api/daily]", err);
    return jsonWithSessionHint(
      sessionHint,
      { error: "Couldn't load today's challenge." },
      { status: 500 },
    );
  }
}
