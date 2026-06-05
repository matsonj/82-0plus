import { scryptSync, timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { validateName, validatePin, normalizeName } from "@/lib/tournamentValidation";
import { ensureSchema } from "@/lib/tournamentDb";
import {
  findSubmissionByName,
  getLatestTournamentForSubmission,
} from "@/lib/tournamentQueries";
import { deriveYou } from "@/lib/tournamentRun";
import type { BracketResult, TournamentRunResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Generic message used for every "couldn't authenticate" path so a caller can't
// enumerate which names exist by diffing the response (bad name === bad PIN ===
// no tournament yet → all 404 with the SAME body).
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

    const row = await findSubmissionByName(nameNorm);
    if (!row) {
      return jsonWithSessionHint(sessionHint, NOT_FOUND, { status: 404 });
    }

    // Re-hash the supplied PIN with the stored salt and compare in constant time.
    // timingSafeEqual throws on mismatched lengths, so guard the length first and
    // treat a length mismatch as a non-match (same generic 404).
    const candidate = scryptSync(pin, row.pin_salt, 32);
    const stored = Buffer.from(row.pin_hash, "hex");
    const matches =
      candidate.length === stored.length && timingSafeEqual(candidate, stored);
    if (!matches) {
      return jsonWithSessionHint(sessionHint, NOT_FOUND, { status: 404 });
    }

    const latest = await getLatestTournamentForSubmission(row.submission_id);
    if (!latest) {
      return jsonWithSessionHint(sessionHint, NOT_FOUND, { status: 404 });
    }

    // getLatestTournamentForSubmission already parses JSON columns, but be
    // defensive in case a string ever comes through.
    const bracket =
      typeof latest.bracket_json === "string"
        ? (JSON.parse(latest.bracket_json) as BracketResult)
        : (latest.bracket_json as BracketResult);

    const you = deriveYou(bracket, `sub:${nameNorm}`);
    return jsonWithSessionHint(
      sessionHint,
      { bracket, you } satisfies TournamentRunResponse,
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
