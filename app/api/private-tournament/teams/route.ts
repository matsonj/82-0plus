import { NextRequest } from "next/server";
import { getPlayableTeams } from "@/lib/queries";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { jsonPublicCacheable } from "@/lib/publicCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/private-tournament/teams?decade=1990 — the manual board picker's
// decade-first team dropdown. Given a decade, return the team abbreviations that
// are playable in it (≥ MIN_PLAYERS_PER_COMBO players), sorted alphabetically.
// Decades themselves come from /api/decades. Validation mirrors /api/slot.
export async function GET(req: NextRequest) {
  const sessionHint = getSessionHint(req);
  const queryOptions = { sessionHint: sessionHint.value };
  try {
    const decade = Number(req.nextUrl.searchParams.get("decade"));
    if (!Number.isInteger(decade) || decade < 1900 || decade > 2100) {
      return jsonWithSessionHint(
        sessionHint,
        { error: "invalid decade" },
        { status: 400 },
      );
    }

    const playable = await getPlayableTeams(decade, queryOptions);
    const teams = [...playable].sort();

    // The playable-team set for a decade is global/public: CDN-cache it and drop
    // the session-hint cookie. Invalid-param/error responses stay uncached.
    return jsonPublicCacheable({ teams });
  } catch (err) {
    console.error("[/api/private-tournament/teams]", err);
    return jsonWithSessionHint(
      sessionHint,
      { error: "Couldn't load teams for that decade right now." },
      { status: 500 },
    );
  }
}
