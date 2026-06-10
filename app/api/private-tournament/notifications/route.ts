import { NextRequest } from "next/server";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { authenticate } from "@/lib/dailyResults";
import { needsAttention } from "@/lib/privateTournament";
import { listPrivateEntriesForUser } from "@/lib/privateTournamentQueries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/private-tournament/notifications — the menu badge feed for a signed-in
// account. Body: { name, pin }. authenticate, list this user's private entries
// joined with their tournaments, and split through needsAttention():
//   • pending           — open tournaments with unfinished/cooking entries;
//   • completedUnviewed — finished tournaments the user hasn't opened yet.
// `any` drives the indicator dot. Minimal tournament summaries only.

export async function POST(req: NextRequest) {
  const sessionHint = getSessionHint(req);
  try {
    const body = await req.json();

    const auth = await authenticate(String(body?.name ?? ""), String(body?.pin ?? ""));
    if (!auth.ok) {
      return jsonWithSessionHint(sessionHint, { error: auth.reason }, { status: 401 });
    }

    const rows = await listPrivateEntriesForUser(auth.userId);

    type NotifSummary = {
      tournamentId: string;
      tournamentName: string;
      status: string;
      mode: string;
      size: number;
      expiresAt: string;
      entryStatus: string;
      championName: string | null;
    };
    const pending: NotifSummary[] = [];
    const completedUnviewed: NotifSummary[] = [];

    for (const r of rows) {
      const attention = needsAttention({
        tournamentStatus: r.tournamentStatus,
        entryStatus: r.status,
        viewedFinalAt: r.viewedFinalAt,
      });
      if (!attention) continue;
      const summary = {
        tournamentId: r.tournamentId,
        tournamentName: r.tournamentName,
        status: r.tournamentStatus,
        mode: r.mode,
        size: r.size,
        expiresAt: r.expiresAt,
        entryStatus: r.status,
        championName: r.championName,
      };
      if (r.tournamentStatus === "completed") completedUnviewed.push(summary);
      else pending.push(summary);
    }

    return jsonWithSessionHint(sessionHint, {
      pending,
      completedUnviewed,
      any: pending.length > 0 || completedUnviewed.length > 0,
    });
  } catch (err) {
    console.error("[/api/private-tournament/notifications]", err);
    return jsonWithSessionHint(sessionHint, { error: "Couldn't load notifications right now." }, { status: 500 });
  }
}
