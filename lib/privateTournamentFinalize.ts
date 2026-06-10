import "server-only";
import type { QueryOptions } from "./motherduck";
import {
  getPrivateTournament,
  listPrivateEntries,
  markEntryBotReplaced,
  markTournamentCompleted,
  updateEntryFinal,
  type PrivateEntryRow,
} from "./privateTournamentQueries";
import {
  getStatNorms,
  runFinal,
  type FieldPlanEntry,
  type FinalRunResult,
} from "./privateTournamentRun";

// Shared finalize path for a private tournament. Called from TWO places:
//   • POST submit/route.ts, once the last slot is submitted (all `size` filled);
//   • GET route.ts (the public share path), LAZILY when an open tournament has
//     expired but isn't completed yet.
//
// It loads the tournament + entries through the RW pool (so it reads its own
// fresh writes), guards against a double-finalize (re-checks status), runs the
// MATH (lib/privateTournamentRun.runFinal), and persists in this order:
// updateEntryFinal per resolved entry + markEntryBotReplaced for the reserved-
// incomplete slots a bot took over FIRST, then markTournamentCompleted LAST — so
// the `completed` flag is the final write and implies every entry already has its
// standing. Idempotent: a second call after completion short-circuits UNLESS a
// prior pass crashed mid per-entry write (leaving entries with null finals), in
// which case it re-runs the deterministic bracket and BACKFILLS the missing
// per-entry rows. A best-effort per-process guard collapses concurrent calls in
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

  const entries = await listPrivateEntries(tournamentId);

  // Double-finalize guard: re-check status against fresh RW state. A racing
  // caller that already completed it wins. But "completed" alone is NOT enough to
  // short-circuit: a prior finalize may have crashed AFTER stamping the
  // tournament but BEFORE persisting every per-entry final. If any entry that
  // should carry a final standing is still missing one, re-run the (deterministic,
  // tournamentId-seeded) bracket and BACKFILL the missing per-entry rows so My
  // Teams / notifications recover. If nothing's missing, report alreadyCompleted.
  if (tournament.status === "completed") {
    if (!entriesMissingFinal(entries)) {
      return { ok: true, alreadyCompleted: true };
    }
    // Reproduce the same bracket and write only the per-entry finals (the
    // tournament row + its bracket_json are already correct from the first pass).
    const final = await runFinalForTournament(tournament, entries, options);
    await persistEntryFinals(entries, final);
    return { ok: true, alreadyCompleted: true };
  }

  // Fresh finalize. Run the bracket, then persist per-entry finals FIRST and
  // stamp the tournament completed LAST — so the `completed` flag is the final
  // write and implies every entry already has its standing. A crash before the
  // stamp leaves the tournament open (a retry re-runs cleanly); a crash after the
  // stamp leaves it completed-with-all-finals (a retry short-circuits).
  const final = await runFinalForTournament(tournament, entries, options);
  await persistEntryFinals(entries, final);
  await markTournamentCompleted({
    tournamentId,
    finalBracketJson: final.bracket,
    championName: final.championName,
  });

  return { ok: true, alreadyCompleted: false };
}

/** Run the deterministic final bracket for a tournament from its current entries.
 *  Pure of any persistence — seeded by tournamentId so it reproduces the same
 *  field/result on a re-run, which is what makes idempotent backfill safe. */
async function runFinalForTournament(
  tournament: NonNullable<Awaited<ReturnType<typeof getPrivateTournament>>>,
  entries: PrivateEntryRow[],
  options: QueryOptions,
): Promise<FinalRunResult> {
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
  return runFinal(
    tournament.tournamentId,
    tournament.board,
    tournament.size,
    planEntries,
    entryRowsById,
    statNorms,
    options,
  );
}

/** Persist every per-entry final: flip reserved-incomplete entries to
 *  bot_replaced, then write each resolved standing. Idempotent — re-running with
 *  the same deterministic `final` just rewrites the same values. */
async function persistEntryFinals(
  entries: PrivateEntryRow[],
  final: FinalRunResult,
): Promise<void> {
  // Map reserved-incomplete entries → mark bot_replaced. Build a set of userIds
  // the runner flagged, then flip each matching incomplete entry's status.
  const replacedUserIds = new Set(final.botReplacedUserIds);
  for (const e of entries) {
    if (e.status !== "submitted" && e.status !== "bot_replaced" && replacedUserIds.has(e.userId)) {
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
      // The result label (e.g. "Champion", "Lost Play-In") — a PrivateResultLabel.
      finalStatus: r.finalStatus,
      finalRealizedMargin: r.finalRealizedMargin,
      finalReachedRound: r.finalReachedRound,
    });
  }
}

/** True iff finalization left a per-entry gap — the signature of a finalize that
 *  crashed AFTER stamping the tournament completed but BEFORE persisting every
 *  per-entry write. Two distinct gaps:
 *    • a submitted OR bot_replaced entry with a null final record — its
 *      updateEntryFinal never landed; and
 *    • a still-registered/partial entry — once finalize fully ran, every
 *      reserved-incomplete slot is either flipped to bot_replaced (+ a final) or
 *      left as a never-reserved generic-bot slot; a leftover registered/partial
 *      row means the markEntryBotReplaced / updateEntryFinal pair never ran.
 *  Re-running the deterministic bracket + persistEntryFinals heals both. */
function entriesMissingFinal(entries: PrivateEntryRow[]): boolean {
  return entries.some((e) => {
    if (e.status === "registered" || e.status === "partial") return true;
    if (e.status === "submitted" || e.status === "bot_replaced") {
      return e.finalRecordW == null;
    }
    return false;
  });
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
