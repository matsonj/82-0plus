import "server-only";
import type { QueryOptions } from "./motherduck";
import type { PrivateStatus } from "./privateTournament";
import {
  getPrivateTournament,
  listPrivateEntries,
  markEntryBotReplaced,
  markTournamentCompleted,
  updateEntryFinal,
  type PrivateEntryRow,
} from "./privateTournamentQueries";
import { getStatNorms, runFinal, type FieldPlanEntry } from "./privateTournamentRun";

// Shared finalize path for a private tournament. Called from TWO places:
//   • POST submit/route.ts, once the last slot is submitted (all `size` filled);
//   • GET route.ts (the public share path), LAZILY when an open tournament has
//     expired but isn't completed yet.
//
// It loads the tournament + entries through the RW pool (so it reads its own
// fresh writes), guards against a double-finalize (re-checks status), runs the
// MATH (lib/privateTournamentRun.runFinal), and persists: markTournamentCompleted
// + updateEntryFinal per resolved entry + markEntryBotReplaced for the reserved-
// incomplete slots a bot took over. Idempotent: a second call after completion
// short-circuits. A best-effort per-process guard collapses concurrent calls in
// one warm instance (the DB has no reliable uniqueness for this).

// In-flight finalize calls, keyed by tournamentId — collapses a burst (the last
// submitter racing the lazy GET path, say) into one finalize per warm instance.
const inFlight = new Map<string, Promise<FinalizeOutcome>>();

export type FinalizeOutcome =
  | { ok: true; alreadyCompleted: boolean }
  | { ok: false; reason: string };

/**
 * Finalize a private tournament. Safe to call repeatedly:
 *   • if it's already completed → { ok: true, alreadyCompleted: true } (no work);
 *   • otherwise build the field (submitted humans + "{USERNAME} BOT" for
 *     reserved-incomplete + generic bots), simulate, and persist everything.
 * On any thrown error the promise rejects with a wrapped Error so the caller (the
 * GET route) can surface a RECOVERABLE error the UI can retry.
 */
export async function finalizePrivate(
  tournamentId: string,
  options: QueryOptions = {},
): Promise<FinalizeOutcome> {
  const pending = inFlight.get(tournamentId);
  if (pending) return pending;
  const run = finalizeUncoalesced(tournamentId, options).finally(() => {
    inFlight.delete(tournamentId);
  });
  inFlight.set(tournamentId, run);
  return run;
}

async function finalizeUncoalesced(
  tournamentId: string,
  options: QueryOptions,
): Promise<FinalizeOutcome> {
  const tournament = await getPrivateTournament(tournamentId);
  if (!tournament) return { ok: false, reason: "tournament not found" };
  // Double-finalize guard: re-check status against fresh RW state. A racing
  // caller that already completed it wins; we report success without redoing it.
  if (tournament.status === "completed") {
    return { ok: true, alreadyCompleted: true };
  }

  const entries = await listPrivateEntries(tournamentId);

  // The field-plan view of each entry (PURE input to planFinalField).
  const planEntries: FieldPlanEntry[] = entries.map((e) => ({
    entryId: e.entryId,
    userId: e.userId,
    userName: e.userName,
    teamName: e.teamName,
    status: e.status,
  }));

  // Row lookup so runFinal can hydrate submitted entries' stored rosters.
  const entryRowsById = new Map<
    string,
    {
      entryId: string;
      teamName: string | null;
      rosterJson: unknown;
      sixthJson: unknown;
      captainSlot: number | null;
      seedNet: number | null;
    }
  >();
  for (const e of entries) entryRowsById.set(e.entryId, e);

  const statNorms = await getStatNorms(options);
  const final = await runFinal(
    tournamentId,
    tournament.board,
    tournament.size,
    planEntries,
    entryRowsById,
    statNorms,
    options,
  );

  // Persist. Order: stamp the tournament completed FIRST so a crash mid-write
  // still leaves it findable as completed (the per-entry writes are then a
  // best-effort fill; a re-finalize short-circuits on the completed status, so
  // we never re-run the bracket, but we won't re-attempt per-entry rows either —
  // acceptable: the bracket_json carries the full result regardless).
  await markTournamentCompleted({
    tournamentId,
    finalBracketJson: final.bracket,
    championName: final.championName,
  });

  // Map reserved-incomplete entries → mark bot_replaced. Build a set of userIds
  // the runner flagged, then flip each matching incomplete entry's status.
  const replacedUserIds = new Set(final.botReplacedUserIds);
  for (const e of entries) {
    if (e.status !== "submitted" && replacedUserIds.has(e.userId)) {
      await markEntryBotReplaced(e.entryId);
    }
  }

  // Each entry (humans + the bots that took over reserved slots) gets its final
  // standing written.
  for (const r of final.entryResults) {
    await updateEntryFinal({
      entryId: r.entryId,
      finalRecordW: r.finalRecordW,
      finalRecordL: r.finalRecordL,
      // The status column stores the human round label (a free string); the typed
      // column is PrivateStatus, so cast at the boundary.
      finalStatus: r.finalStatus as unknown as PrivateStatus,
      finalRealizedMargin: r.finalRealizedMargin,
      finalReachedRound: r.finalReachedRound,
    });
  }

  return { ok: true, alreadyCompleted: false };
}

/** True iff every slot in a `size`-team tournament is filled by a SUBMITTED entry
 *  (the trigger for an eager finalize from the submit route). registered/partial
 *  entries do NOT count — they'd be replaced by bots, so an all-submitted field
 *  is the only "naturally full" finalize trigger. */
export function allSlotsSubmitted(
  entries: Pick<PrivateEntryRow, "status">[],
  size: number,
): boolean {
  const submitted = entries.filter((e) => e.status === "submitted").length;
  return submitted >= size;
}
