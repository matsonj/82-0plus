import { scryptSync, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { track } from "@vercel/analytics/server";
import { NextRequest } from "next/server";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { authenticate } from "@/lib/dailyResults";
import {
  EXPIRY_HOURS,
  normalizeTournamentName,
  validateCreateParams,
} from "@/lib/privateTournament";
import {
  computeBlindPrivateBoard,
  validateManualBoardPlayable,
  type PrivateBoard,
  type PrivateSlot,
} from "@/lib/privateBoard";
import {
  createPrivateTournament,
  getPrivateTournamentsByNameNorm,
} from "@/lib/privateTournamentQueries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/private-tournament/create — an admin creates a private tournament.
// Body: { adminName, adminPin, name, pin, mode, size, boardMode, manualSlots? }.
// The ADMIN identity and the TOURNAMENT identity are SEPARATE:
//   • adminName + adminPin — the signed-in account's saved creds (create-or-match
//     via authenticate); this is who owns/administers the tournament.
//   • name + pin — the tournament's OWN name and OWN PIN. The tournament name is
//     validated by validateCreateParams; the tournament PIN is salted-hashed onto
//     the tournament row so it can later be found by (tournament name + PIN).
// Backward-compat: if adminName/adminPin are absent, fall back to name/pin as the
// admin creds too (so older callers don't 500), but the four-field shape is the
// primary contract.
// The tournament UUID is generated BEFORE board generation so a blind board is
// seeded by it (deterministic). Returns { tournamentId, shareUrl }.

/** Loosely parse the admin's six manual slots: array of { team, decade }. */
function parseManualSlots(raw: unknown): PrivateSlot[] | null {
  if (!Array.isArray(raw)) return null;
  const out: PrivateSlot[] = [];
  for (const item of raw) {
    const r = (item ?? {}) as Record<string, unknown>;
    const team = String(r.team ?? "");
    const decade = Number(r.decade);
    if (!team || !Number.isFinite(decade)) return null;
    out.push({ team, decade });
  }
  return out;
}

export async function POST(req: NextRequest) {
  const sessionHint = getSessionHint(req);
  const queryOptions = { sessionHint: sessionHint.value };
  try {
    const body = await req.json();

    // ---- Validate + normalize create params (name/pin/mode/size/boardMode). ----
    const parsed = validateCreateParams({
      name: body?.name,
      pin: body?.pin,
      mode: body?.mode,
      size: body?.size,
      boardMode: body?.boardMode,
    });
    if (!parsed.ok) {
      return jsonWithSessionHint(
        sessionHint,
        { error: parsed.reason },
        { status: 400 },
      );
    }
    const { name, pin, mode, size, boardMode } = parsed.value;

    // Opt-in public listing (parsed loosely, like manualSlots — kept out of the
    // shared validateCreateParams shape). Default false = unlisted; only an
    // explicit `true` lists the tournament in the public browse feed.
    const isPublic = body?.isPublic === true;

    // ---- Admin account (create-or-match by the signed-in account's creds). ----
    // Primary contract: adminName/adminPin. Backward-compat: if those are absent,
    // fall back to the tournament's name/pin so older callers don't 500.
    const adminName =
      typeof body?.adminName === "string" && body.adminName !== ""
        ? body.adminName
        : name;
    const adminPin =
      typeof body?.adminPin === "string" && body.adminPin !== ""
        ? body.adminPin
        : pin;
    const auth = await authenticate(adminName, adminPin);
    if (!auth.ok) {
      return jsonWithSessionHint(
        sessionHint,
        { error: auth.reason },
        { status: 401 },
      );
    }

    // ---- Enforce (name + PIN) uniqueness. A name MAY repeat across tournaments,
    // but only with a DIFFERENT PIN: /lookup resolves a name+PIN to the FIRST row
    // whose PIN matches, so a second tournament sharing both name and PIN would be
    // permanently unreachable by the name+PIN flow (entrants would land in the
    // older bracket). Reject a PIN collision under the same normalized name. ----
    const nameNorm = normalizeTournamentName(name);
    const existing = await getPrivateTournamentsByNameNorm(nameNorm);
    const pinCollides = existing.some((t) => {
      const candidate = scryptSync(pin, t.pinSalt, 32);
      const stored = Buffer.from(t.pinHash, "hex");
      return (
        candidate.length === stored.length && timingSafeEqual(candidate, stored)
      );
    });
    if (pinCollides) {
      return jsonWithSessionHint(
        sessionHint,
        {
          error: "Error creating Tournament. Try again.",
        },
        { status: 409 },
      );
    }

    // ---- The tournament id is fixed UP FRONT so a blind board is seeded by it. ----
    const tournamentId = randomUUID();

    // ---- Build the board (validate-before-mutate; nothing is written yet). ----
    let board: PrivateBoard;
    if (boardMode === "blind") {
      try {
        board = await computeBlindPrivateBoard(tournamentId, queryOptions);
      } catch {
        return jsonWithSessionHint(
          sessionHint,
          { error: "couldn't generate a board; try again" },
          { status: 500 },
        );
      }
    } else {
      const manualSlots = parseManualSlots(body?.manualSlots);
      if (!manualSlots) {
        return jsonWithSessionHint(
          sessionHint,
          { error: "pick six teams for the board" },
          { status: 400 },
        );
      }
      const check = await validateManualBoardPlayable(manualSlots, queryOptions);
      if (!check.ok) {
        return jsonWithSessionHint(
          sessionHint,
          { error: check.reason },
          { status: 400 },
        );
      }
      board = check.board;
    }

    // ---- Hash the TOURNAMENT's own PIN for the tournament's name+PIN lookup. ----
    const salt = randomBytes(16).toString("hex");
    const pinHash = scryptSync(pin, salt, 32).toString("hex");

    const expiresAt = new Date(
      Date.now() + EXPIRY_HOURS * 60 * 60 * 1000,
    ).toISOString();

    // Pass the pre-generated id so the stored row and the blind board's seed agree.
    const storedId = await createPrivateTournament({
      tournamentId,
      name, // the TOURNAMENT's display name (already validated + normalized)
      nameNorm, // tournament name's lookup key (computed above)
      pinHash, // hash of the TOURNAMENT's own PIN
      pinSalt: salt,
      adminUserId: auth.userId, // the signed-in admin account
      adminName: auth.name, // the admin's authenticated display name
      mode,
      size,
      boardMode,
      board,
      expiresAt,
      isPublic,
    });

    // Telemetry: a private tournament was created. mode + size are the two knobs
    // worth breaking down by (within base Pro's 2-property cap).
    await track("tournament_created", { mode, size }).catch(() => {});

    return jsonWithSessionHint(sessionHint, {
      tournamentId: storedId,
      shareUrl: `/p/${storedId}`,
    });
  } catch (err) {
    console.error("[/api/private-tournament/create]", err);
    return jsonWithSessionHint(
      sessionHint,
      { error: "Couldn't create that tournament right now." },
      { status: 500 },
    );
  }
}
