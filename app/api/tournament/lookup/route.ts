import { scryptSync, timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { validateName, validatePin, normalizeName } from "@/lib/tournamentValidation";
import { getUsersByNameRO, getUserTeamsRO } from "@/lib/tournamentReadQueries";
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

    // Identity is the (name, PIN) pair — find the account whose PIN verifies
    // among any accounts sharing this name. timingSafeEqual throws on mismatched
    // lengths, so length-guard first. Same generic 404 on any miss (no enum).
    // Public, no-PIN-gated table access goes through the dedicated read-only
    // tournament pool (no DDL, low-privilege token — see lib/tournamentReadDb).
    const matchingUserIds: string[] = [];
    for (const u of await getUsersByNameRO(nameNorm)) {
      const candidate = scryptSync(pin, u.pin_salt, 32);
      const stored = Buffer.from(u.pin_hash, "hex");
      if (candidate.length === stored.length && timingSafeEqual(candidate, stored)) {
        matchingUserIds.push(u.user_id);
      }
    }
    if (matchingUserIds.length === 0) {
      return jsonWithSessionHint(sessionHint, NOT_FOUND, { status: 404 });
    }

    const teams = (
      await Promise.all(matchingUserIds.map((uid) => getUserTeamsRO(uid)))
    )
      .flat()
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
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
