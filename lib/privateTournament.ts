// Private tournament — pure types + helpers for the invite-only tournament
// feature. A private tournament is created by an admin (name + PIN + a few
// options), runs for a fixed window, and finalizes into a bracket once full or
// expired. This module is PURE: no DB, no React, no Node-only imports — the same
// validators run in the client (instant form feedback) and the route handler
// (the real gate). It reuses the shared name/PIN validators in
// lib/tournamentValidation.ts. Style mirrors that file: small exported functions,
// heavy comments, camelCase fields.

import {
  normalizeName,
  validateTournamentName,
  validatePin,
} from "./tournamentValidation";

// ── Enums / unions ───────────────────────────────────────────────────────────

/** Which scoring pool a private tournament uses. "hoopiq" is the Ranked
 *  (stats-hidden) game; "classic" shows stats. Maps to the public label below. */
export type PrivateMode = "classic" | "hoopiq";

/** How the six-slot board is chosen (see lib/privateBoard.ts). */
export type PrivateBoardMode = "blind" | "manual";

/** Field size — the number of entrants (and bracket teams). */
export type PrivateSize = 4 | 8 | 12 | 16 | 20;

/** Lifecycle: "open" while accepting entries, "completed" once finalized. */
export type PrivateStatus = "open" | "completed";

/** An entry's bracket RESULT label (the `statusLabel` output) — e.g. "Champion",
 *  "Lost Finals", "Lost Play-In". This is the displayed outcome of a run, NOT the
 *  tournament lifecycle (PrivateStatus). Kept a string alias because the value is
 *  produced/stored as free text; the alias just marks intent so it never gets
 *  conflated with PrivateStatus. */
export type PrivateResultLabel = string;

/** The legal field sizes, in ascending order. */
export const PRIVATE_SIZES: readonly PrivateSize[] = [4, 8, 12, 16, 20];

/** Per-entry lifecycle. registered = joined, no roster yet; partial = mid-draft;
 *  submitted = a complete six locked in; bot_replaced = the entrant timed out and
 *  a board-constrained bot took their slot at finalize. */
export type PrivateEntryStatus =
  | "registered"
  | "partial"
  | "submitted"
  | "bot_replaced";

// ── Summaries (mirror the data model) ─────────────────────────────────────────

/** A private tournament row, shaped for list/detail views (camelCase). */
export interface PrivateTournamentSummary {
  tournamentId: string;
  name: string;
  adminName: string; // the creator's (normalized) username
  mode: PrivateMode;
  size: PrivateSize;
  boardMode: PrivateBoardMode;
  status: PrivateStatus;
  expiresAt: string; // ISO timestamp the open window closes
  finalizedAt: string | null; // ISO timestamp the bracket was resolved; null while open
  championName: string | null; // winning team's name once completed; null while open
}

/** A PUBLIC (listed) tournament row for the browsable "open to everyone" list.
 *  No PIN/hash — this is the anonymous, credential-free discovery surface; a
 *  reader taps through to /p/<id> and joins with their own account creds. Carries
 *  the live entrant count so the list can show "5 / 8 joined" + a Full badge. */
export interface PublicTournamentSummary {
  tournamentId: string;
  name: string;
  adminName: string; // the host's (normalized) username — shown as "host: <name>"
  mode: PrivateMode;
  size: PrivateSize;
  boardMode: PrivateBoardMode;
  entryCount: number; // entrants registered so far (any pre-final state)
  expiresAt: string; // ISO timestamp the open window closes
}

/** One entrant's row within a private tournament (camelCase). */
export interface PrivateEntrySummary {
  entryId: string;
  userName: string; // the entrant's (normalized) username
  teamName: string | null; // this entry's franchise name (null until chosen)
  status: PrivateEntryStatus;
  seedNet: number | null; // seeding net rating once a roster is submitted; null before
  // Registration record — the entrant's own provisional simulate before the
  // bracket exists (their roster's projected regular-season W-L).
  regW: number | null;
  regL: number | null;
  // Provisional bracket standing (computed as others submit, before finalize).
  provisionalRecordW: number | null;
  provisionalRecordL: number | null;
  provisionalStatus: PrivateResultLabel | null;
  // Final bracket standing (after finalize).
  finalRecordW: number | null;
  finalRecordL: number | null;
  finalStatus: PrivateResultLabel | null;
  // When this entrant last opened the finished bracket (for the unread badge).
  viewedFinalAt: string | null;
}

// ── Labels ─────────────────────────────────────────────────────────────────

/** Public label for the mode. hoopiq is the Ranked game; classic shows stats. */
export function privateModeLabel(mode: PrivateMode): "Ranked" | "Classic" {
  return mode === "hoopiq" ? "Ranked" : "Classic";
}

/** Render the "X / Y joined" count for a public tournament row, plus whether it's
 *  full. Full is INCLUSIVE: once entrants reach the field size the slots are gone
 *  (the register route then rejects with "this tournament is full"). Counts are
 *  clamped at 0 so a malformed negative never renders. */
export function formatPublicSpots(
  entryCount: number,
  size: PrivateSize,
): { text: string; full: boolean } {
  const joined = Math.max(0, entryCount);
  return { text: `${joined} / ${size}`, full: joined >= size };
}

// ── Create-params validation ─────────────────────────────────────────────────

/** Raw create input (loosely typed — it comes off a form / request body). */
export interface CreatePrivateParams {
  name?: unknown;
  pin?: unknown;
  mode?: unknown;
  size?: unknown;
  boardMode?: unknown;
}

/** Normalized, fully-typed create params once validated. */
export interface NormalizedCreateParams {
  name: string;
  pin: string;
  mode: PrivateMode;
  size: PrivateSize;
  boardMode: PrivateBoardMode;
}

/**
 * Canonical storage form of a tournament name — identical rule to a username:
 * trim, uppercase, collapse internal whitespace. Re-exported as its own name so
 * callers don't have to know it shares normalizeName's implementation.
 */
export function normalizeTournamentName(name: string): string {
  return normalizeName(name);
}

const MODES: readonly PrivateMode[] = ["classic", "hoopiq"];
const BOARD_MODES: readonly PrivateBoardMode[] = ["blind", "manual"];

/**
 * Validate + normalize the create-tournament form. Checks, in order: the
 * tournament name (same charset/length/profanity rule as a username), the PIN
 * (4–6 digits), the mode, the size, and the board mode. Returns the normalized
 * value on success or a short, player-facing reason on the first failure.
 */
export function validateCreateParams(
  input: CreatePrivateParams,
):
  | { ok: true; value: NormalizedCreateParams }
  | { ok: false; reason: string } {
  const rawName = typeof input.name === "string" ? input.name : "";
  const nameCheck = validateTournamentName(rawName);
  if (!nameCheck.ok) return { ok: false, reason: nameCheck.reason };
  const name = normalizeTournamentName(rawName);

  const pin = typeof input.pin === "string" ? input.pin : "";
  if (!validatePin(pin)) {
    return { ok: false, reason: "PIN must be 4–6 digits" };
  }

  const mode = input.mode;
  if (typeof mode !== "string" || !MODES.includes(mode as PrivateMode)) {
    return { ok: false, reason: "pick a valid mode" };
  }

  const size = input.size;
  if (
    typeof size !== "number" ||
    !PRIVATE_SIZES.includes(size as PrivateSize)
  ) {
    return { ok: false, reason: "size must be 4, 8, 12, 16 or 20" };
  }

  const boardMode = input.boardMode;
  if (
    typeof boardMode !== "string" ||
    !BOARD_MODES.includes(boardMode as PrivateBoardMode)
  ) {
    return { ok: false, reason: "pick a valid board mode" };
  }

  return {
    ok: true,
    value: {
      name,
      pin,
      mode: mode as PrivateMode,
      size: size as PrivateSize,
      boardMode: boardMode as PrivateBoardMode,
    },
  };
}

// ── Expiry ─────────────────────────────────────────────────────────────────

/** A private tournament's open window, in hours, before it auto-finalizes. */
export const EXPIRY_HOURS = 24;

/**
 * True iff `expiresAtISO` is in the past relative to `nowMs` (epoch millis). The
 * boundary is EXCLUSIVE: exactly at the expiry instant is NOT yet expired (it
 * becomes expired one millisecond later), so a freshly-created tournament whose
 * expiry equals `now + window` reads as not expired.
 */
export function isExpired(expiresAtISO: string, nowMs: number): boolean {
  return nowMs > Date.parse(expiresAtISO);
}

// ── Per-entry completion window (PUBLIC tournaments only) ─────────────────────

/** Minutes a PUBLIC-tournament entrant has, measured from register (created_at),
 *  to lock in a full six before their slot is freed and the entry removed. Private
 *  tournaments have NO per-entry limit — this is unused for them. Kept as a single
 *  constant so the pure helpers, the purge SQL, and the browse-count SQL never
 *  drift. */
export const ENTRY_COMPLETION_MINUTES = 10;

/** The ISO instant an entry's completion window closes: created_at + N minutes.
 *  Returns null when there is NO active window — i.e. the tournament isn't public,
 *  or the entry is already submitted/bot_replaced (a locked entry can never be
 *  kicked). This is the value the client counts down to; null hides the countdown
 *  entirely (and encodes "public + still open" without shipping a separate flag). */
export function entryDeadlineISO(args: {
  createdAtISO: string;
  isPublic: boolean;
  status: PrivateEntryStatus;
}): string | null {
  if (!args.isPublic) return null;
  if (args.status !== "registered" && args.status !== "partial") return null;
  return new Date(
    Date.parse(args.createdAtISO) + ENTRY_COMPLETION_MINUTES * 60_000,
  ).toISOString();
}

/** True iff a PUBLIC entrant blew their completion window: `nowMs` is past
 *  created_at + N minutes AND the entry is still incomplete (registered|partial).
 *  submitted|bot_replaced are NEVER expired. Boundary is EXCLUSIVE, mirroring
 *  isExpired (exactly at the deadline is NOT yet expired). Callers gate on public
 *  BEFORE calling — this helper only reasons about time + status. */
export function isEntryExpired(
  createdAtISO: string,
  nowMs: number,
  status: PrivateEntryStatus,
): boolean {
  if (status !== "registered" && status !== "partial") return false;
  return nowMs > Date.parse(createdAtISO) + ENTRY_COMPLETION_MINUTES * 60_000;
}

/** Whether an entry occupies a slot for the PUBLIC browse count — the pure twin of
 *  the SQL FILTER in PUBLIC_TOURNAMENT_LIST_COLS (privateTournamentRows.ts). A slot
 *  is occupied iff the entry is locked (submitted|bot_replaced) OR still inside its
 *  live completion window; stale incomplete entries drop out (they're about to be
 *  purged). Keep this predicate and that SQL structurally identical. */
export function countsTowardPublicSpots(args: {
  status: PrivateEntryStatus;
  createdAtISO: string;
  nowMs: number;
}): boolean {
  if (args.status === "submitted" || args.status === "bot_replaced") return true;
  return (
    args.nowMs <=
    Date.parse(args.createdAtISO) + ENTRY_COMPLETION_MINUTES * 60_000
  );
}

// ── Notifications ────────────────────────────────────────────────────────────

/** The minimal shape needsAttention reasons about (a subset of the summaries). */
export interface AttentionInput {
  tournamentStatus: PrivateStatus;
  entryStatus: PrivateEntryStatus;
  viewedFinalAt: string | null;
}

/**
 * Does this entry need the user's attention (a badge in the menu)? The rule:
 *   • PENDING-OPEN — the tournament is still open AND the entry is in any
 *     pre-final state (registered | partial | submitted): the user has unfinished
 *     business or a result still cooking. (bot_replaced never pings — the slot
 *     was handed off, there's nothing for the user to do.)
 *   • COMPLETED-UNVIEWED — the tournament has completed and the user hasn't
 *     opened the final bracket yet (viewedFinalAt is null): an unread result.
 * Otherwise (completed + already viewed, or an open bot_replaced entry) → false.
 */
export function needsAttention(entry: AttentionInput): boolean {
  if (entry.tournamentStatus === "open") {
    return (
      entry.entryStatus === "registered" ||
      entry.entryStatus === "partial" ||
      entry.entryStatus === "submitted"
    );
  }
  // completed
  return entry.viewedFinalAt === null;
}
