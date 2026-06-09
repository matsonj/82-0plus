import { NextRequest } from "next/server";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { authenticate } from "@/lib/dailyResults";
import { canPlay } from "@/lib/positions";
import { getOfferedIds } from "@/lib/queries";
import { simulateRoster } from "@/lib/scoring";
import { KINDS, parsePicks } from "@/lib/rosterParse";
import { isExpired } from "@/lib/privateTournament";
import { startersMatchBoard } from "@/lib/privateTournamentRun";
import {
  getPrivateEntry,
  getPrivateTournament,
  savePrivatePartial,
} from "@/lib/privateTournamentQueries";
import { hydrateTournamentRoster, buildTournamentTeam } from "@/lib/tournamentQueries";
import { validateTeamName, normalizeTeamName } from "@/lib/tournamentValidation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/private-tournament/partial — the interstitial 5-player save (no sixth
// man yet). Body: { name, pin, tournamentId, roster (5), captainSlot?, teamName? }.
// Validates the five against the tournament BOARD's starter slots (set-match, like
// daily) + position legality + off-list guard + distinct teams, hydrates, computes
// seedNet + reg-season W-L + teamBox, and saves as 'partial'. Does NOT count as a
// completed entry.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const sessionHint = getSessionHint(req);
  const queryOptions = { sessionHint: sessionHint.value };
  try {
    const body = await req.json();

    const tournamentId = String(body?.tournamentId ?? "");
    if (!UUID_RE.test(tournamentId)) {
      return jsonWithSessionHint(sessionHint, { error: "invalid tournament id" }, { status: 400 });
    }

    // ---- Roster SHAPE (5 distinct slots/players, well-formed teams). ----
    const picks = parsePicks(body?.roster);
    if (!picks) {
      return jsonWithSessionHint(sessionHint, { error: "invalid roster" }, { status: 400 });
    }

    const hasCaptain = body?.captainSlot != null;
    const captainSlot = Number(body?.captainSlot);
    if (hasCaptain && (!Number.isInteger(captainSlot) || captainSlot < 0 || captainSlot > 4)) {
      return jsonWithSessionHint(sessionHint, { error: "invalid captain" }, { status: 400 });
    }

    // ---- Optional team name. ----
    let teamName: string | null = null;
    if (body?.teamName != null && String(body.teamName) !== "") {
      const tn = validateTeamName(String(body.teamName));
      if (!tn.ok) {
        return jsonWithSessionHint(sessionHint, { error: `team name: ${tn.reason}` }, { status: 400 });
      }
      teamName = normalizeTeamName(String(body.teamName));
    }

    const auth = await authenticate(String(body?.name ?? ""), String(body?.pin ?? ""));
    if (!auth.ok) {
      return jsonWithSessionHint(sessionHint, { error: auth.reason }, { status: 401 });
    }

    const tournament = await getPrivateTournament(tournamentId);
    if (!tournament) {
      return jsonWithSessionHint(sessionHint, { error: "tournament not found" }, { status: 404 });
    }
    if (tournament.status === "completed") {
      return jsonWithSessionHint(sessionHint, { error: "this tournament is already finished" }, { status: 400 });
    }
    if (isExpired(tournament.expiresAt, Date.now())) {
      return jsonWithSessionHint(sessionHint, { error: "this tournament's entry window has closed" }, { status: 400 });
    }

    // ---- Must have an entry that's still in progress (not already submitted). ----
    const entry = await getPrivateEntry(tournamentId, auth.userId);
    if (!entry) {
      return jsonWithSessionHint(sessionHint, { error: "register for this tournament first" }, { status: 400 });
    }
    if (entry.status === "submitted" || entry.status === "bot_replaced") {
      return jsonWithSessionHint(sessionHint, { error: "your entry is already locked in" }, { status: 400 });
    }

    // ---- The five must match the board's starter slots (set-match). ----
    if (!startersMatchBoard(picks, tournament.board)) {
      return jsonWithSessionHint(sessionHint, { error: "those picks aren't from this tournament's board" }, { status: 400 });
    }

    // ---- Distinct teams across the five (the sixth man is added at submit). ----
    const teams = picks.map((p) => p.team);
    if (new Set(teams).size !== teams.length) {
      return jsonWithSessionHint(sessionHint, { error: "each player must come from a different team" }, { status: 400 });
    }

    // ---- Off-list guard: every pick must be a real offered player. ----
    for (const pk of picks) {
      const offered = await getOfferedIds(pk.team, pk.decade, queryOptions);
      if (!offered.has(pk.entity_id)) {
        return jsonWithSessionHint(sessionHint, { error: "that player wasn't in the draft list" }, { status: 400 });
      }
    }

    // ---- Hydrate the five + a placeholder sixth man so we can score the five.
    // savePrivatePartial only persists the five; we hydrate using the board's
    // BENCH slot as a throwaway sixth so hydrateTournamentRoster (which requires a
    // sixth) succeeds — but seedNet/teamBox are computed from the FIVE only.
    // Pick any offered bench player just to satisfy hydration is overkill; instead
    // score the five directly via simulateRoster on the hydrated starters.
    let hydrated;
    try {
      // Use the first board starter as a dummy bench pick — its stats are never
      // used (we score `hydrated.scoring`, the five). Any resolvable pick works.
      const dummySixth = {
        entity_id: picks[0].entity_id,
        team: picks[0].team,
        decade: picks[0].decade,
      };
      hydrated = await hydrateTournamentRoster(picks, dummySixth, queryOptions);
    } catch {
      return jsonWithSessionHint(sessionHint, { error: "unknown roster pick" }, { status: 400 });
    }

    // ---- Position legality: each starter must be eligible for its slot. ----
    for (let i = 0; i < picks.length; i++) {
      if (!canPlay(hydrated.players[i], KINDS[picks[i].slot])) {
        return jsonWithSessionHint(sessionHint, { error: "illegal lineup" }, { status: 400 });
      }
    }

    // ---- Score the FIVE (no buffs): seedNet, reg-season W-L, the 9-stat box. ----
    const sim = simulateRoster(hydrated.scoring);

    // Display names for the lobby list (captain flagged if chosen).
    const built = buildTournamentTeam({
      id: `entry:${entry.entryId}`,
      name: teamName ?? auth.name,
      isGhost: false,
      seedNet: sim.seedNet,
      hydrated,
      captainSlot: hasCaptain ? captainSlot : 0,
    });

    await savePrivatePartial({
      entryId: entry.entryId,
      rosterJson: picks,
      rosterDisplay: { roster: built.roster, sixthMan: built.sixthManInfo },
      seedNet: sim.seedNet,
      regW: sim.wins,
      regL: sim.losses,
      teamBoxJson: sim.teamBox,
      teamName,
    });

    return jsonWithSessionHint(sessionHint, {
      entryId: entry.entryId,
      status: "partial",
      regW: sim.wins,
      regL: sim.losses,
      seedNet: sim.seedNet,
      teamBox: sim.teamBox,
    });
  } catch (err) {
    console.error("[/api/private-tournament/partial]", err);
    return jsonWithSessionHint(sessionHint, { error: "Couldn't save that draft right now." }, { status: 500 });
  }
}
