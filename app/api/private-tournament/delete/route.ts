import { NextRequest } from "next/server";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { authenticate } from "@/lib/dailyResults";
import {
  deletePrivateTournament,
  getPrivateTournament,
} from "@/lib/privateTournamentQueries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/private-tournament/delete — the HOST permanently deletes a private
// tournament (and every entry under it). Body: { adminName, adminPin, tournamentId }.
// Validate-before-mutate: authenticate the caller, load the tournament, then
// AUTHORIZE — only the account that owns admin_user_id may delete. A non-host (or
// an unknown id) never mutates anything. UUID-guarded. Returns { ok: true }.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const sessionHint = getSessionHint(req);
  try {
    const body = await req.json();

    const tournamentId = String(body?.tournamentId ?? "");
    if (!UUID_RE.test(tournamentId)) {
      return jsonWithSessionHint(
        sessionHint,
        { error: "invalid tournament id" },
        { status: 400 },
      );
    }

    const auth = await authenticate(
      String(body?.adminName ?? ""),
      String(body?.adminPin ?? ""),
    );
    if (!auth.ok) {
      return jsonWithSessionHint(sessionHint, { error: auth.reason }, { status: 401 });
    }

    const tournament = await getPrivateTournament(tournamentId);
    if (!tournament) {
      return jsonWithSessionHint(
        sessionHint,
        { error: "tournament not found" },
        { status: 404 },
      );
    }

    // AUTHORIZE: only the host (the account that created it) may delete.
    if (tournament.adminUserId !== auth.userId) {
      return jsonWithSessionHint(
        sessionHint,
        { error: "only the host can delete this tournament" },
        { status: 403 },
      );
    }

    await deletePrivateTournament(tournamentId);

    return jsonWithSessionHint(sessionHint, { ok: true });
  } catch (err) {
    console.error("[/api/private-tournament/delete]", err);
    return jsonWithSessionHint(
      sessionHint,
      { error: "Couldn't delete that tournament right now." },
      { status: 500 },
    );
  }
}
