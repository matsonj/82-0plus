import { NextRequest } from "next/server";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { jsonPublicCacheable } from "@/lib/publicCache";
import {
  entryDeadlineISO,
  isEntryExpired,
  isExpired,
  needsAttention,
} from "@/lib/privateTournament";
import {
  getPrivateEntry,
  getPrivateTournament,
  listPrivateEntries,
  purgeStaleIncompleteEntries,
} from "@/lib/privateTournamentQueries";
import { findExistingUserByCredentials } from "@/lib/dailyResults";
import { finalizePrivate } from "@/lib/privateTournamentFinalize";
import type { BracketResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /api/private-tournament — the PUBLIC share endpoint for a private tournament.
//
// GET ?id=<uuid>  — CREDENTIAL-FREE. Returns ONLY the shared lobby/bracket (no
//   `you`). Reads through the RW pool (read-your-writes) so a just-created lobby
//   never 404s and a just-finalized tournament never renders stale — the RO share
//   can lag writes ~1 min, which this page (hit right after create/register/
//   submit/finalize) can't tolerate. If the tournament has EXPIRED but isn't
//   completed it LAZILY FINALIZES (then re-reads via RW) so a share link always
//   resolves to a real result. Returns either:
//     • lobby  — { status:'open', size, mode, adminName, boardMode, submitted
//                 "7/16", expiresAt, entries:[{userName,teamName,status}] } (NO
//                 rosters leaked before completion); or
//     • final  — { status:'completed', bracket, championName, entries:[...] }.
//
// POST { name, pin, tournamentId } — entrant-specific state (the `you` object).
//   PINs are the reusable account credential, so they must NEVER ride in a GET
//   query string (logs/history/referrers). The viewer's entry status, provisional
//   /final standing, teamId highlight, isAdmin and needsAttention come back here
//   via a request BODY instead. Creds verify against EXISTING accounts only — a
//   public read NEVER creates one.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const sessionHint = getSessionHint(req);
  try {
    const id = req.nextUrl.searchParams.get("id") ?? "";
    if (!UUID_RE.test(id)) {
      return jsonWithSessionHint(sessionHint, { error: "invalid tournament id" }, { status: 400 });
    }

    // Read-your-writes: the RW pool, so a lobby created/updated moments ago is
    // visible immediately (the RO share lags ~1 min — unacceptable for this page).
    let tournament = await getPrivateTournament(id);
    if (!tournament) {
      return jsonWithSessionHint(sessionHint, { error: "tournament not found" }, { status: 404 });
    }

    // ---- Per-entrant timeout (PUBLIC only): purge stale incomplete entries BEFORE
    // any lazy finalize. Order matters: an EXPIRING public tournament must finalize
    // with the timed-out slots FREED (finalize fills them with generic bots) rather
    // than converting kicked entrants into named bot_replaced bracket entries. This
    // also keeps the lobby's filled count honest and lets a kicked entrant who
    // reloads see they're gone. Only touches an open tournament. ----
    if (tournament.status === "open" && tournament.isPublic) {
      await purgeStaleIncompleteEntries({ tournamentId: id, isPublic: true });
    }

    // ---- Lazy finalize: expired + still open → resolve now, then re-read (RW). ----
    if (tournament.status !== "completed" && isExpired(tournament.expiresAt, Date.now())) {
      const outcome = await finalizePrivate(id);
      if (!outcome.ok) {
        // Recoverable: tell the UI it can retry the GET (finalization is idempotent).
        return jsonWithSessionHint(
          sessionHint,
          { error: "still finalizing; try again in a moment", retryable: true },
          { status: 503 },
        );
      }
      const refreshed = await getPrivateTournament(id);
      if (refreshed) tournament = refreshed;
    }

    const entries = await listPrivateEntries(id);
    const submittedCount = entries.filter((e) => e.status === "submitted").length;

    if (tournament.status === "completed") {
      const bracket = tournament.finalBracketJson as BracketResult | null;
      // Completed view: rosters are no longer secret — the stored bracket carries
      // each team's display roster. Surface per-entry final standings + names.
      //
      // "completed" is a terminal, immutable, credential-free state (no `you`), so
      // this 200 is CDN-cached and drops the session-hint cookie — share links to
      // finished tournaments are the long tail of traffic here. Only this branch
      // caches: the "open" lobby and the 503 lazy-finalize path stay dynamic.
      // Tradeoff (accepted): if a host DELETEs a finished tournament, the edge can
      // keep serving it until the stale window (~1 day) lapses.
      return jsonPublicCacheable({
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
          entryId: e.entryId,
          userName: e.userName,
          teamName: e.teamName,
          status: e.status,
          regW: e.regW,
          regL: e.regL,
          finalRealizedMargin: e.finalRealizedMargin,
          finalRecordW: e.finalRecordW,
          finalRecordL: e.finalRecordL,
          finalStatus: e.finalStatus,
        })),
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
    });
  } catch (err) {
    console.error("[/api/private-tournament GET]", err);
    return jsonWithSessionHint(sessionHint, { error: "Couldn't load that tournament right now." }, { status: 500 });
  }
}

// POST /api/private-tournament — entrant-specific `you` for a tournament. Body:
// { name, pin, tournamentId }. Creds (the reusable account PIN) go in the BODY,
// never a URL. Verified against EXISTING accounts ONLY (never creates — this is a
// public read path). Returns { you } where `you` is the viewer's entry highlight
// /standing, a minimal host stub (if they host but never drafted), or null (creds
// don't match any account, or match a non-host with no entry). Always 200 with
// you:null for a clean "you're not in this one" — auth here is best-effort, not a
// gate (the GET already served the shared view publicly).
export async function POST(req: NextRequest) {
  const sessionHint = getSessionHint(req);
  try {
    const body = await req.json().catch(() => ({}));

    const id = String(body?.tournamentId ?? "");
    if (!UUID_RE.test(id)) {
      return jsonWithSessionHint(sessionHint, { error: "invalid tournament id" }, { status: 400 });
    }

    const tournament = await getPrivateTournament(id);
    if (!tournament) {
      return jsonWithSessionHint(sessionHint, { error: "tournament not found" }, { status: 404 });
    }

    // ---- Resolve entrant identity (existing accounts only; NEVER creates). ----
    const viewer = await findExistingUserByCredentials(body?.name, body?.pin);
    if (!viewer) {
      // No creds / bad creds / no such account → no entrant-specific state.
      return jsonWithSessionHint(sessionHint, { you: null });
    }
    const viewerUserId = viewer.userId;

    const isAdmin = tournament.adminUserId === viewerUserId;
    const myEntry = await getPrivateEntry(id, viewerUserId);

    // PUBLIC per-entrant timeout: if the viewer's own entry blew its 10-minute
    // window, treat them as removed — purge the dead row and don't return an entry
    // `you` (they fall through to the host stub below if they also host). This keeps
    // `you` consistent with the freed slot even if GET and POST interleave oddly.
    const myEntryLive =
      myEntry &&
      tournament.isPublic &&
      isEntryExpired(myEntry.createdAt, Date.now(), myEntry.status)
        ? null
        : myEntry;
    if (myEntry && !myEntryLive) {
      await purgeStaleIncompleteEntries({ tournamentId: id, isPublic: true });
    }

    if (myEntryLive) {
      return jsonWithSessionHint(sessionHint, {
        you: {
          entryId: myEntryLive.entryId,
          status: myEntryLive.status,
          teamId: `entry:${myEntryLive.entryId}`,
          regW: myEntryLive.regW,
          regL: myEntryLive.regL,
          seedNet: myEntryLive.seedNet,
          provisionalRecordW: myEntryLive.provisionalRecordW,
          provisionalRecordL: myEntryLive.provisionalRecordL,
          provisionalStatus: myEntryLive.provisionalStatus,
          finalRecordW: myEntryLive.finalRecordW,
          finalRecordL: myEntryLive.finalRecordL,
          finalStatus: myEntryLive.finalStatus,
          isAdmin,
          entryExpiresAt: entryDeadlineISO({
            createdAtISO: myEntryLive.createdAt,
            isPublic: tournament.isPublic,
            status: myEntryLive.status,
          }),
          needsAttention: needsAttention({
            tournamentStatus: tournament.status,
            entryStatus: myEntryLive.status,
            viewedFinalAt: myEntryLive.viewedFinalAt,
          }),
        },
      });
    }

    if (isAdmin) {
      // The host may never have drafted a team. Still surface a minimal `you` so
      // the lobby/result can render the host-only delete control.
      return jsonWithSessionHint(sessionHint, {
        you: {
          entryId: "",
          status: "host",
          teamId: "",
          regW: null,
          regL: null,
          seedNet: null,
          provisionalRecordW: null,
          provisionalRecordL: null,
          provisionalStatus: null,
          finalRecordW: null,
          finalRecordL: null,
          finalStatus: null,
          isAdmin: true,
          entryExpiresAt: null,
          needsAttention: false,
        },
      });
    }

    // Authenticated, but not the host and not entered → nothing entrant-specific.
    return jsonWithSessionHint(sessionHint, { you: null });
  } catch (err) {
    console.error("[/api/private-tournament POST]", err);
    return jsonWithSessionHint(sessionHint, { error: "Couldn't load your entry right now." }, { status: 500 });
  }
}
