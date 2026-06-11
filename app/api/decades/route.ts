import { NextRequest } from "next/server";
import { getDecades } from "@/lib/queries";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { jsonPublicCacheable } from "@/lib/publicCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The decade list is global/public, so the success response is CDN-cached and
// drops the session-hint cookie (Vercel won't cache a Set-Cookie response). The
// session hint is still derived for read-pool routing on a cache MISS; errors
// keep the cookie path and stay uncached.
export async function GET(req: NextRequest) {
  const sessionHint = getSessionHint(req);
  try {
    const decades = await getDecades({ sessionHint: sessionHint.value });
    return jsonPublicCacheable({ decades });
  } catch (err) {
    console.error("[/api/decades]", err);
    return jsonWithSessionHint(
      sessionHint,
      { error: "Couldn't load the league right now." },
      { status: 500 },
    );
  }
}
