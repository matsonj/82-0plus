import { scryptSync, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { normalizeName, validateName, validatePin } from "@/lib/tournamentValidation";
import { isExpired, needsAttention } from "@/lib/privateTournament";
import {
  getPrivateEntry,
  getPrivateTournament,
  listPrivateEntries,
} from "@/lib/privateTournamentQueries";
import { getUsersByName } from "@/lib/tournamentQueries";
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

    // ---- Lazy finalize: expired + still open → resolve now, then re-read (RW). ----
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
      const refreshed = await getPrivateTournament(id);
      if (refreshed) tournament = refreshed;
    }

    const entries = await listPrivateEntries(id);
    const submittedCount = entries.filter((e) => e.status === "submitted").length;

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
    const viewerUserId = await matchExistingUser(body?.name, body?.pin);
    if (!viewerUserId) {
      // No creds / bad creds / no such account → no entrant-specific state.
      return jsonWithSessionHint(sessionHint, { you: null });
    }

    const isAdmin = tournament.adminUserId === viewerUserId;
    const myEntry = await getPrivateEntry(id, viewerUserId);

    if (myEntry) {
      return jsonWithSessionHint(sessionHint, {
        you: {
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
          provisionalRecordW: null,
          provisionalRecordL: null,
          provisionalStatus: null,
          finalRecordW: null,
          finalRecordL: null,
          finalStatus: null,
          isAdmin: true,
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

/**
 * Verify a (name, PIN) pair against EXISTING accounts only and return the user_id,
 * or null. Mirrors authenticate()'s PIN check but NEVER creates an account — this
 * is a public read path. Validates shape first; reuses the RW user lookup for
 * read-your-writes (a freshly registered entrant can authenticate immediately).
 */
async function matchExistingUser(
  rawName: unknown,
  rawPin: unknown,
): Promise<string | null> {
  const name = typeof rawName === "string" ? rawName : "";
  const pin = typeof rawPin === "string" ? rawPin : "";
  if (!name || !pin || !validateName(name).ok || !validatePin(pin)) return null;
  const nameNorm = normalizeName(name);
  for (const u of await getUsersByName(nameNorm)) {
    const candidate = scryptSync(pin, u.pin_salt, 32);
    const stored = Buffer.from(u.pin_hash, "hex");
    if (candidate.length === stored.length && timingSafeEqual(candidate, stored)) {
      return u.user_id;
    }
  }
  return null;
}
