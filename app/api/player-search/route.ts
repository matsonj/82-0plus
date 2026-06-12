import { NextRequest } from "next/server";
import { searchPlayerCombos } from "@/lib/queries";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { jsonPublicCacheable } from "@/lib/publicCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Player-name search for the Player Cards browser. The query fully determines the
// result and the data is global/public, so each (cap-bounded) query string is
// CDN-cached and drops the session-hint cookie; errors keep the cookie path. A
// short/empty query returns an empty list (still cacheable).
export async function GET(req: NextRequest) {
  const sessionHint = getSessionHint(req);
  try {
    // Bound the query so a pathological string can't blow up the cache key / scan.
    const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 64);
    const matches = await searchPlayerCombos(q, { sessionHint: sessionHint.value });
    return jsonPublicCacheable({ matches });
  } catch (err) {
    console.error("[/api/player-search]", err);
    return jsonWithSessionHint(
      sessionHint,
      { error: "Couldn't search players right now." },
      { status: 500 },
    );
  }
}
