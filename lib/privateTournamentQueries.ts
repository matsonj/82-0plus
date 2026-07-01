import { randomUUID } from "node:crypto";
import type { PrivateBoard } from "./privateBoard";
import type {
  PrivateBoardMode,
  PrivateEntryStatus,
  PrivateMode,
  PrivateResultLabel,
  PrivateSize,
} from "./privateTournament";
import { ENTRY_COMPLETION_MINUTES } from "./privateTournament";
import {
  type EntryDbRow,
  type EntryForUserDbRow,
  mapEntryForUserRow,
  mapEntryRow,
  mapTournamentRow,
  PRIVATE_ENTRY_COLS,
  PRIVATE_ENTRY_FOR_USER_COLS,
  PRIVATE_TOURNAMENT_COLS,
  type PrivateEntryForUserRow,
  type PrivateEntryRow,
  type PrivateTournamentRow,
  type TournamentDbRow,
} from "./privateTournamentRows";
import { ensureSchema, queryRW, withTx } from "./oltpDb";

// Private (invite-only) tournament WRITE helpers. Mirror tournamentQueries.ts:
// ensureSchema() is awaited before every write; UUIDs are generated in app code
// (not via RETURNING/DEFAULT) so the id is deterministic for the caller; JSON
// columns are JSON.stringify'd on write and parsed defensively on read; params
// bind positionally to $1, $2, …. This file ONLY persists — finalization MATH
// (bracket sim, records, margins) lives elsewhere; here we just store results.
//
// The raw row shapes, the camelCase mapped types, the SELECT column lists, and
// the row→object mappers all live in lib/privateTournamentRows.ts so the RW
// pool here and the RO pool (lib/privateTournamentReadQueries.ts) can never
// diverge. This file injects queryRW + ensureSchema(); the reads reuse the same
// mappers and column constants.

// Re-export the shared mapped row types so existing importers of this module
// keep their import paths.
export type {
  PrivateEntryForUserRow,
  PrivateEntryRow,
  PrivateTournamentRow,
};

const TDB = "tournament";

// ── Tournament create / read ──────────────────────────────────────────────────

export interface CreatePrivateTournamentArgs {
  name: string;
  nameNorm: string;
  pinHash: string;
  pinSalt: string;
  adminUserId: string;
  adminName: string;
  mode: PrivateMode;
  size: PrivateSize;
  boardMode: PrivateBoardMode;
  board: PrivateBoard;
  expiresAt: string; // ISO timestamp the open window closes
  isPublic: boolean; // list in the public "open to everyone" browse feed
  // Optional caller-supplied id. The blind board is seeded by the tournament id,
  // so the create route fixes the id UP FRONT, generates the board from it, then
  // passes it here so the stored row and the board's seed agree. Omit to let this
  // helper mint one (still deterministic for the caller via the return value).
  tournamentId?: string;
}

/**
 * Insert a private tournament and return its tournament_id. The UUID is
 * generated in app code (like insertUser/insertTeam) so it's deterministic for
 * the caller — no dependence on RETURNING. Status starts 'open'; the board is
 * stored as JSON text (DuckDB casts text → JSON on insert). A caller may pass its
 * own `tournamentId` so a blind board can be seeded by the id before insert.
 */
export async function createPrivateTournament(
  args: CreatePrivateTournamentArgs,
): Promise<string> {
  await ensureSchema();
  const tournamentId = args.tournamentId ?? randomUUID();
  await queryRW(
    `INSERT INTO ${TDB}.private_tournaments
       (tournament_id, name, name_norm, pin_hash, pin_salt,
        admin_user_id, admin_name, mode, size, board_mode, board_json,
        status, expires_at, is_public)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'open', $12, $13)`,
    [
      tournamentId,
      args.name,
      args.nameNorm,
      args.pinHash,
      args.pinSalt,
      args.adminUserId,
      args.adminName,
      args.mode,
      args.size,
      args.boardMode,
      JSON.stringify(args.board),
      args.expiresAt,
      args.isPublic,
    ],
  );
  return tournamentId;
}

/** Full tournament row (board + final bracket parsed), or null if not found. */
export async function getPrivateTournament(
  tournamentId: string,
): Promise<PrivateTournamentRow | null> {
  await ensureSchema();
  const rows = await queryRW<TournamentDbRow>(
    `SELECT ${PRIVATE_TOURNAMENT_COLS}
       FROM ${TDB}.private_tournaments
      WHERE tournament_id = $1
      LIMIT 1`,
    [tournamentId],
  );
  return rows[0] ? mapTournamentRow(rows[0]) : null;
}

/**
 * All private tournaments sharing a normalized name (for name+PIN lookup). Like
 * getUsersByName: a name is NOT unique, so the route picks the one whose PIN
 * verifies against pin_hash/pin_salt. Oldest first (stable).
 */
export async function getPrivateTournamentsByNameNorm(
  nameNorm: string,
): Promise<PrivateTournamentRow[]> {
  await ensureSchema();
  const rows = await queryRW<TournamentDbRow>(
    `SELECT ${PRIVATE_TOURNAMENT_COLS}
       FROM ${TDB}.private_tournaments
      WHERE name_norm = $1
      ORDER BY created_at ASC`,
    [nameNorm],
  );
  return rows.map(mapTournamentRow);
}

// ── Entry list / read ─────────────────────────────────────────────────────────

/** All entries for a tournament, oldest first (registration order). */
export async function listPrivateEntries(
  tournamentId: string,
): Promise<PrivateEntryRow[]> {
  await ensureSchema();
  const rows = await queryRW<EntryDbRow>(
    `SELECT ${PRIVATE_ENTRY_COLS}
       FROM ${TDB}.private_entries
      WHERE tournament_id = $1
      ORDER BY created_at ASC`,
    [tournamentId],
  );
  return rows.map(mapEntryRow);
}

/**
 * One entrant's row in a tournament (the one-entry-per-account guard + the
 * "already registered" path). Postgres now enforces UNIQUE (tournament_id,
 * user_id), so this SELECT backs the "already registered" UX; LIMIT 1 stays
 * defensive for any legacy dup copied over from MotherDuck.
 */
export async function getPrivateEntry(
  tournamentId: string,
  userId: string,
): Promise<PrivateEntryRow | null> {
  await ensureSchema();
  const rows = await queryRW<EntryDbRow>(
    `SELECT ${PRIVATE_ENTRY_COLS}
       FROM ${TDB}.private_entries
      WHERE tournament_id = $1 AND user_id = $2
      ORDER BY created_at ASC
      LIMIT 1`,
    [tournamentId, userId],
  );
  return rows[0] ? mapEntryRow(rows[0]) : null;
}

// ── Entry lifecycle writes ─────────────────────────────────────────────────────

export interface RegisterPrivateEntryArgs {
  tournamentId: string;
  userId: string;
  userName: string;
}

/**
 * Register an entry (no roster yet) and return its entry_id. Idempotent on the
 * one-entry-per-account rule: the UNIQUE (tournament_id, user_id) constraint means a
 * concurrent duplicate that slips past the caller's getPrivateEntry pre-check hits
 * ON CONFLICT DO NOTHING, and we return the EXISTING entry's id rather than letting
 * a 23505 surface as a 500. The UUID is app-generated (deterministic for the caller
 * on a fresh insert).
 */
export async function registerPrivateEntry(
  args: RegisterPrivateEntryArgs,
): Promise<string> {
  await ensureSchema();
  const entryId = randomUUID();
  const inserted = await queryRW(
    `INSERT INTO ${TDB}.private_entries
       (entry_id, tournament_id, user_id, user_name, status)
     VALUES ($1, $2, $3, $4, 'registered')
     ON CONFLICT (tournament_id, user_id) DO NOTHING
     RETURNING entry_id`,
    [entryId, args.tournamentId, args.userId, args.userName],
  );
  if (inserted.length > 0) return entryId;
  // Lost a registration race — the (tournament, user) row already exists; return
  // its id so the caller stays idempotent.
  const existing = await getPrivateEntry(args.tournamentId, args.userId);
  return existing?.entryId ?? entryId;
}

/**
 * Purge stale incomplete entries for ONE tournament — the per-entrant completion
 * timeout. Deletes only registered|partial rows older than the completion window,
 * freeing their slots; NEVER touches submitted|bot_replaced. Gated to PUBLIC
 * tournaments by the CALLER's `isPublic` arg (private behaviour is unchanged).
 * Returns the number of rows purged (0 is common and cheap). RETURNING is required
 * to count — a bare DELETE yields no rows.
 */
export async function purgeStaleIncompleteEntries(args: {
  tournamentId: string;
  isPublic: boolean;
}): Promise<number> {
  if (!args.isPublic) return 0;
  await ensureSchema();
  const purged = await queryRW<{ entry_id: string }>(
    `DELETE FROM ${TDB}.private_entries
      WHERE tournament_id = $1
        AND status IN ('registered', 'partial')
        AND created_at < now() - interval '${ENTRY_COMPLETION_MINUTES} minutes'
      RETURNING entry_id`,
    [args.tournamentId],
  );
  return purged.length;
}

export interface RegisterWithPurgeArgs {
  tournamentId: string;
  userId: string;
  userName: string;
  size: number;
}

export type RegisterWithPurgeResult =
  | {
      ok: true;
      entryId: string;
      created: boolean; // true = fresh insert this call; false = idempotent re-join
      createdAtISO: string; // the entry's registration instant (drives the deadline)
      status: PrivateEntryStatus;
    }
  | { ok: false; reason: "full" };

/**
 * Atomic register-with-purge for PUBLIC tournaments. In ONE transaction (pinned to
 * a single backend by withTx, safe under PgBouncer transaction pooling):
 *   1. take a per-tournament advisory xact lock so concurrent registers serialize
 *      (kills the last-freed-slot over-fill race across backends);
 *   2. purge stale incomplete entries, freeing dead slots;
 *   3. idempotent re-join — a surviving (non-stale) entry for this user is returned
 *      AS-IS, so reloading register never resets an active window;
 *   4. re-count and reject if full;
 *   5. else insert a fresh 'registered' row.
 * A previously-kicked user's stale row is purged in step 2, so step 5 gives them a
 * brand-new created_at (fresh 10-minute window) for free. The advisory lock is
 * transaction-scoped (released at COMMIT), so it is compatible with transaction-
 * mode pooling. Private tournaments must NOT use this path (see register route).
 */
export async function registerWithPurgeTx(
  args: RegisterWithPurgeArgs,
): Promise<RegisterWithPurgeResult> {
  await ensureSchema();
  return withTx(async (client) => {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
      args.tournamentId,
    ]);
    await client.query(
      `DELETE FROM ${TDB}.private_entries
        WHERE tournament_id = $1
          AND status IN ('registered', 'partial')
          AND created_at < now() - interval '${ENTRY_COMPLETION_MINUTES} minutes'`,
      [args.tournamentId],
    );
    const mine = await client.query(
      `SELECT entry_id, status, created_at
         FROM ${TDB}.private_entries
        WHERE tournament_id = $1 AND user_id = $2
        LIMIT 1`,
      [args.tournamentId, args.userId],
    );
    if (mine.rows[0]) {
      return {
        ok: true as const,
        entryId: String(mine.rows[0].entry_id),
        created: false,
        createdAtISO: new Date(mine.rows[0].created_at).toISOString(),
        status: mine.rows[0].status as PrivateEntryStatus,
      };
    }
    const counted = await client.query(
      `SELECT count(*)::int AS n
         FROM ${TDB}.private_entries
        WHERE tournament_id = $1`,
      [args.tournamentId],
    );
    if ((counted.rows[0]?.n ?? 0) >= args.size) {
      return { ok: false as const, reason: "full" };
    }
    const entryId = randomUUID();
    const inserted = await client.query(
      `INSERT INTO ${TDB}.private_entries
         (entry_id, tournament_id, user_id, user_name, status)
       VALUES ($1, $2, $3, $4, 'registered')
       ON CONFLICT (tournament_id, user_id) DO NOTHING
       RETURNING created_at`,
      [entryId, args.tournamentId, args.userId, args.userName],
    );
    if (inserted.rows[0]) {
      return {
        ok: true as const,
        entryId,
        created: true,
        createdAtISO: new Date(inserted.rows[0].created_at).toISOString(),
        status: "registered" as PrivateEntryStatus,
      };
    }
    // Should be unreachable under the advisory lock, but stay idempotent: another
    // writer won the (tournament, user) row — return it rather than surface a 500.
    const raced = await client.query(
      `SELECT entry_id, status, created_at
         FROM ${TDB}.private_entries
        WHERE tournament_id = $1 AND user_id = $2
        LIMIT 1`,
      [args.tournamentId, args.userId],
    );
    const row = raced.rows[0];
    return {
      ok: true as const,
      entryId: row ? String(row.entry_id) : entryId,
      created: false,
      createdAtISO: new Date(row?.created_at ?? new Date()).toISOString(),
      status: (row?.status as PrivateEntryStatus) ?? "registered",
    };
  });
}

/** Result of a partial/submit write. `gone` = the row was deleted (purged by the
 *  10-minute timeout / removed) between the caller's gate and the write; `locked` =
 *  the row survives but already advanced past in-progress (a concurrent submit or a
 *  finalize flipped it to submitted/bot_replaced). Both are 0-row UPDATEs, but the
 *  caller reports them differently (410 removed vs 409 already-locked). */
export type EntryWriteOutcome =
  | { ok: true }
  | { ok: false; reason: "gone" | "locked" };

/** Classify why an in-progress UPDATE matched 0 rows. Best-effort and only used for
 *  the caller's error message — the UPDATE's own `status IN ('registered','partial')`
 *  predicate is what actually prevents clobbering a submitted/bot_replaced row. */
async function classifyEntryWriteMiss(
  entryId: string,
): Promise<{ ok: false; reason: "gone" | "locked" }> {
  const rows = await queryRW<{ status: string }>(
    `SELECT status FROM ${TDB}.private_entries WHERE entry_id = $1 LIMIT 1`,
    [entryId],
  );
  return { ok: false, reason: rows.length === 0 ? "gone" : "locked" };
}

export interface SavePrivatePartialArgs {
  entryId: string;
  rosterJson: unknown; // SimPick[] — the five starters
  rosterDisplay: unknown; // { roster: BracketPlayer[]; ... } — names for the list
  seedNet: number;
  regW: number;
  regL: number;
  teamBoxJson?: unknown; // the five's reg-season 9-stat box
  teamName?: string | null; // franchise name, if chosen by this point
}

/**
 * Save the interstitial 5-player draft as a 'partial' entry: just the starters,
 * the reg-season record + seed, and the share box. The sixth man, captain and
 * final bracket fields are filled later (submit / finalize).
 *
 * Only updates an IN-PROGRESS row (status registered|partial). Between the caller's
 * loadOpenPrivateEntry gate and this write the entry can be purged (10-minute
 * timeout) OR advanced by a concurrent submit/finalize; without the status
 * predicate a slow /partial would clobber a submitted/bot_replaced row, regressing
 * finalized state. On a 0-row UPDATE we classify the miss (gone vs locked) so the
 * caller reports it correctly instead of a false success.
 */
export async function savePrivatePartial(
  args: SavePrivatePartialArgs,
): Promise<EntryWriteOutcome> {
  await ensureSchema();
  const updated = await queryRW<{ entry_id: string }>(
    `UPDATE ${TDB}.private_entries
        SET status = 'partial',
            roster_json = $2,
            roster_display = $3,
            seed_net = $4,
            reg_w = $5,
            reg_l = $6,
            team_box_json = $7,
            team_name = COALESCE($8, team_name)
      WHERE entry_id = $1
        AND status IN ('registered', 'partial')
      RETURNING entry_id`,
    [
      args.entryId,
      JSON.stringify(args.rosterJson),
      JSON.stringify(args.rosterDisplay),
      args.seedNet,
      args.regW,
      args.regL,
      args.teamBoxJson == null ? null : JSON.stringify(args.teamBoxJson),
      args.teamName ?? null,
    ],
  );
  if (updated.length > 0) return { ok: true };
  return classifyEntryWriteMiss(args.entryId);
}

export interface SubmitPrivateEntryArgs {
  entryId: string;
  sixthJson: unknown; // { entity_id, team, decade }
  captainSlot: number;
  rosterDisplay: unknown; // final names (with captain flagged + sixth man)
  provisionalRecordW: number;
  provisionalRecordL: number;
  provisionalStatus: PrivateResultLabel;
  teamName?: string | null; // franchise name, if chosen at submit
}

/**
 * Lock in a complete six as a 'submitted' entry: the sixth man, captain slot,
 * final roster display, and the provisional bracket standing computed at submit
 * time. The final_* playoff fields are written only at finalization.
 *
 * Only updates an IN-PROGRESS row (status registered|partial). Guards the same race
 * as savePrivatePartial: a slow /submit must NOT overwrite a row that a concurrent
 * submit already locked in or that finalize turned into bot_replaced. On a 0-row
 * UPDATE the miss is classified (gone vs locked) so the caller reports removal /
 * conflict instead of a false success (and skips the eager finalize).
 */
export async function submitPrivateEntry(
  args: SubmitPrivateEntryArgs,
): Promise<EntryWriteOutcome> {
  await ensureSchema();
  const updated = await queryRW<{ entry_id: string }>(
    `UPDATE ${TDB}.private_entries
        SET status = 'submitted',
            sixth_json = $2,
            captain_slot = $3,
            roster_display = $4,
            provisional_record_w = $5,
            provisional_record_l = $6,
            provisional_status = $7,
            team_name = COALESCE($8, team_name),
            submitted_at = now()
      WHERE entry_id = $1
        AND status IN ('registered', 'partial')
      RETURNING entry_id`,
    [
      args.entryId,
      JSON.stringify(args.sixthJson),
      args.captainSlot,
      JSON.stringify(args.rosterDisplay),
      args.provisionalRecordW,
      args.provisionalRecordL,
      args.provisionalStatus,
      args.teamName ?? null,
    ],
  );
  if (updated.length > 0) return { ok: true };
  return classifyEntryWriteMiss(args.entryId);
}

// ── Finalization persistence (MATH lives elsewhere) ───────────────────────────

export interface MarkTournamentCompletedArgs {
  tournamentId: string;
  finalBracketJson: unknown; // BracketResult
  championName: string;
}

/** Stamp a tournament 'completed' with its resolved bracket + champion + time. */
export async function markTournamentCompleted(
  args: MarkTournamentCompletedArgs,
): Promise<void> {
  await ensureSchema();
  await queryRW(
    `UPDATE ${TDB}.private_tournaments
        SET status = 'completed',
            finalized_at = now(),
            final_bracket_json = $2,
            champion_name = $3
      WHERE tournament_id = $1`,
    [args.tournamentId, JSON.stringify(args.finalBracketJson), args.championName],
  );
}

export interface UpdateEntryFinalArgs {
  entryId: string;
  finalRecordW: number;
  finalRecordL: number;
  finalStatus: PrivateResultLabel;
  finalRealizedMargin: number;
  finalReachedRound: number;
}

/** Write one entry's resolved final bracket standing (computed by the caller). */
export async function updateEntryFinal(
  args: UpdateEntryFinalArgs,
): Promise<void> {
  await ensureSchema();
  await queryRW(
    `UPDATE ${TDB}.private_entries
        SET final_record_w = $2,
            final_record_l = $3,
            final_status = $4,
            final_realized_margin = $5,
            final_reached_round = $6
      WHERE entry_id = $1`,
    [
      args.entryId,
      args.finalRecordW,
      args.finalRecordL,
      args.finalStatus,
      args.finalRealizedMargin,
      args.finalReachedRound,
    ],
  );
}

/**
 * Convert an incomplete entry (registered/partial) to 'bot_replaced' — a board-
 * constrained bot took the slot at finalize. The bot's roster/seed are written
 * with updateEntryFinal as usual; this just flips the status.
 */
export async function markEntryBotReplaced(entryId: string): Promise<void> {
  await ensureSchema();
  await queryRW(
    `UPDATE ${TDB}.private_entries
        SET status = 'bot_replaced'
      WHERE entry_id = $1`,
    [entryId],
  );
}

/** Stamp an entry's viewed_final_at (clears the unread badge). */
export async function markPrivateEntryViewed(entryId: string): Promise<void> {
  await ensureSchema();
  await queryRW(
    `UPDATE ${TDB}.private_entries
        SET viewed_final_at = now()
      WHERE entry_id = $1`,
    [entryId],
  );
}

// ── Admin teardown ─────────────────────────────────────────────────────────────

/**
 * Permanently delete a tournament and all of its entries (host-only — the route
 * authorizes admin_user_id before calling this). Entries go FIRST so no row is
 * ever orphaned to a tournament that's already gone; the tournament row drops
 * second. Both are TDB-qualified, positional, and re-use the RW pool.
 */
export async function deletePrivateTournament(
  tournamentId: string,
): Promise<void> {
  await ensureSchema();
  await queryRW(
    `DELETE FROM ${TDB}.private_entries WHERE tournament_id = $1`,
    [tournamentId],
  );
  await queryRW(
    `DELETE FROM ${TDB}.private_tournaments WHERE tournament_id = $1`,
    [tournamentId],
  );
}

// ── My Teams / notifications (entries joined with their tournament) ───────────

/**
 * All of a user's private entries joined with their tournament summary (name,
 * status, mode, size, expiry, finalize time, champion) — powers the My Teams
 * rows and the attention/notification badge. Newest tournament first.
 */
export async function listPrivateEntriesForUser(
  userId: string,
): Promise<PrivateEntryForUserRow[]> {
  await ensureSchema();
  const rows = await queryRW<EntryForUserDbRow>(
    `SELECT ${PRIVATE_ENTRY_FOR_USER_COLS}
       FROM ${TDB}.private_entries e
       JOIN ${TDB}.private_tournaments t ON t.tournament_id = e.tournament_id
      WHERE e.user_id = $1
      ORDER BY t.created_at DESC`,
    [userId],
  );
  return rows.map(mapEntryForUserRow);
}
