import { NextRequest } from "next/server";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { authenticate } from "@/lib/dailyResults";
import { parsePicks, parseSixth } from "@/lib/rosterParse";
import {
  listPrivateEntries,
  submitPrivateEntry,
} from "@/lib/privateTournamentQueries";
import { buildTournamentTeam } from "@/lib/tournamentQueries";
import { getStatNorms, runProvisional } from "@/lib/privateTournamentRun";
import {
  allSlotsSubmitted,
  finalizePrivate,
} from "@/lib/privateTournamentFinalize";
import { validateTeamName, normalizeTeamName } from "@/lib/tournamentValidation";
import {
  loadOpenPrivateEntry,
  validatePrivateStarters,
  hydratePrivateRoster,
} from "@/lib/privateRoster";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/private-tournament/submit — lock in a complete six. Body:
// { name, pin, tournamentId, roster (5), captainSlot, sixthPick, teamName }.
// Validates the full roster + sixth against the board (5 starters set-match +
// bench match + distinct teams + off-list + canPlay). The 40-win eligibility gate
// is RELAXED (private tournaments allow under-40 teams). Builds the entry team,
// runs a FROZEN provisional bracket, stores the provisional standing, and — if
// every slot is now submitted — finalizes. Returns the status + redirect target.
// The validate→hydrate→sim pipeline is shared with partial via lib/privateRoster;
// this route ORCHESTRATES it for the full six and then runs the provisional.

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

    // ---- Tournament-open + entry-in-progress gate (shared with partial). ----
    const loaded = await loadOpenPrivateEntry({ tournamentId, userId: auth.userId });
    if (!loaded.ok) {
      return jsonWithSessionHint(sessionHint, { error: loaded.error }, { status: loaded.status });
    }
    const { tournament, entry } = loaded;

    // ---- Five match the board's starter slots (set-match) + distinct teams. ----
    const starters = validatePrivateStarters(picks, tournament.board);
    if (!starters.ok) {
      return jsonWithSessionHint(sessionHint, { error: starters.reason }, { status: 400 });
    }

    // ---- Bench match + distinct (six) + off-list + hydrate + position + sim.
    // The 40-win eligibility gate is DELIBERATELY NOT applied here (private
    // tournaments allow under-40-win rosters — isEligible is intentionally not
    // called); seeding strength is the five's net with NO buffs. ----
    const hydrate = await hydratePrivateRoster({
      picks,
      sixthPick,
      board: tournament.board,
      options: queryOptions,
    });
    if (!hydrate.ok) {
      return jsonWithSessionHint(sessionHint, { error: hydrate.error }, { status: hydrate.status });
    }
    const { hydrated, sim } = hydrate;
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
      // The result label (e.g. "Champion", "Lost Play-In") — a PrivateResultLabel,
      // distinct from the tournament's open/completed lifecycle.
      provisionalStatus: prov.status,
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
