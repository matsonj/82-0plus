import "server-only";
import { needsAttention } from "./privateTournament";
import { listPrivateEntriesForUser } from "./privateTournamentQueries";

// The private-tournament "needs attention" feed for a signed-in account — the
// menu/header badge. Shared by POST /api/private-tournament/notifications and the
// consolidated POST /api/home/bootstrap so the two can never diverge.
//   • pending           — open tournaments with unfinished/cooking entries
//   • completedUnviewed — finished tournaments the user hasn't opened yet
// `any` drives the indicator dot.

export interface NotifSummary {
  tournamentId: string;
  tournamentName: string;
  status: string;
  mode: string;
  size: number;
  expiresAt: string;
  entryStatus: string;
  championName: string | null;
}

export interface PrivateNotifications {
  pending: NotifSummary[];
  completedUnviewed: NotifSummary[];
  any: boolean;
}

export async function getPrivateNotifications(
  userId: string,
): Promise<PrivateNotifications> {
  const rows = await listPrivateEntriesForUser(userId);
  const pending: NotifSummary[] = [];
  const completedUnviewed: NotifSummary[] = [];
  for (const r of rows) {
    const attention = needsAttention({
      tournamentStatus: r.tournamentStatus,
      entryStatus: r.status,
      viewedFinalAt: r.viewedFinalAt,
    });
    if (!attention) continue;
    const summary: NotifSummary = {
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
  return {
    pending,
    completedUnviewed,
    any: pending.length > 0 || completedUnviewed.length > 0,
  };
}
