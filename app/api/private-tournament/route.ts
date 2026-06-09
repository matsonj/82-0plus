import { scryptSync, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { normalizeName, validateName, validatePin } from "@/lib/tournamentValidation";
import { isExpired, needsAttention } from "@/lib/privateTournament";
import {
  getPrivateEntryRO,
  getPrivateTournamentRO,
  listPrivateEntriesRO,
} from "@/lib/privateTournamentReadQueries";
import { getUsersByNameRO } from "@/lib/tournamentReadQueries";
import { finalizePrivate } from "@/lib/privateTournamentFinalize";
import type { BracketResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/private-tournament?id=<uuid>[&name=&pin=] — the PUBLIC share endpoint
// (no PIN needed to VIEW). Reads through the read-only pool. If the tournament
// has EXPIRED but isn't completed, it LAZILY FINALIZES (then re-reads) so a share
// link always resolves to a real result eventually. Returns either:
//   • lobby  — { status:'open', size, mode, adminName, boardMode, submitted "7/16",
//               expiresAt, entries:[{userName,teamName,status}] } (NO rosters
//               leaked before completion); or
//   • final  — { status:'completed', bracket, championName, entries:[...] }.
// Optional name+pin (query) add entrant-specific fields (their entry status +
// provisional standing, and their bracket team id to highlight). Creds are
// verified against EXISTING accounts only (a public read never creates one).

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const sessionHint = getSessionHint(req);
  try {
    const id = req.nextUrl.searchParams.get("id") ?? "";
    if (!UUID_RE.test(id)) {
      return jsonWithSessionHint(sessionHint, { error: "invalid tournament id" }, { status: 400 });
    }

    let tournament = await getPrivateTournamentRO(id);
    if (!tournament) {
      return jsonWithSessionHint(sessionHint, { error: "tournament not found" }, { status: 404 });
    }

    // ---- Lazy finalize: expired + still open → resolve now, then re-read. ----
    if (tournament.status !== "completed" && isExpired(tournament.expiresAt, Date.now())) {
      const outcome = await finalizePrivate(id);
      if (!outcome.ok) {
        // Recoverable: tell the UI it can retry the GET (finalization is idempotent).
        return jsonWithSessionHint(
          sessionHint,
          { error: "still finalizing — try again in a moment", retryable: true },
          { status: 503 },
        );
      }
      const refreshed = await getPrivateTournamentRO(id);
      if (refreshed) tournament = refreshed;
    }

    // ---- Optional entrant identity (existing accounts only; never creates). ----
    let viewerUserId: string | null = null;
    const rawName = req.nextUrl.searchParams.get("name");
    const rawPin = req.nextUrl.searchParams.get("pin");
    if (rawName && rawPin && validateName(rawName).ok && validatePin(rawPin)) {
      const nameNorm = normalizeName(rawName);
      for (const u of await getUsersByNameRO(nameNorm)) {
        const candidate = scryptSync(rawPin, u.pin_salt, 32);
        const stored = Buffer.from(u.pin_hash, "hex");
        if (candidate.length === stored.length && timingSafeEqual(candidate, stored)) {
          viewerUserId = u.user_id;
          break;
        }
      }
    }

    const entries = await listPrivateEntriesRO(id);
    const submittedCount = entries.filter((e) => e.status === "submitted").length;

    // The viewer's own entry (for highlight + their provisional standing).
    let you:
      | {
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
          isAdmin: boolean;
        }
      | null = null;
    // Is the authenticated viewer this tournament's host? Surfaced on `you` so the
    // lobby/result can show the host-only "Delete tournament" control. Absent for
    // public viewers or any non-host (no creds → no `you` at all).
    const isAdmin = viewerUserId != null && tournament.adminUserId === viewerUserId;
    if (viewerUserId) {
      const myEntry = await getPrivateEntryRO(id, viewerUserId);
      if (myEntry) {
        you = {
          entryId: myEntry.entryId,
          status: myEntry.status,
          teamId: `entry:${myEntry.entryId}`,
          provisionalRecordW: myEntry.provisionalRecordW,
          provisionalRecordL: myEntry.provisionalRecordL,
          provisionalStatus: myEntry.provisionalStatus,
          finalRecordW: myEntry.finalRecordW,
          finalRecordL: myEntry.finalRecordL,
          finalStatus: myEntry.finalStatus,
          isAdmin,
          needsAttention: needsAttention({
            tournamentStatus: tournament.status,
            entryStatus: myEntry.status,
            viewedFinalAt: myEntry.viewedFinalAt,
          }),
        };
      } else if (isAdmin) {
        // The host may never have drafted a team. Still surface a minimal `you` so
        // the lobby/result can render the host-only delete control.
        you = {
          entryId: "",
          status: "host",
          teamId: "",
          provisionalRecordW: null,
          provisionalRecordL: null,
          provisionalStatus: null,
          finalRecordW: null,
          finalRecordL: null,
          finalStatus: null,
          isAdmin: true,
          needsAttention: false,
        };
      }
    }

    if (tournament.status === "completed") {
      const bracket = tournament.finalBracketJson as BracketResult | null;
      // Completed view: rosters are no longer secret — the stored bracket carries
      // each team's display roster. Surface per-entry final standings + names.
      return jsonWithSessionHint(sessionHint, {
        status: "completed",
        tournamentId: id,
        name: tournament.name,
        adminName: tournament.adminName,
        mode: tournament.mode,
        size: tournament.size,
        boardMode: tournament.boardMode,
        championName: tournament.championName,
        finalizedAt: tournament.finalizedAt,
        bracket: bracket && Array.isArray(bracket.teams) ? bracket : null,
        entries: entries.map((e) => ({
          userName: e.userName,
          teamName: e.teamName,
          status: e.status,
          finalRecordW: e.finalRecordW,
          finalRecordL: e.finalRecordL,
          finalStatus: e.finalStatus,
        })),
        you,
      });
    }

    // ---- Lobby (open): status only — NO rosters leaked before completion. ----
    return jsonWithSessionHint(sessionHint, {
      status: "open",
      tournamentId: id,
      name: tournament.name,
      adminName: tournament.adminName,
      mode: tournament.mode,
      size: tournament.size,
      boardMode: tournament.boardMode,
      submitted: `${submittedCount}/${tournament.size}`,
      submittedCount,
      filled: entries.length,
      expiresAt: tournament.expiresAt,
      entries: entries.map((e) => ({
        userName: e.userName,
        teamName: e.teamName,
        status: e.status,
      })),
      you,
    });
  } catch (err) {
    console.error("[/api/private-tournament]", err);
    return jsonWithSessionHint(sessionHint, { error: "Couldn't load that tournament right now." }, { status: 500 });
  }
}
