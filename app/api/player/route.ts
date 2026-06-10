import { NextRequest, NextResponse, after } from "next/server";
import { getPlayerSeasonHistory } from "@/lib/queries";
import { refreshCacheIfStale } from "@/lib/appCache";

export const runtime = "nodejs";

// Career-by-season history for one player (entity_id) → the Classic-mode player
// card. The data is global/public, so the response is CDN-cached. We use a SHORT
// s-maxage + long stale-while-revalidate: the CDN always serves instantly, but
// background-revalidates within ~10 min — so once a cache rebuild lands, the fresh
// data propagates quickly instead of being pinned behind a day-long CDN entry
// built from the stale snapshot. Served from the app_cache rollup (sub-ms); a
// gated, non-blocking freshness check on the (cheap, background) revalidation
// keeps app_cache warm. This is the app's single hottest query — caching it here
// keeps the bulk of the carousel's ±2 prefetch traffic off the function and DB.
// (No session-hint cookie here: the response is shared/public, and the data comes
// from app_cache via the RW pool, so read-pool affinity is irrelevant.)
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    return NextResponse.json({ error: "invalid player id" }, { status: 400 });
  }
  try {
    const seasons = await getPlayerSeasonHistory(id);
    after(() => refreshCacheIfStale()); // background, runs only on a cache MISS
    return NextResponse.json(
      { seasons },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=600, stale-while-revalidate=86400",
        },
      },
    );
  } catch (err) {
    console.error("[/api/player]", err);
    return NextResponse.json(
      { error: "Couldn't load that player right now." },
      { status: 500 },
    );
  }
}
