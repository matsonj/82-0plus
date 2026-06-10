import { NextRequest } from "next/server";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { authenticate } from "@/lib/dailyResults";
import { isExpired } from "@/lib/privateTournament";
import {
  getPrivateEntry,
  getPrivateTournament,
  listPrivateEntries,
  registerPrivateEntry,
} from "@/lib/privateTournamentQueries";
import { getDraftRosters } from "@/lib/draftSourceRosters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/private-tournament/register — an entrant reserves a slot so they can
// draft. Body: { name, pin, tournamentId }. authenticate (create-or-match). Block
// if completed/expired or full (submitted+registered+partial >= size). Idempotent:
// an existing entry returns its current state. On success returns the entry + the
// board (the player needs it to draft). UUID-guarded.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const sessionHint = getSessionHint(req);
  const queryOptions = { sessionHint: sessionHint.value };
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

    const auth = await authenticate(String(body?.name ?? ""), String(body?.pin ?? ""));
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
    if (tournament.status === "completed") {
      return jsonWithSessionHint(
        sessionHint,
        { error: "this tournament is already finished" },
        { status: 400 },
      );
    }
    if (isExpired(tournament.expiresAt, Date.now())) {
      return jsonWithSessionHint(
        sessionHint,
        { error: "this tournament's entry window has closed" },
        { status: 400 },
      );
    }
    const sources = [...tournament.board.slots, tournament.board.benchSlot];

    // Idempotent: if this account already has an entry, return it as-is (don't
    // re-reserve / change the slot count). The board is included so a returning
    // entrant can resume drafting.
    const existing = await getPrivateEntry(tournamentId, auth.userId);
    if (existing) {
      return jsonWithSessionHint(sessionHint, {
        entryId: existing.entryId,
        status: existing.status,
        board: tournament.board,
        rosters: await getDraftRosters(sources, tournament.mode, queryOptions),
        size: tournament.size,
        mode: tournament.mode,
      });
    }

    // Full guard: every reserved/submitted slot counts (a registered/partial
    // entrant still holds a slot). bot_replaced only happens at finalize, so it
    // can't appear while open — but counting it is harmless.
    const entries = await listPrivateEntries(tournamentId);
    if (entries.length >= tournament.size) {
      return jsonWithSessionHint(
        sessionHint,
        { error: "this tournament is full" },
        { status: 400 },
      );
    }

    const rosters = await getDraftRosters(sources, tournament.mode, queryOptions);
    const entryId = await registerPrivateEntry({
      tournamentId,
      userId: auth.userId,
      userName: auth.name,
    });

    return jsonWithSessionHint(sessionHint, {
      entryId,
      status: "registered",
      board: tournament.board,
      rosters,
      size: tournament.size,
      mode: tournament.mode,
    });
  } catch (err) {
    console.error("[/api/private-tournament/register]", err);
    return jsonWithSessionHint(
      sessionHint,
      { error: "Couldn't register right now." },
      { status: 500 },
    );
  }
}
