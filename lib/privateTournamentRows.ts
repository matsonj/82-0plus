import type { PrivateBoard } from "./privateBoard";
import type {
  PrivateBoardMode,
  PrivateEntryStatus,
  PrivateMode,
  PrivateResultLabel,
  PrivateSize,
  PrivateStatus,
  PublicTournamentSummary,
} from "./privateTournament";
import { ENTRY_COMPLETION_MINUTES } from "./privateTournament";

// SHARED private-tournament row contract: the single source of truth for the
// raw DB row shapes, the camelCase mapped types, the SELECT column lists, the
// JSON/date coercion helpers, and the row→object mappers. Both the RW pool
// (lib/privateTournamentQueries.ts) and the RO pool
// (lib/privateTournamentReadQueries.ts) import from here, so a column rename or
// addition lands in ONE place and the two read paths can never silently
// diverge. This module is executor-agnostic — it knows nothing about queryRW
// vs queryTournamentRO; the query files inject the executor and the DB name.

// ── Coercion helpers ──────────────────────────────────────────────────────────

/** Parse a stored JSON column (the pg endpoint returns JSON as a string). */
export function parseJson<T>(value: unknown): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : (value as T);
}

/** Coerce a TIMESTAMP cell (Date or string) to an ISO string, or null. */
export function toIso(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

// ── Mapped (camelCase) row shapes ─────────────────────────────────────────────

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
  isPublic: boolean; // listed in the public "open to everyone" browse list
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
  provisionalStatus: PrivateResultLabel | null;
  finalRecordW: number | null;
  finalRecordL: number | null;
  finalStatus: PrivateResultLabel | null;
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
  provisionalStatus: PrivateResultLabel | null;
  finalRecordW: number | null;
  finalRecordL: number | null;
  finalStatus: PrivateResultLabel | null;
  finalReachedRound: number | null;
  viewedFinalAt: string | null;
}

// ── Raw DB row interfaces (snake_case, as returned by the pg endpoint) ────────

export interface TournamentDbRow {
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
  is_public: boolean;
}

export interface EntryDbRow {
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

export interface EntryForUserDbRow {
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

// ── SELECT column lists ───────────────────────────────────────────────────────

export const PRIVATE_TOURNAMENT_COLS = `tournament_id, name, name_norm, pin_hash, pin_salt,
            admin_user_id, admin_name, mode, size, board_mode, board_json,
            status, created_at, expires_at, finalized_at,
            final_bracket_json, champion_name, is_public`;

export const PRIVATE_ENTRY_COLS = `entry_id, tournament_id, user_id, user_name, team_name, status,
            roster_json, sixth_json, roster_display, captain_slot, seed_net,
            reg_w, reg_l, team_box_json,
            provisional_record_w, provisional_record_l, provisional_status,
            final_record_w, final_record_l, final_status,
            final_realized_margin, final_reached_round, viewed_final_at,
            created_at, submitted_at`;

export const PRIVATE_ENTRY_FOR_USER_COLS = `e.entry_id AS entry_id, e.tournament_id AS tournament_id,
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

// ── Row mappers (raw snake_case → typed camelCase) ────────────────────────────

export function mapTournamentRow(r: TournamentDbRow): PrivateTournamentRow {
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
    isPublic: r.is_public ?? false,
  };
}

export function mapEntryRow(r: EntryDbRow): PrivateEntryRow {
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
    provisionalStatus: r.provisional_status ?? null,
    finalRecordW: r.final_record_w ?? null,
    finalRecordL: r.final_record_l ?? null,
    finalStatus: r.final_status ?? null,
    finalRealizedMargin: r.final_realized_margin ?? null,
    finalReachedRound: r.final_reached_round ?? null,
    viewedFinalAt: toIso(r.viewed_final_at),
    createdAt: toIso(r.created_at) ?? "",
    submittedAt: toIso(r.submitted_at),
  };
}

export function mapEntryForUserRow(r: EntryForUserDbRow): PrivateEntryForUserRow {
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
    provisionalStatus: r.provisional_status ?? null,
    finalRecordW: r.final_record_w ?? null,
    finalRecordL: r.final_record_l ?? null,
    finalStatus: r.final_status ?? null,
    finalReachedRound: r.final_reached_round ?? null,
    viewedFinalAt: toIso(r.viewed_final_at),
  };
}

// ── Public browse list (aggregate; RO-only) ───────────────────────────────────
// A bespoke shape for the anonymous "open to everyone" list: tournament summary
// fields + a live entrant COUNT, and deliberately NO pin_hash/pin_salt (this is
// the credential-free discovery surface). Lives here so the RO read path shares
// the same column list + mapper convention as every other row.

/** Raw aggregate row for the public browse list (snake_case, from the pg endpoint). */
export interface PublicTournamentDbRow {
  tournament_id: string;
  name: string;
  admin_name: string;
  mode: string;
  size: number;
  board_mode: string;
  expires_at: string | Date;
  entry_count: number; // COUNT(entries)::int — coerced to a JS number by the pool
}

/** SELECT list for the public browse query. Aliased off `t` (tournaments) joined
 *  with `e` (entries); pair with `GROUP BY t.tournament_id`. No PIN columns.
 *
 *  entry_count counts a slot as occupied iff the entry is locked (submitted; also
 *  bot_replaced, which can't appear while open but is harmless/defensive) OR still
 *  inside its per-entry completion window. Stale incomplete entries (registered/
 *  partial past the window) drop out — mirroring what the purge would DELETE, but
 *  read-only, so the RO browse count matches reality without a write. Keep this
 *  FILTER structurally identical to countsTowardPublicSpots() in privateTournament.ts. */
export const PUBLIC_TOURNAMENT_LIST_COLS = `t.tournament_id AS tournament_id, t.name AS name,
            t.admin_name AS admin_name, t.mode AS mode, t.size AS size,
            t.board_mode AS board_mode, t.expires_at AS expires_at,
            COUNT(e.entry_id) FILTER (
              WHERE e.status IN ('submitted', 'bot_replaced')
                 OR e.created_at > now() - interval '${ENTRY_COMPLETION_MINUTES} minutes'
            )::int AS entry_count`;

export function mapPublicTournamentRow(
  r: PublicTournamentDbRow,
): PublicTournamentSummary {
  return {
    tournamentId: r.tournament_id,
    name: r.name,
    adminName: r.admin_name,
    mode: r.mode as PrivateMode,
    size: r.size as PrivateSize,
    boardMode: r.board_mode as PrivateBoardMode,
    entryCount: r.entry_count ?? 0,
    expiresAt: toIso(r.expires_at) ?? "",
  };
}
