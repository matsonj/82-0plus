import { NextRequest } from "next/server";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { jsonPublicCacheable } from "@/lib/publicCache";
import { pacificDate, isPlayableDailyDate } from "@/lib/dailyDate";
import { computeDailyBoard } from "@/lib/daily";
import { getDraftRosters } from "@/lib/draftSourceRosters";
import type { DraftRosterMap } from "@/lib/draftSources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sessionHint = getSessionHint(req);
  const queryOptions = { sessionHint: sessionHint.value };
  try {
    // Daily resets at midnight Pacific (see lib/dailyDate). A `date` param lets
    // players replay the archive, but only within the last 30 Pacific days (no
    // future dates) — older/invalid requests fall back to today.
    const requested = (req.nextUrl.searchParams.get("date") ?? "").slice(0, 10);
    // Only an explicit, valid archive date makes the board deterministic and
    // therefore CDN-cacheable (keyed by ?date=YYYY-MM-DD). A missing/invalid date
    // falls back to "today", which shifts at Pacific midnight — caching that under
    // a date-less URL would serve yesterday's board after rollover, so it stays
    // uncached. The client always sends an explicit date to land on the fast path.
    const explicitDate = isPlayableDailyDate(requested);
    const date = explicitDate ? requested : pacificDate();
    const includePlayers = req.nextUrl.searchParams.get("includePlayers") === "1";
    // The board is the 5 starter slots + a 6th bench slot (for the daily
    // tournament's sixth man). The starter slots are unchanged from before.
    const { slots, benchSlot } = await computeDailyBoard(date, queryOptions);
    const body: {
      date: string;
      slots: typeof slots;
      benchSlot: typeof benchSlot;
      rosters?: DraftRosterMap;
    } = { date, slots, benchSlot };
    if (includePlayers) {
      const sources = [...slots, ...(benchSlot ? [benchSlot] : [])];
      body.rosters = await getDraftRosters(sources, "hoopiq", queryOptions);
    }
    return explicitDate
      ? jsonPublicCacheable(body)
      : jsonWithSessionHint(sessionHint, body);
  } catch (err) {
    console.error("[/api/daily]", err);
    return jsonWithSessionHint(
      sessionHint,
      { error: "Couldn't load today's challenge." },
      { status: 500 },
    );
  }
}
