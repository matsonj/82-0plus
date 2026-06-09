// Wire shapes for the private-tournament client flow. These mirror the JSON the
// route handlers return (app/api/private-tournament/*). Kept here so every
// private component shares one source of truth without re-declaring inline.

import type { BracketResult, SimResult, SimRosterLine } from "@/lib/types";
import type { PrivateBoard } from "@/lib/privateBoard";
import type { PrivateMode, PrivateBoardMode } from "@/lib/privateTournament";

// The viewer's own entry, attached to a GET when valid creds are supplied.
export interface PrivateYou {
  entryId: string;
  status: string;
  teamId: string;
  provisionalRecordW: number | null;
  provisionalRecordL: number | null;
  provisionalStatus: string | null;
  finalRecordW: number | null;
  finalRecordL: number | null;
  finalStatus: string | null;
  needsAttention: boolean;
  // True only when the viewer's creds identify them as the tournament's host —
  // gates the host-only "Delete tournament" control. Absent/false otherwise.
  isAdmin?: boolean;
}

// One entrant row in the lobby (open) view — NO roster leaked before completion.
export interface PrivateLobbyEntry {
  userName: string;
  teamName: string | null;
  status: string;
}

// GET response while the tournament is open (lobby).
export interface PrivateLobbyResponse {
  status: "open";
  tournamentId: string;
  name: string;
  adminName: string;
  mode: PrivateMode;
  size: number;
  boardMode: PrivateBoardMode;
  submitted: string; // "7/16"
  submittedCount: number;
  filled: number;
  expiresAt: string;
  entries: PrivateLobbyEntry[];
  you: PrivateYou | null;
}

// One entrant row in the completed view (final standings).
export interface PrivateCompletedEntry {
  userName: string;
  teamName: string | null;
  status: string;
  finalRecordW: number | null;
  finalRecordL: number | null;
  finalStatus: string | null;
}

// GET response once the tournament is completed (final).
export interface PrivateCompletedResponse {
  status: "completed";
  tournamentId: string;
  name: string;
  adminName: string;
  mode: PrivateMode;
  size: number;
  boardMode: PrivateBoardMode;
  championName: string | null;
  finalizedAt: string | null;
  bracket: BracketResult | null;
  entries: PrivateCompletedEntry[];
  you: PrivateYou | null;
}

export type PrivateGetResponse =
  | PrivateLobbyResponse
  | PrivateCompletedResponse;

// POST /register and /register-idempotent response (the board + entry).
export interface PrivateRegisterResponse {
  entryId: string;
  status: string;
  board: PrivateBoard;
  size: number;
  mode: PrivateMode;
}

// POST /partial response (the interstitial reg-season record). `result` + `roster`
// mirror /api/simulate so the interstitial can render the shared ResultsPanel.
export interface PrivatePartialResponse {
  entryId: string;
  status: string;
  regW: number;
  regL: number;
  seedNet: number;
  teamBox: unknown;
  result: SimResult;
  roster: SimRosterLine[];
}

// POST /submit response.
export interface PrivateSubmitResponse {
  status: string;
  finalized: boolean;
  provisional: { recordW: number; recordL: number; status: string };
  teamId: string;
  redirect: string;
}
