import { NextRequest } from "next/server";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { authenticate } from "@/lib/dailyResults";
import {
  getPrivateEntry,
  markPrivateEntryViewed,
} from "@/lib/privateTournamentQueries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/private-tournament/mark-viewed — clear the unread badge on a finished
// tournament for this account. Body: { name, pin, tournamentId }. authenticate,
// find this account's entry, stamp viewed_final_at. Idempotent + cheap.

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

    const entry = await getPrivateEntry(tournamentId, auth.userId);
    if (!entry) {
      return jsonWithSessionHint(sessionHint, { error: "entry not found" }, { status: 404 });
    }

    await markPrivateEntryViewed(entry.entryId);
    return jsonWithSessionHint(sessionHint, { ok: true });
  } catch (err) {
    console.error("[/api/private-tournament/mark-viewed]", err);
    return jsonWithSessionHint(sessionHint, { error: "Couldn't update that right now." }, { status: 500 });
  }
}
