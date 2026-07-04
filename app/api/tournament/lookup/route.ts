import { NextRequest } from "next/server";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { validateName, validatePin, normalizeName } from "@/lib/tournamentValidation";
import { getUsersByNameRO, getUserTeamsRO } from "@/lib/tournamentReadQueries";
import { verifyPin } from "@/lib/pinHash";
import {
  clientIp,
  publicAttemptKeys,
  publicThrottleCheck,
  publicThrottleFail,
  publicThrottleSuccess,
} from "@/lib/apiAuth";
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

    // Rate limit (#107): this is a create-free PIN verifier, so it's a prime
    // brute-force target. Share the account subject with authenticate()
    // (`user:<nameNorm>`); attemptKeys() adds a per-IP brake + a (name+IP)
    // composite so a remote attacker can't lock a victim's name. Best-effort +
    // fail-open (public route: never runs DDL, never 500s on a throttle blip).
    const { gate: gateKeys, subject: subjectKeys } = publicAttemptKeys(
      `user:${nameNorm}`,
      clientIp(req),
    );
    const gate = await publicThrottleCheck(gateKeys);
    if (!gate.allowed) {
      return jsonWithSessionHint(
        sessionHint,
        { error: "Too many attempts — wait a moment and try again." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(gate.retryAfterMs / 1000)) } },
      );
    }

    // Identity is the (name, PIN) pair — find the account whose PIN verifies
    // among any accounts sharing this name (verifyPin is length-guarded +
    // constant-time). Same generic 404 on any miss (no enum). Public, no-PIN-gated
    // table access goes through the dedicated read-only Postgres pool (no DDL,
    // low-privilege DATABASE_URL_RO — see lib/oltpReadDb).
    const matchingUserIds: string[] = [];
    for (const u of await getUsersByNameRO(nameNorm)) {
      if (verifyPin(pin, u.pin_hash, u.pin_salt)) {
        matchingUserIds.push(u.user_id);
      }
    }
    if (matchingUserIds.length === 0) {
      await publicThrottleFail(gateKeys);
      return jsonWithSessionHint(sessionHint, NOT_FOUND, { status: 404 });
    }
    await publicThrottleSuccess(subjectKeys);

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
