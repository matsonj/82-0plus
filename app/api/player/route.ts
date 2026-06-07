import { NextRequest } from "next/server";
import { getPlayerSeasonHistory } from "@/lib/queries";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Career-by-season history for one player (entity_id) → the Classic-mode player
// card. Read-only, already-public box stats + era-aware median Game Quality.
export async function GET(req: NextRequest) {
  const sessionHint = getSessionHint(req);
  const queryOptions = { sessionHint: sessionHint.value };
  try {
    const id = req.nextUrl.searchParams.get("id") ?? "";
    if (!id || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
      return jsonWithSessionHint(
        sessionHint,
        { error: "invalid player id" },
        { status: 400 },
      );
    }
    const seasons = await getPlayerSeasonHistory(id, queryOptions);
    return jsonWithSessionHint(sessionHint, { seasons });
  } catch (err) {
    console.error("[/api/player]", err);
    return jsonWithSessionHint(
      sessionHint,
      { error: "Couldn't load that player right now." },
      { status: 500 },
    );
  }
}
