import { NextRequest } from "next/server";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { authenticate } from "@/lib/dailyResults";
import { canPlay } from "@/lib/positions";
import { getOfferedIds } from "@/lib/queries";
import { simulateRoster } from "@/lib/scoring";
import { KINDS, parsePicks, parseSixth } from "@/lib/rosterParse";
import { isExpired } from "@/lib/privateTournament";
import {
  getPrivateEntry,
  getPrivateTournament,
  listPrivateEntries,
  submitPrivateEntry,
} from "@/lib/privateTournamentQueries";
import {
  hydrateTournamentRoster,
  buildTournamentTeam,
} from "@/lib/tournamentQueries";
import {
  getStatNorms,
  runProvisional,
} from "@/lib/privateTournamentRun";
import {
  allSlotsSubmitted,
  finalizePrivate,
} from "@/lib/privateTournamentFinalize";
import { validateTeamName, normalizeTeamName } from "@/lib/tournamentValidation";
import type { PrivateStatus } from "@/lib/privateTournament";
import { startersMatchBoard } from "@/lib/privateTournamentRun";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/private-tournament/submit — lock in a complete six. Body:
// { name, pin, tournamentId, roster (5), captainSlot, sixthPick, teamName }.
// Validates the full roster + sixth against the board (5 starters set-match +
// bench match + distinct teams + off-list + canPlay). The 40-win eligibility gate
// is RELAXED (private tournaments allow under-40 teams). Builds the entry team,
// runs a FROZEN provisional bracket, stores the provisional standing, and — if
// every slot is now submitted — finalizes. Returns the status + redirect target.

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

    // ---- Roster + sixth + captain SHAPE. ----
    const picks = parsePicks(body?.roster);
    if (!picks) {
      return jsonWithSessionHint(sessionHint, { error: "invalid roster" }, { status: 400 });
    }
    const captainSlot = Number(body?.captainSlot);
    if (!Number.isInteger(captainSlot) || captainSlot < 0 || captainSlot > 4) {
      return jsonWithSessionHint(sessionHint, { error: "invalid captain" }, { status: 400 });
    }
    const sixthPick = parseSixth(body?.sixthPick);
    if (!sixthPick) {
      return jsonWithSessionHint(sessionHint, { error: "invalid sixth man" }, { status: 400 });
    }
    if (picks.some((p) => p.entity_id === sixthPick.entity_id)) {
      return jsonWithSessionHint(sessionHint, { error: "sixth man already in the starting five" }, { status: 400 });
    }

    // ---- Team name (required at submit, like the public submit). ----
    const tnCheck = validateTeamName(String(body?.teamName ?? ""));
    if (!tnCheck.ok) {
      return jsonWithSessionHint(sessionHint, { error: `team name: ${tnCheck.reason}` }, { status: 400 });
    }
    const teamName = normalizeTeamName(String(body.teamName));

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

    const entry = await getPrivateEntry(tournamentId, auth.userId);
    if (!entry) {
      return jsonWithSessionHint(sessionHint, { error: "register for this tournament first" }, { status: 400 });
    }
    if (entry.status === "submitted" || entry.status === "bot_replaced") {
      return jsonWithSessionHint(sessionHint, { error: "your entry is already locked in" }, { status: 400 });
    }

    // ---- Five match the board's starter slots (set-match); bench matches too. ----
    if (!startersMatchBoard(picks, tournament.board)) {
      return jsonWithSessionHint(sessionHint, { error: "those picks aren't from this tournament's board" }, { status: 400 });
    }
    const bench = tournament.board.benchSlot;
    if (sixthPick.team !== bench.team || sixthPick.decade !== bench.decade) {
      return jsonWithSessionHint(sessionHint, { error: "that sixth man isn't from this tournament's board" }, { status: 400 });
    }

    // ---- Distinct teams across all six. ----
    const allTeams = [...picks.map((p) => p.team), sixthPick.team];
    if (new Set(allTeams).size !== allTeams.length) {
      return jsonWithSessionHint(sessionHint, { error: "each player must come from a different team" }, { status: 400 });
    }

    // ---- Off-list guard: every pick (incl. the sixth) must be a real offered player. ----
    for (const pk of [...picks, sixthPick]) {
      const offered = await getOfferedIds(pk.team, pk.decade, queryOptions);
      if (!offered.has(pk.entity_id)) {
        return jsonWithSessionHint(sessionHint, { error: "that player wasn't in the draft list" }, { status: 400 });
      }
    }

    // ---- Hydrate the six. ----
    let hydrated;
    try {
      hydrated = await hydrateTournamentRoster(picks, sixthPick, queryOptions);
    } catch {
      return jsonWithSessionHint(sessionHint, { error: "unknown roster pick" }, { status: 400 });
    }

    // ---- Position legality. ----
    for (let i = 0; i < picks.length; i++) {
      if (!canPlay(hydrated.players[i], KINDS[picks[i].slot])) {
        return jsonWithSessionHint(sessionHint, { error: "illegal lineup" }, { status: 400 });
      }
    }

    // ---- Seeding strength: the five's net with NO buffs. The 40-win
    // eligibility gate is DELIBERATELY NOT applied here (private tournaments allow
    // under-40-win rosters — isEligible is intentionally not called). ----
    const sim = simulateRoster(hydrated.scoring);
    const seedNet = sim.seedNet;

    const entryTeam = buildTournamentTeam({
      id: `entry:${entry.entryId}`,
      name: teamName,
      isGhost: false,
      seedNet,
      hydrated,
      captainSlot,
    });

    // ---- Frozen provisional run vs board bots (stable per entry). ----
    const statNorms = await getStatNorms(queryOptions);
    const prov = await runProvisional(
      entryTeam,
      tournament.board,
      tournamentId,
      entry.entryId,
      tournament.size,
      statNorms,
      queryOptions,
    );

    await submitPrivateEntry({
      entryId: entry.entryId,
      sixthJson: sixthPick,
      captainSlot,
      rosterDisplay: { roster: entryTeam.roster, sixthMan: entryTeam.sixthManInfo },
      provisionalRecordW: prov.recordW,
      provisionalRecordL: prov.recordL,
      // The status column stores the human round label (a free string); the typed
      // column is PrivateStatus, so cast at the boundary.
      provisionalStatus: prov.status as PrivateStatus,
      teamName,
    });

    // ---- Eager finalize: if every slot is now submitted, resolve the bracket. ----
    let finalized = false;
    const entries = await listPrivateEntries(tournamentId);
    if (allSlotsSubmitted(entries, tournament.size)) {
      const outcome = await finalizePrivate(tournamentId, queryOptions);
      finalized = outcome.ok;
    }

    return jsonWithSessionHint(sessionHint, {
      status: "submitted",
      finalized,
      provisional: { recordW: prov.recordW, recordL: prov.recordL, status: prov.status },
      teamId: entryTeam.id,
      redirect: `/p/${tournamentId}`,
    });
  } catch (err) {
    console.error("[/api/private-tournament/submit]", err);
    return jsonWithSessionHint(sessionHint, { error: "Couldn't submit that entry right now." }, { status: 500 });
  }
}
