import { NextRequest } from "next/server";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { authenticate } from "@/lib/dailyResults";
import {
  getPrivateEntry,
  getPrivateTournament,
  markPrivateEntryViewed,
} from "@/lib/privateTournamentQueries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/private-tournament/mark-viewed — clear the unread badge on a finished
// tournament for this account. Body: { name, pin, tournamentId }. authenticate,
// find this account's entry, and stamp viewed_final_at — but ONLY once the
// tournament is COMPLETED. Stamping while it's still open would make
// needsAttention() later treat the eventual final result as already-viewed, so
// the entrant would never get the final-results badge. Idempotent + cheap.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const sessionHint = getSessionHint(req);
  try {
    const body = await req.json();

    const tournamentId = String(body?.tournamentId ?? "");
    if (!UUID_RE.test(tournamentId)) {
      return jsonWithSessionHint(sessionHint, { error: "invalid tournament id" }, { status: 400 });
    }

    const auth = await authenticate(String(body?.name ?? ""), String(body?.pin ?? ""));
    if (!auth.ok) {
      return jsonWithSessionHint(sessionHint, { error: auth.reason }, { status: 401 });
    }

    const tournament = await getPrivateTournament(tournamentId);
    if (!tournament) {
      return jsonWithSessionHint(sessionHint, { error: "tournament not found" }, { status: 404 });
    }

    const entry = await getPrivateEntry(tournamentId, auth.userId);
    if (!entry) {
      return jsonWithSessionHint(sessionHint, { error: "entry not found" }, { status: 404 });
    }

    // Only stamp once the final result exists. Marking an OPEN tournament viewed
    // would suppress the final-results badge the entrant should get on completion.
    if (tournament.status !== "completed") {
      return jsonWithSessionHint(sessionHint, { ok: true, viewed: false });
    }

    await markPrivateEntryViewed(entry.entryId);
    return jsonWithSessionHint(sessionHint, { ok: true, viewed: true });
  } catch (err) {
    console.error("[/api/private-tournament/mark-viewed]", err);
    return jsonWithSessionHint(sessionHint, { error: "Couldn't update that right now." }, { status: 500 });
  }
}
