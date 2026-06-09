import { NextRequest } from "next/server";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { authenticate } from "@/lib/dailyResults";
import {
  needsAttention,
  privateModeLabel,
  type PrivateEntryStatus,
  type PrivateMode,
  type PrivateSize,
  type PrivateStatus,
} from "@/lib/privateTournament";
import { listPrivateEntriesForUser } from "@/lib/privateTournamentQueries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/private-tournament/my — the full "Private" tab in My Teams. Body:
// { name, pin }. Unlike /notifications (which returns only the entries that need
// attention), this lists EVERY private tournament the signed-in account has an
// entry in — including completed ones the user has already viewed. Each item is a
// compact summary shaped for a My Teams row. Newest tournament first (mirrors the
// JOIN's `ORDER BY t.created_at DESC` in listPrivateEntriesForUser).

/** One My Teams row for a private tournament the user has an entry in. */
interface MyPrivateTournament {
  tournamentId: string;
  name: string; // the tournament's display name
  mode: PrivateMode; // raw mode ("classic" | "hoopiq")
  modeLabel: string; // privateModeLabel(mode) — ready to render
  size: PrivateSize;
  status: PrivateStatus; // tournament lifecycle: "open" | "completed"
  championName: string | null; // winner once completed; null while open
  expiresAt: string; // ISO — the open window's close
  finalizedAt: string | null; // ISO — when the bracket resolved; null while open
  viewedFinalAt: string | null; // ISO — when this user last opened the final
  // The user's own entry within this tournament.
  entryStatus: PrivateEntryStatus;
  finalRecordW: number | null;
  finalRecordL: number | null;
  finalStatus: PrivateStatus | null;
  provisionalRecordW: number | null;
  provisionalRecordL: number | null;
  provisionalStatus: PrivateStatus | null;
  needsAttention: boolean; // reuse needsAttention() — drives the unread dot
}

export async function POST(req: NextRequest) {
  const sessionHint = getSessionHint(req);
  try {
    const body = await req.json();

    const auth = await authenticate(
      String(body?.name ?? ""),
      String(body?.pin ?? ""),
    );
    if (!auth.ok) {
      return jsonWithSessionHint(
        sessionHint,
        { error: auth.reason },
        { status: 401 },
      );
    }

    const rows = await listPrivateEntriesForUser(auth.userId);

    const tournaments: MyPrivateTournament[] = rows.map((r) => ({
      tournamentId: r.tournamentId,
      name: r.tournamentName,
      mode: r.mode,
      modeLabel: privateModeLabel(r.mode),
      size: r.size,
      status: r.tournamentStatus,
      championName: r.championName,
      expiresAt: r.expiresAt,
      finalizedAt: r.finalizedAt,
      viewedFinalAt: r.viewedFinalAt,
      entryStatus: r.status,
      finalRecordW: r.finalRecordW,
      finalRecordL: r.finalRecordL,
      finalStatus: r.finalStatus,
      provisionalRecordW: r.provisionalRecordW,
      provisionalRecordL: r.provisionalRecordL,
      provisionalStatus: r.provisionalStatus,
      needsAttention: needsAttention({
        tournamentStatus: r.tournamentStatus,
        entryStatus: r.status,
        viewedFinalAt: r.viewedFinalAt,
      }),
    }));

    return jsonWithSessionHint(sessionHint, { tournaments });
  } catch (err) {
    console.error("[/api/private-tournament/my]", err);
    return jsonWithSessionHint(
      sessionHint,
      { error: "Couldn't load your private tournaments right now." },
      { status: 500 },
    );
  }
}
