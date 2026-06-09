import "server-only";
import type { PrivateBoard } from "./privateBoard";
import type {
  PrivateBoardMode,
  PrivateEntryStatus,
  PrivateMode,
  PrivateSize,
  PrivateStatus,
} from "./privateTournament";
import type {
  PrivateEntryForUserRow,
  PrivateEntryRow,
  PrivateTournamentRow,
} from "./privateTournamentQueries";
import { queryTournamentRO } from "./tournamentReadDb";

// READ-ONLY private-tournament queries for the PUBLIC share path (no PIN needed
// to VIEW a tournament). Deliberate read-pool TWINS of the queryRW versions in
// lib/privateTournamentQueries.ts — same row mapping — but on the dedicated
// low-privilege tournament RO token/pool (lib/tournamentReadDb). They never run
// DDL; the tables are exposed via the `nba_tournament` MotherDuck share. An
// auto-updating share lags writes by ~1 min, acceptable for share-link reads.

const RO_DB = `${process.env.TOURNAMENT_RO_DB ?? "nba_tournament"}.main`;

/** Parse a stored JSON column (the pg endpoint returns JSON as a string). */
function parseJson<T>(value: unknown): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : (value as T);
}

/** Coerce a TIMESTAMP cell (Date or string) to an ISO string, or null. */
function toIso(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

// ── Raw DB row interfaces (snake_case, mirrors the RW file) ───────────────────

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

// ── Row mappers (identical shape to the RW versions) ──────────────────────────

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

// ── Column lists (mirror the RW file) ─────────────────────────────────────────

const TOURNAMENT_COLS = `tournament_id, name, name_norm, pin_hash, pin_salt,
            admin_user_id, admin_name, mode, size, board_mode, board_json,
            status, created_at, expires_at, finalized_at,
            final_bracket_json, champion_name`;

const ENTRY_COLS = `entry_id, tournament_id, user_id, user_name, team_name, status,
            roster_json, sixth_json, roster_display, captain_slot, seed_net,
            reg_w, reg_l, team_box_json,
            provisional_record_w, provisional_record_l, provisional_status,
            final_record_w, final_record_l, final_status,
            final_realized_margin, final_reached_round, viewed_final_at,
            created_at, submitted_at`;

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

// ── Public read paths ─────────────────────────────────────────────────────────

/** Full tournament row (board + final bracket parsed), or null. Public viewer. */
export async function getPrivateTournamentRO(
  tournamentId: string,
): Promise<PrivateTournamentRow | null> {
  const rows = await queryTournamentRO<TournamentDbRow>(
    `SELECT ${TOURNAMENT_COLS}
       FROM ${RO_DB}.private_tournaments
      WHERE tournament_id = $1
      LIMIT 1`,
    [tournamentId],
  );
  return rows[0] ? mapTournamentRow(rows[0]) : null;
}

/** All entries for a tournament, oldest first (public share view). */
export async function listPrivateEntriesRO(
  tournamentId: string,
): Promise<PrivateEntryRow[]> {
  const rows = await queryTournamentRO<EntryDbRow>(
    `SELECT ${ENTRY_COLS}
       FROM ${RO_DB}.private_entries
      WHERE tournament_id = $1
      ORDER BY created_at ASC`,
    [tournamentId],
  );
  return rows.map(mapEntryRow);
}

/** One entrant's row (entrant-specific highlight when creds are provided). */
export async function getPrivateEntryRO(
  tournamentId: string,
  userId: string,
): Promise<PrivateEntryRow | null> {
  const rows = await queryTournamentRO<EntryDbRow>(
    `SELECT ${ENTRY_COLS}
       FROM ${RO_DB}.private_entries
      WHERE tournament_id = $1 AND user_id = $2
      ORDER BY created_at ASC
      LIMIT 1`,
    [tournamentId, userId],
  );
  return rows[0] ? mapEntryRow(rows[0]) : null;
}

/** A user's private entries joined with their tournament (notifications read). */
export async function listPrivateEntriesForUserRO(
  userId: string,
): Promise<PrivateEntryForUserRow[]> {
  const rows = await queryTournamentRO<EntryForUserDbRow>(
    `SELECT ${ENTRY_FOR_USER_COLS}
       FROM ${RO_DB}.private_entries e
       JOIN ${RO_DB}.private_tournaments t ON t.tournament_id = e.tournament_id
      WHERE e.user_id = $1
      ORDER BY t.created_at DESC`,
    [userId],
  );
  return rows.map(mapEntryForUserRow);
}
