import { NextRequest } from "next/server";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { ensureSchema } from "@/lib/oltpDb";
import { listPublicTournamentsRO } from "@/lib/privateTournamentReadQueries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/private-tournament/public — the anonymous "open to everyone" browse
// feed. No auth, no PIN in or out: it returns only open, non-expired, listed
// tournaments with a live entrant count (lib/privateTournamentReadQueries —
// listPublicTournamentsRO, on the read-only pool).
//
// ensureSchema() runs first on purpose: the `is_public` column ships via an
// idempotent ALTER in the OLTP DDL, applied by the (privileged) RW pool. Calling
// it here guarantees the column exists before the RO pool SELECTs it, closing the
// brief cold-deploy window where a browse hit could precede any write. It's a
// guarded no-op once the schema is current.
export async function GET(req: NextRequest) {
  const sessionHint = getSessionHint(req);
  try {
    await ensureSchema();
    const tournaments = await listPublicTournamentsRO();
    return jsonWithSessionHint(sessionHint, { tournaments });
  } catch (err) {
    console.error("[/api/private-tournament/public]", err);
    return jsonWithSessionHint(
      sessionHint,
      { error: "Couldn't load public tournaments right now." },
      { status: 500 },
    );
  }
}
