import { scryptSync, timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { validateName, validatePin, normalizeName } from "@/lib/tournamentValidation";
import { ensureSchema } from "@/lib/tournamentDb";
import { findUserByName, getUserTeams } from "@/lib/tournamentQueries";
import type { TournamentLookupResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Generic message used for every "couldn't authenticate" path so a caller can't
// enumerate which names exist by diffing the response (bad name === bad PIN ===
// no user → all 404 with the SAME body).
const NOT_FOUND = { error: "no team found with that name and PIN" };

export async function POST(req: NextRequest) {
  const sessionHint = getSessionHint(req);
  try {
    const body = await req.json();

    // Basic charset/length check on the name (a stored name always passed this).
    const nameCheck = validateName(String(body?.name ?? ""));
    if (!nameCheck.ok) {
      return jsonWithSessionHint(sessionHint, NOT_FOUND, { status: 404 });
    }
    const pin = String(body?.pin ?? "");
    if (!validatePin(pin)) {
      return jsonWithSessionHint(sessionHint, NOT_FOUND, { status: 404 });
    }
    const nameNorm = normalizeName(String(body.name));

    await ensureSchema();

    const user = await findUserByName(nameNorm);
    if (!user) {
      return jsonWithSessionHint(sessionHint, NOT_FOUND, { status: 404 });
    }

    // Re-hash the supplied PIN with the stored salt and compare in constant time.
    // timingSafeEqual throws on mismatched lengths, so guard the length first and
    // treat a length mismatch as a non-match (same generic 404, no enumeration).
    const candidate = scryptSync(pin, user.pin_salt, 32);
    const stored = Buffer.from(user.pin_hash, "hex");
    const matches =
      candidate.length === stored.length && timingSafeEqual(candidate, stored);
    if (!matches) {
      return jsonWithSessionHint(sessionHint, NOT_FOUND, { status: 404 });
    }

    const teams = await getUserTeams(user.user_id);
    return jsonWithSessionHint(
      sessionHint,
      { name: nameNorm, teams } satisfies TournamentLookupResponse,
    );
  } catch (err) {
    console.error("[/api/tournament/lookup]", err);
    return jsonWithSessionHint(
      sessionHint,
      { error: "Couldn't look that up right now." },
      { status: 500 },
    );
  }
}
