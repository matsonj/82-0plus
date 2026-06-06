import { scryptSync, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";
import { simulateRoster } from "@/lib/scoring";
import { canPlay, type SlotKind } from "@/lib/positions";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import {
  validateName,
  validateTeamName,
  validatePin,
  normalizeName,
  normalizeTeamName,
} from "@/lib/tournamentValidation";
import { ensureSchema } from "@/lib/tournamentDb";
import {
  hydrateTournamentRoster,
  getStatNorms,
  drawOpponents,
  buildTournamentTeam,
  getUsersByName,
  insertUser,
  insertTeam,
} from "@/lib/tournamentQueries";
import { simulateBracket } from "@/lib/tournament";
import { deriveYou, deriveRecord, stripBreakdown } from "@/lib/tournamentRun";
import { verifyRoll } from "@/lib/tournamentToken";
import { isEligible, regWinsFromSeedNet, MIN_ELIGIBLE_WINS } from "@/lib/tier";
import { pacificDate } from "@/lib/dailyDate";
import { computeDailyBoard } from "@/lib/daily";
import { ensureDailyGhosts } from "@/lib/dailyGhosts";
import type { SimPick, TournamentRunResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-game modifier breakdown is debug-only; gate it server-side too (not just
// the UI), so the model internals aren't readable from the API in normal play.
const DEBUG = process.env.NEXT_PUBLIC_DEBUG === "1";

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

    // ---- Team name (the franchise shown in the bracket; distinct from user) ----
    const teamNameCheck = validateTeamName(String(body?.teamName ?? ""));
    if (!teamNameCheck.ok) {
      return jsonWithSessionHint(
        sessionHint,
        { error: `team name: ${teamNameCheck.reason}` },
        { status: 400 },
      );
    }
    const teamName = normalizeTeamName(String(body.teamName));

    // ---- Tournament mode: classic / hoopiq / daily. Each has its own pool. ----
    const mode = String(body?.mode ?? "");
    if (mode !== "classic" && mode !== "hoopiq" && mode !== "daily") {
      return jsonWithSessionHint(
        sessionHint,
        { error: "invalid mode" },
        { status: 400 },
      );
    }

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

    // ---- Provenance. Two models depending on mode:
    //   • classic/hoopiq — every pick carries a signed roll receipt (proof of a
    //     real server roll via /api/slot or the decade-skip);
    //   • daily — picks must match TODAY'S deterministic daily board (the daily
    //     analog of a receipt: the board is server-derived, so picks that don't
    //     match it are forgeries). No receipts are issued for daily slots. ----
    let dailyDate: string | null = null;
    if (mode === "daily") {
      const date = pacificDate();
      const board = await computeDailyBoard(date, queryOptions);
      if (!board.benchSlot || board.slots.length < KINDS.length) {
        return jsonWithSessionHint(
          sessionHint,
          { error: "the daily challenge can't be entered today" },
          { status: 400 },
        );
      }
      // Set-based: a daily player can place a slot's pick at any eligible lineup
      // position, so the five starters' (team, decade) must equal the board's
      // five slots as a SET (each used once) — not positionally. Bench separate.
      const boardKeys = new Set(
        board.slots.map((s) => `${s.team}|${s.decade}`),
      );
      const pickKeys = picks.map((p) => `${p.team}|${p.decade}`);
      const slotsMatch =
        pickKeys.length === board.slots.length &&
        new Set(pickKeys).size === pickKeys.length &&
        pickKeys.every((k) => boardKeys.has(k));
      const benchMatch =
        sixthPick.team === board.benchSlot.team &&
        sixthPick.decade === board.benchSlot.decade;
      if (!slotsMatch || !benchMatch) {
        return jsonWithSessionHint(
          sessionHint,
          { error: "those picks aren't from today's daily challenge" },
          { status: 400 },
        );
      }
      // Lazily generate this date's daily ghost field (idempotent) so the
      // bracket has opponents constrained to the same board.
      await ensureDailyGhosts(board, date, queryOptions);
      dailyDate = date;
    } else {
      const rawRoster = (Array.isArray(body?.roster) ? body.roster : []) as {
        receipt?: unknown;
      }[];
      const rawSixth = (body?.sixthPick ?? {}) as { receipt?: unknown };
      const receiptsOk =
        picks.every((p, i) =>
          verifyRoll(rawRoster[i]?.receipt, p.team, p.decade),
        ) && verifyRoll(rawSixth.receipt, sixthPick.team, sixthPick.decade);
      if (!receiptsOk) {
        return jsonWithSessionHint(
          sessionHint,
          { error: "roll your team in a real game first" },
          { status: 400 },
        );
      }
      // Each pick must come from its OWN server roll — distinct receipts (no
      // single signed roll reused across rows). Distinct teams (below) covers
      // the same ground since receipts are team-bound, but this is explicit.
      const allReceipts = [...rawRoster.map((r) => r?.receipt), rawSixth.receipt];
      if (new Set(allReceipts).size !== allReceipts.length) {
        return jsonWithSessionHint(
          sessionHint,
          { error: "each pick must come from its own roll" },
          { status: 400 },
        );
      }
    }

    // A real roster never repeats a team across the six (every mode): blocks
    // replaying one team across multiple rows and stacking one franchise's best.
    const allTeams = [...picks.map((p) => p.team), sixthPick.team];
    if (new Set(allTeams).size !== allTeams.length) {
      return jsonWithSessionHint(
        sessionHint,
        { error: "each player must come from a different team — re-roll a duplicate" },
        { status: 400 },
      );
    }

    await ensureSchema();

    // ---- Identity = the (name, PIN) PAIR (90s arcade auth). The same name with
    // a DIFFERENT PIN is a separate account; the same name + same PIN reuses the
    // existing account so its teams accumulate. No name is ever "taken". ----
    const pinMatches = (row: { pin_hash: string; pin_salt: string }): boolean => {
      const candidate = scryptSync(pin, row.pin_salt, 32);
      const stored = Buffer.from(row.pin_hash, "hex");
      return candidate.length === stored.length && timingSafeEqual(candidate, stored);
    };
    let userId: string | null = null;
    for (const u of await getUsersByName(nameNorm)) {
      if (pinMatches(u)) {
        userId = u.user_id;
        break;
      }
    }
    if (!userId) {
      const salt = randomBytes(16).toString("hex");
      const pinHash = scryptSync(pin, salt, 32).toString("hex");
      userId = await insertUser({ name, nameNorm, pinHash, pinSalt: salt });
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

    // ---- Tournament eligibility: a team must project to at least 40 wins (the
    // D-tier floor). Gating here means an ineligible team is never stored, so it
    // can never be drawn as an opponent either. ----
    if (!isEligible(seedNet)) {
      return jsonWithSessionHint(
        sessionHint,
        {
          error: `not tournament-eligible — this roster projects to ${regWinsFromSeedNet(
            seedNet,
          )} wins (need ${MIN_ELIGIBLE_WINS}+)`,
        },
        { status: 400 },
      );
    }

    // ---- Generate the team id up front so it's the bracket owner id ----
    // Multiple teams share a user/name, so the bracket owner must be the
    // unique teamId (not sub:name). The teamId also seeds simulateBracket so
    // each team's run is deterministic + unique.
    const teamId = randomUUID();
    const myTeam = buildTournamentTeam({
      id: `team:${teamId}`,
      name: teamName,
      isGhost: false,
      seedNet,
      hydrated,
      captainSlot,
    });

    const opponents = await drawOpponents(
      nameNorm,
      mode,
      seedNet,
      dailyDate,
      queryOptions,
    );
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
    const bracket = simulateBracket(field, teamId, statNorms);

    const you = deriveYou(bracket, myTeam.id);
    const rec = deriveRecord(bracket, myTeam.id);

    await insertTeam({
      teamId,
      userId,
      teamName,
      mode,
      dailyDate,
      rosterJson: picks,
      sixthJson: sixthPick,
      // Names for the teams-list roster peek (no extra bracket fetch needed).
      rosterDisplay: { roster: myTeam.roster, sixthMan: myTeam.sixthManInfo },
      captainSlot,
      seedNet,
      recordW: rec.recordW,
      recordL: rec.recordL,
      realizedMargin: rec.realizedMargin,
      reachedRound: rec.reachedRound,
      championName: bracket.championName,
      bracketJson: bracket,
    });

    // Strip the per-game modifier breakdown unless debug is on (don't leak the
    // model). The stored bracket_json keeps the full breakdown.
    const out = DEBUG ? bracket : stripBreakdown(bracket);
    return jsonWithSessionHint(
      sessionHint,
      { bracket: out, you, teamId } satisfies TournamentRunResponse,
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
