import { NextRequest, NextResponse, after } from "next/server";
import { getPlayerSeasonHistory } from "@/lib/queries";
import { refreshCacheIfStale } from "@/lib/appCache";

export const runtime = "nodejs";

// Career-by-season history for one player (entity_id) → the Classic-mode player
// card. The data is global/public and changes at most once a day, so the response
// is CDN-cacheable (s-maxage). It's served from the app_cache rollup (sub-ms), and
// a background freshness check (gated, non-blocking) keeps the cache warm without
// stalling the response. This is the app's single hottest query — caching it here
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
            "public, s-maxage=86400, stale-while-revalidate=604800",
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
