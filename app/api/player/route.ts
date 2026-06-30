import { NextRequest, NextResponse } from "next/server";
import { getPlayerSeasonHistory } from "@/lib/queries";
import { scheduleWarmReconcile } from "@/lib/appCache";
import { jsonPublicCacheable } from "@/lib/publicCache";

export const runtime = "nodejs";

// Career-by-season history for one player (entity_id) → the Classic-mode player
// card. The data is global/public, so the response is CDN-cached via
// jsonPublicCacheable (short edge freshness + long stale-while-revalidate): the
// CDN always serves instantly, but background-revalidates within ~10 min — so once
// a cache rebuild lands, the fresh data propagates quickly instead of being pinned
// behind a day-long CDN entry built from the stale snapshot. Served from the
// Postgres serving cache (tournament.cache_player_season_stats, sub-ms); a cheap,
// background warm-reconcile runs on revalidation. This is the app's single hottest
// query — caching it here keeps the bulk of the carousel's ±2 prefetch traffic off
// the function and DB. (No session-hint cookie here: the response is shared/public.)
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    return NextResponse.json({ error: "invalid player id" }, { status: 400 });
  }
  try {
    const seasons = await getPlayerSeasonHistory(id);
    scheduleWarmReconcile(); // background (after()): cheap Postgres-only warm reconcile
    return jsonPublicCacheable({ seasons });
  } catch (err) {
    console.error("[/api/player]", err);
    return NextResponse.json(
      { error: "Couldn't load that player right now." },
      { status: 500 },
    );
  }
}
