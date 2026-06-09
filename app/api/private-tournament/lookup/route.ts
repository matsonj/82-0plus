import { scryptSync, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { validateName, validatePin } from "@/lib/tournamentValidation";
import {
  normalizeTournamentName,
  type PrivateTournamentSummary,
} from "@/lib/privateTournament";
import { getPrivateTournamentsByNameNorm } from "@/lib/privateTournamentQueries";

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

    // Pick the tournament whose PIN verifies. timingSafeEqual throws on mismatched
    // lengths, so length-guard first. Same generic 404 on any miss (no enum).
    const candidates = await getPrivateTournamentsByNameNorm(nameNorm);
    const match = candidates.find((t) => {
      const candidate = scryptSync(pin, t.pinSalt, 32);
      const stored = Buffer.from(t.pinHash, "hex");
      return candidate.length === stored.length && timingSafeEqual(candidate, stored);
    });
    if (!match) {
      return jsonWithSessionHint(sessionHint, NOT_FOUND, { status: 404 });
    }

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
    return jsonWithSessionHint(sessionHint, {
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
