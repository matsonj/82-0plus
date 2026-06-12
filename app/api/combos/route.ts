import { NextRequest } from "next/server";
import { getTeamDecadeCombos } from "@/lib/queries";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { jsonPublicCacheable } from "@/lib/publicCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The full (team, decade) combo list for the Player Cards browser is global/public,
// so the success response is CDN-cached and drops the session-hint cookie. The
// session hint is still derived for read-pool routing on a cache MISS; errors keep
// the cookie path and stay uncached. Mirrors /api/decades.
export async function GET(req: NextRequest) {
  const sessionHint = getSessionHint(req);
  try {
    const combos = await getTeamDecadeCombos({ sessionHint: sessionHint.value });
    return jsonPublicCacheable({ combos });
  } catch (err) {
    console.error("[/api/combos]", err);
    return jsonWithSessionHint(
      sessionHint,
      { error: "Couldn't load the league right now." },
      { status: 500 },
    );
  }
}
