import { scryptSync, randomBytes } from "crypto";
import { NextRequest } from "next/server";
import { simulateRoster } from "@/lib/scoring";
import { canPlay, type SlotKind } from "@/lib/positions";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import {
  validateName,
  validatePin,
  normalizeName,
} from "@/lib/tournamentValidation";
import { ensureSchema } from "@/lib/tournamentDb";
import {
  hydrateTournamentRoster,
  getStatNorms,
  drawOpponents,
  buildTournamentTeam,
  findSubmissionByName,
  insertSubmission,
  insertTournament,
} from "@/lib/tournamentQueries";
import { simulateBracket } from "@/lib/tournament";
import { deriveYou } from "@/lib/tournamentRun";
import type { SimPick, TournamentRunResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Must mirror the client lineup board (same as /api/simulate).
const KINDS: SlotKind[] = ["G", "FLEX", "W", "FLEX", "B"];

// 5 entries, distinct slots covering all of [G,FLEX,W,FLEX,B], distinct players,
// team matches /^[A-Z]{3}$/. Identical logic to /api/simulate's parsePicks.
function parsePicks(raw: unknown): SimPick[] | null {
  if (!Array.isArray(raw) || raw.length !== KINDS.length) return null;
  const picks: SimPick[] = [];
  const slotsSeen = new Set<number>();
  const idsSeen = new Set<string>();
  for (const item of raw) {
    const r = (item ?? {}) as Record<string, unknown>;
    const entity_id = String(r.entity_id ?? "");
    const team = String(r.team ?? "");
    const decade = Number(r.decade);
    const slot = Number(r.slot);
    if (
      !entity_id ||
      !/^[A-Z]{3}$/.test(team) ||
      !Number.isInteger(decade) ||
      !Number.isInteger(slot) ||
      slot < 0 ||
      slot >= KINDS.length ||
      slotsSeen.has(slot) ||
      idsSeen.has(entity_id)
    ) {
      return null;
    }
    slotsSeen.add(slot);
    idsSeen.add(entity_id);
    picks.push({ entity_id, team, decade, slot });
  }
  return picks;
}

interface SixthPick {
  entity_id: string;
  team: string;
  decade: number;
}

/** Validate the sixth man payload shape; null on malformed input. */
function parseSixth(raw: unknown): SixthPick | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const entity_id = String(r.entity_id ?? "");
  const team = String(r.team ?? "");
  const decade = Number(r.decade);
  if (
    !entity_id ||
    !/^[A-Z]{3}$/.test(team) ||
    !Number.isInteger(decade)
  ) {
    return null;
  }
  return { entity_id, team, decade };
}

export async function POST(req: NextRequest) {
  const sessionHint = getSessionHint(req);
  const queryOptions = { sessionHint: sessionHint.value };
  try {
    const body = await req.json();

    // ---- Identity ----
    const nameCheck = validateName(String(body?.name ?? ""));
    if (!nameCheck.ok) {
      return jsonWithSessionHint(
        sessionHint,
        { error: nameCheck.reason },
        { status: 400 },
      );
    }
    const pin = String(body?.pin ?? "");
    if (!validatePin(pin)) {
      return jsonWithSessionHint(
        sessionHint,
        { error: "PIN must be 4–6 digits" },
        { status: 400 },
      );
    }
    const name = String(body.name);
    const nameNorm = normalizeName(name);

    // ---- Roster shape ----
    const picks = parsePicks(body?.roster);
    if (!picks) {
      return jsonWithSessionHint(
        sessionHint,
        { error: "invalid roster" },
        { status: 400 },
      );
    }

    const captainSlot = Number(body?.captainSlot);
    if (!Number.isInteger(captainSlot) || captainSlot < 0 || captainSlot > 4) {
      return jsonWithSessionHint(
        sessionHint,
        { error: "invalid captain" },
        { status: 400 },
      );
    }

    const sixthPick = parseSixth(body?.sixthPick);
    if (!sixthPick) {
      return jsonWithSessionHint(
        sessionHint,
        { error: "invalid sixth man" },
        { status: 400 },
      );
    }
    // The sixth man must not duplicate one of the five starters.
    if (picks.some((p) => p.entity_id === sixthPick.entity_id)) {
      return jsonWithSessionHint(
        sessionHint,
        { error: "sixth man already in the starting five" },
        { status: 400 },
      );
    }

    await ensureSchema();

    // ---- One-per-name uniqueness gate ----
    const existing = await findSubmissionByName(nameNorm);
    if (existing) {
      return jsonWithSessionHint(
        sessionHint,
        { error: "that name is taken — pick another" },
        { status: 409 },
      );
    }

    // ---- Hydrate roster (six players) ----
    let hydrated;
    try {
      hydrated = await hydrateTournamentRoster(picks, sixthPick, queryOptions);
    } catch {
      return jsonWithSessionHint(
        sessionHint,
        { error: "unknown roster pick" },
        { status: 400 },
      );
    }

    // Every starter must be eligible for the lineup slot it claims.
    for (let i = 0; i < picks.length; i++) {
      if (!canPlay(hydrated.players[i], KINDS[picks[i].slot])) {
        return jsonWithSessionHint(
          sessionHint,
          { error: "illegal lineup" },
          { status: 400 },
        );
      }
    }

    // ---- Seeding strength: the five's net rating with NO tournament buffs ----
    const seedNet = simulateRoster(hydrated.scoring).netRating;

    // ---- PIN hashing (low-stakes arcade lock) ----
    const salt = randomBytes(16).toString("hex");
    const pinHash = scryptSync(pin, salt, 32).toString("hex");

    const submissionId = await insertSubmission({
      name,
      nameNorm,
      pinHash,
      pinSalt: salt,
      rosterJson: picks,
      sixthJson: sixthPick,
      captainSlot,
      seedNet,
    });

    // ---- Build MY team and the 16-team field ----
    const myTeam = buildTournamentTeam({
      id: `sub:${nameNorm}`,
      name: nameNorm,
      isGhost: false,
      seedNet,
      hydrated,
      captainSlot,
    });

    const opponents = await drawOpponents(nameNorm, queryOptions);
    const field = [myTeam, ...opponents];
    if (field.length !== 16) {
      return jsonWithSessionHint(
        sessionHint,
        { error: "tournament field unavailable — seed ghosts" },
        { status: 500 },
      );
    }

    // ---- Simulate + persist the bracket ----
    const statNorms = await getStatNorms(queryOptions);
    const bracket = simulateBracket(field, submissionId, statNorms);

    await insertTournament({
      ownerSubmission: submissionId,
      championName: bracket.championName,
      bracketJson: bracket,
    });

    const you = deriveYou(bracket, myTeam.id);
    return jsonWithSessionHint(
      sessionHint,
      { bracket, you } satisfies TournamentRunResponse,
    );
  } catch (err) {
    console.error("[/api/tournament/submit]", err);
    return jsonWithSessionHint(
      sessionHint,
      { error: "Couldn't run that tournament right now." },
      { status: 500 },
    );
  }
}
