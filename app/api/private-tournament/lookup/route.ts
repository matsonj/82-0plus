import { NextRequest } from "next/server";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { validateName, validatePin } from "@/lib/tournamentValidation";
import {
  normalizeTournamentName,
  type PrivateTournamentSummary,
} from "@/lib/privateTournament";
import { getPrivateTournamentsByNameNorm } from "@/lib/privateTournamentQueries";
import { verifyPin } from "@/lib/pinHash";
import { clientIp } from "@/lib/apiAuth";
import { checkThrottle, recordFailure, recordSuccess } from "@/lib/authRateLimit";
import { pgThrottleStore } from "@/lib/authThrottleStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/private-tournament/lookup — find a private tournament by its
// name + PIN (the admin's creds at creation time). Body: { name, pin }.
// A tournament NAME is not unique (like a username), so we pick the row whose
// PIN verifies. Returns the lobby summary (no PIN/hash echoed) or a generic 404.

// One generic message for every miss so a caller can't enumerate names by diffing.
const NOT_FOUND = { error: "no tournament found with that name and PIN" };

export async function POST(req: NextRequest) {
  const sessionHint = getSessionHint(req);
  try {
    const body = await req.json();

    const nameCheck = validateName(String(body?.name ?? ""));
    if (!nameCheck.ok) {
      return jsonWithSessionHint(sessionHint, NOT_FOUND, { status: 404 });
    }
    const pin = String(body?.pin ?? "");
    if (!validatePin(pin)) {
      return jsonWithSessionHint(sessionHint, NOT_FOUND, { status: 404 });
    }
    const nameNorm = normalizeTournamentName(String(body.name));

    // Rate limit (#107): a create-free PIN verifier, so throttle brute-force. Keyed
    // by the TOURNAMENT name (`pt:<nameNorm>` — a separate namespace from the
    // account-auth `user:` keys, since this checks a tournament join PIN, not an
    // account PIN) plus the client IP. A well-formed miss records a failure; a hit
    // resets.
    const ip = clientIp(req);
    const keys = ip ? [`pt:${nameNorm}`, `ip:${ip}`] : [`pt:${nameNorm}`];
    const gate = await checkThrottle(pgThrottleStore, keys);
    if (!gate.allowed) {
      return jsonWithSessionHint(
        sessionHint,
        { error: "Too many attempts — wait a moment and try again." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(gate.retryAfterMs / 1000)) } },
      );
    }

    // Pick the tournament whose PIN verifies (verifyPin is length-guarded +
    // constant-time). Same generic 404 on any miss (no enum).
    const candidates = await getPrivateTournamentsByNameNorm(nameNorm);
    const match = candidates.find((t) => verifyPin(pin, t.pinHash, t.pinSalt));
    if (!match) {
      await recordFailure(pgThrottleStore, keys);
      return jsonWithSessionHint(sessionHint, NOT_FOUND, { status: 404 });
    }
    await recordSuccess(pgThrottleStore, keys);

    const summary: PrivateTournamentSummary = {
      tournamentId: match.tournamentId,
      name: match.name,
      adminName: match.adminName,
      mode: match.mode,
      size: match.size,
      boardMode: match.boardMode,
      status: match.status,
      expiresAt: match.expiresAt,
      finalizedAt: match.finalizedAt,
      championName: match.championName,
    };
    // `tournamentId` is surfaced at the top level (in addition to inside the
    // summary) so the join flow can reserve a slot via /register without digging
    // into the nested summary. `shareUrl` is kept for the share-card unfurl path.
    return jsonWithSessionHint(sessionHint, {
      tournamentId: match.tournamentId,
      tournament: summary,
      shareUrl: `/p/${match.tournamentId}`,
    });
  } catch (err) {
    console.error("[/api/private-tournament/lookup]", err);
    return jsonWithSessionHint(
      sessionHint,
      { error: "Couldn't look that up right now." },
      { status: 500 },
    );
  }
}
