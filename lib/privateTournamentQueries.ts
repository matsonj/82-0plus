import { randomUUID } from "node:crypto";
import type { PrivateBoard } from "./privateBoard";
import type {
  PrivateBoardMode,
  PrivateEntryStatus,
  PrivateMode,
  PrivateSize,
  PrivateStatus,
} from "./privateTournament";
import { ensureSchema, queryRW } from "./tournamentDb";

// Private (invite-only) tournament WRITE helpers. Mirror tournamentQueries.ts:
// ensureSchema() is awaited before every write; UUIDs are generated in app code
// (not via RETURNING/DEFAULT) so the id is deterministic for the caller; JSON
// columns are JSON.stringify'd on write and parsed defensively on read; params
// bind positionally to $1, $2, …. This file ONLY persists — finalization MATH
// (bracket sim, records, margins) lives elsewhere; here we just store results.

const TDB = "nba_tournament.main";

/** Parse a stored JSON column (the pg endpoint returns JSON as a string). */
function parseJson<T>(value: unknown): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : (value as T);
}

/** Coerce a TIMESTAMP cell (Date or string) to an ISO string, or null. */
function toIso(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

// ── Row shapes (raw — include auth fields the camelCase summaries omit) ───────

/** A full private_tournaments row, mapped to camelCase with JSON parsed. */
export interface PrivateTournamentRow {
  tournamentId: string;
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
  status: PrivateStatus;
  createdAt: string;
  expiresAt: string;
  finalizedAt: string | null;
  finalBracketJson: unknown; // BracketResult once finalized; null while open
  championName: string | null;
}

/** A full private_entries row, mapped to camelCase with JSON parsed. */
export interface PrivateEntryRow {
  entryId: string;
  tournamentId: string;
  userId: string;
  userName: string;
  teamName: string | null;
  status: PrivateEntryStatus;
  rosterJson: unknown; // SimPick[] once a roster is saved; null before
  sixthJson: unknown; // { entity_id, team, decade } once submitted; null before
  rosterDisplay: unknown; // { roster: BracketPlayer[]; sixthMan: BracketPlayer } | null
  captainSlot: number | null;
  seedNet: number | null;
  regW: number | null;
  regL: number | null;
  teamBoxJson: unknown; // the five's reg-season 9-stat box; null before
  provisionalRecordW: number | null;
  provisionalRecordL: number | null;
  provisionalStatus: PrivateStatus | null;
  finalRecordW: number | null;
  finalRecordL: number | null;
  finalStatus: PrivateStatus | null;
  finalRealizedMargin: number | null;
  finalReachedRound: number | null;
  viewedFinalAt: string | null;
  createdAt: string;
  submittedAt: string | null;
}

/** A user's private entry joined with its tournament summary (My Teams rows). */
export interface PrivateEntryForUserRow {
  entryId: string;
  tournamentId: string;
  tournamentName: string;
  tournamentStatus: PrivateStatus;
  mode: PrivateMode;
  size: PrivateSize;
  expiresAt: string;
  finalizedAt: string | null;
  championName: string | null;
  teamName: string | null;
  status: PrivateEntryStatus;
  seedNet: number | null;
  regW: number | null;
  regL: number | null;
  provisionalRecordW: number | null;
  provisionalRecordL: number | null;
  provisionalStatus: PrivateStatus | null;
  finalRecordW: number | null;
  finalRecordL: number | null;
  finalStatus: PrivateStatus | null;
  finalReachedRound: number | null;
  viewedFinalAt: string | null;
}

// ── Raw DB row interfaces (snake_case, as returned by the pg endpoint) ────────

interface TournamentDbRow {
  tournament_id: string;
  name: string;
  name_norm: string;
  pin_hash: string;
  pin_salt: string;
  admin_user_id: string;
  admin_name: string;
  mode: string;
  size: number;
  board_mode: string;
  board_json: unknown;
  status: string;
  created_at: string | Date;
  expires_at: string | Date;
  finalized_at: string | Date | null;
  final_bracket_json: unknown;
  champion_name: string | null;
}

interface EntryDbRow {
  entry_id: string;
  tournament_id: string;
  user_id: string;
  user_name: string;
  team_name: string | null;
  status: string;
  roster_json: unknown;
  sixth_json: unknown;
  roster_display: unknown;
  captain_slot: number | null;
  seed_net: number | null;
  reg_w: number | null;
  reg_l: number | null;
  team_box_json: unknown;
  provisional_record_w: number | null;
  provisional_record_l: number | null;
  provisional_status: string | null;
  final_record_w: number | null;
  final_record_l: number | null;
  final_status: string | null;
  final_realized_margin: number | null;
  final_reached_round: number | null;
  viewed_final_at: string | Date | null;
  created_at: string | Date;
  submitted_at: string | Date | null;
}

// ── Row mappers ───────────────────────────────────────────────────────────────

function mapTournamentRow(r: TournamentDbRow): PrivateTournamentRow {
  return {
    tournamentId: r.tournament_id,
    name: r.name,
    nameNorm: r.name_norm,
    pinHash: r.pin_hash,
    pinSalt: r.pin_salt,
    adminUserId: r.admin_user_id,
    adminName: r.admin_name,
    mode: r.mode as PrivateMode,
    size: r.size as PrivateSize,
    boardMode: r.board_mode as PrivateBoardMode,
    board: parseJson<PrivateBoard>(r.board_json),
    status: r.status as PrivateStatus,
    createdAt: toIso(r.created_at) ?? "",
    expiresAt: toIso(r.expires_at) ?? "",
    finalizedAt: toIso(r.finalized_at),
    finalBracketJson:
      r.final_bracket_json == null ? null : parseJson(r.final_bracket_json),
    championName: r.champion_name ?? null,
  };
}

function mapEntryRow(r: EntryDbRow): PrivateEntryRow {
  return {
    entryId: r.entry_id,
    tournamentId: r.tournament_id,
    userId: r.user_id,
    userName: r.user_name,
    teamName: r.team_name ?? null,
    status: r.status as PrivateEntryStatus,
    rosterJson: r.roster_json == null ? null : parseJson(r.roster_json),
    sixthJson: r.sixth_json == null ? null : parseJson(r.sixth_json),
    rosterDisplay:
      r.roster_display == null ? null : parseJson(r.roster_display),
    captainSlot: r.captain_slot ?? null,
    seedNet: r.seed_net ?? null,
    regW: r.reg_w ?? null,
    regL: r.reg_l ?? null,
    teamBoxJson: r.team_box_json == null ? null : parseJson(r.team_box_json),
    provisionalRecordW: r.provisional_record_w ?? null,
    provisionalRecordL: r.provisional_record_l ?? null,
    provisionalStatus: (r.provisional_status as PrivateStatus | null) ?? null,
    finalRecordW: r.final_record_w ?? null,
    finalRecordL: r.final_record_l ?? null,
    finalStatus: (r.final_status as PrivateStatus | null) ?? null,
    finalRealizedMargin: r.final_realized_margin ?? null,
    finalReachedRound: r.final_reached_round ?? null,
    viewedFinalAt: toIso(r.viewed_final_at),
    createdAt: toIso(r.created_at) ?? "",
    submittedAt: toIso(r.submitted_at),
  };
}

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
        status, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'open', $12)`,
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
    ],
  );
  return tournamentId;
}

const TOURNAMENT_COLS = `tournament_id, name, name_norm, pin_hash, pin_salt,
            admin_user_id, admin_name, mode, size, board_mode, board_json,
            status, created_at, expires_at, finalized_at,
            final_bracket_json, champion_name`;

/** Full tournament row (board + final bracket parsed), or null if not found. */
export async function getPrivateTournament(
  tournamentId: string,
): Promise<PrivateTournamentRow | null> {
  await ensureSchema();
  const rows = await queryRW<TournamentDbRow>(
    `SELECT ${TOURNAMENT_COLS}
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
    `SELECT ${TOURNAMENT_COLS}
       FROM ${TDB}.private_tournaments
      WHERE name_norm = $1
      ORDER BY created_at ASC`,
    [nameNorm],
  );
  return rows.map(mapTournamentRow);
}

// ── Entry list / read ─────────────────────────────────────────────────────────

const ENTRY_COLS = `entry_id, tournament_id, user_id, user_name, team_name, status,
            roster_json, sixth_json, roster_display, captain_slot, seed_net,
            reg_w, reg_l, team_box_json,
            provisional_record_w, provisional_record_l, provisional_status,
            final_record_w, final_record_l, final_status,
            final_realized_margin, final_reached_round, viewed_final_at,
            created_at, submitted_at`;

/** All entries for a tournament, oldest first (registration order). */
export async function listPrivateEntries(
  tournamentId: string,
): Promise<PrivateEntryRow[]> {
  await ensureSchema();
  const rows = await queryRW<EntryDbRow>(
    `SELECT ${ENTRY_COLS}
       FROM ${TDB}.private_entries
      WHERE tournament_id = $1
      ORDER BY created_at ASC`,
    [tournamentId],
  );
  return rows.map(mapEntryRow);
}

/**
 * One entrant's row in a tournament (the one-entry-per-account guard + the
 * "already registered" path). MotherDuck won't enforce a UNIQUE on the pair, so
 * this SELECT is the dedup check; LIMIT 1 returns the first if a dup ever slips.
 */
export async function getPrivateEntry(
  tournamentId: string,
  userId: string,
): Promise<PrivateEntryRow | null> {
  await ensureSchema();
  const rows = await queryRW<EntryDbRow>(
    `SELECT ${ENTRY_COLS}
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
 * Insert a freshly-registered entry (no roster yet) and return its entry_id.
 * The UUID is generated in app code (deterministic for the caller). The dedup
 * guard is the caller's responsibility — call getPrivateEntry first.
 */
export async function registerPrivateEntry(
  args: RegisterPrivateEntryArgs,
): Promise<string> {
  await ensureSchema();
  const entryId = randomUUID();
  await queryRW(
    `INSERT INTO ${TDB}.private_entries
       (entry_id, tournament_id, user_id, user_name, status)
     VALUES ($1, $2, $3, $4, 'registered')`,
    [entryId, args.tournamentId, args.userId, args.userName],
  );
  return entryId;
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
 */
export async function savePrivatePartial(
  args: SavePrivatePartialArgs,
): Promise<void> {
  await ensureSchema();
  await queryRW(
    `UPDATE ${TDB}.private_entries
        SET status = 'partial',
            roster_json = $2,
            roster_display = $3,
            seed_net = $4,
            reg_w = $5,
            reg_l = $6,
            team_box_json = $7,
            team_name = COALESCE($8, team_name)
      WHERE entry_id = $1`,
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
}

export interface SubmitPrivateEntryArgs {
  entryId: string;
  sixthJson: unknown; // { entity_id, team, decade }
  captainSlot: number;
  rosterDisplay: unknown; // final names (with captain flagged + sixth man)
  provisionalRecordW: number;
  provisionalRecordL: number;
  provisionalStatus: PrivateStatus;
  teamName?: string | null; // franchise name, if chosen at submit
}

/**
 * Lock in a complete six as a 'submitted' entry: the sixth man, captain slot,
 * final roster display, and the provisional bracket standing computed at submit
 * time. The final_* playoff fields are written only at finalization.
 */
export async function submitPrivateEntry(
  args: SubmitPrivateEntryArgs,
): Promise<void> {
  await ensureSchema();
  await queryRW(
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
      WHERE entry_id = $1`,
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
  finalStatus: PrivateStatus;
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

// ── My Teams / notifications (entries joined with their tournament) ───────────

interface EntryForUserDbRow {
  entry_id: string;
  tournament_id: string;
  tournament_name: string;
  tournament_status: string;
  mode: string;
  size: number;
  expires_at: string | Date;
  finalized_at: string | Date | null;
  champion_name: string | null;
  team_name: string | null;
  status: string;
  seed_net: number | null;
  reg_w: number | null;
  reg_l: number | null;
  provisional_record_w: number | null;
  provisional_record_l: number | null;
  provisional_status: string | null;
  final_record_w: number | null;
  final_record_l: number | null;
  final_status: string | null;
  final_reached_round: number | null;
  viewed_final_at: string | Date | null;
}

function mapEntryForUserRow(r: EntryForUserDbRow): PrivateEntryForUserRow {
  return {
    entryId: r.entry_id,
    tournamentId: r.tournament_id,
    tournamentName: r.tournament_name,
    tournamentStatus: r.tournament_status as PrivateStatus,
    mode: r.mode as PrivateMode,
    size: r.size as PrivateSize,
    expiresAt: toIso(r.expires_at) ?? "",
    finalizedAt: toIso(r.finalized_at),
    championName: r.champion_name ?? null,
    teamName: r.team_name ?? null,
    status: r.status as PrivateEntryStatus,
    seedNet: r.seed_net ?? null,
    regW: r.reg_w ?? null,
    regL: r.reg_l ?? null,
    provisionalRecordW: r.provisional_record_w ?? null,
    provisionalRecordL: r.provisional_record_l ?? null,
    provisionalStatus: (r.provisional_status as PrivateStatus | null) ?? null,
    finalRecordW: r.final_record_w ?? null,
    finalRecordL: r.final_record_l ?? null,
    finalStatus: (r.final_status as PrivateStatus | null) ?? null,
    finalReachedRound: r.final_reached_round ?? null,
    viewedFinalAt: toIso(r.viewed_final_at),
  };
}

const ENTRY_FOR_USER_COLS = `e.entry_id AS entry_id, e.tournament_id AS tournament_id,
            t.name AS tournament_name, t.status AS tournament_status,
            t.mode AS mode, t.size AS size, t.expires_at AS expires_at,
            t.finalized_at AS finalized_at, t.champion_name AS champion_name,
            e.team_name AS team_name, e.status AS status, e.seed_net AS seed_net,
            e.reg_w AS reg_w, e.reg_l AS reg_l,
            e.provisional_record_w AS provisional_record_w,
            e.provisional_record_l AS provisional_record_l,
            e.provisional_status AS provisional_status,
            e.final_record_w AS final_record_w, e.final_record_l AS final_record_l,
            e.final_status AS final_status,
            e.final_reached_round AS final_reached_round,
            e.viewed_final_at AS viewed_final_at`;

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
    `SELECT ${ENTRY_FOR_USER_COLS}
       FROM ${TDB}.private_entries e
       JOIN ${TDB}.private_tournaments t ON t.tournament_id = e.tournament_id
      WHERE e.user_id = $1
      ORDER BY t.created_at DESC`,
    [userId],
  );
  return rows.map(mapEntryForUserRow);
}
