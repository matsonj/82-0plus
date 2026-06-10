import { NextRequest } from "next/server";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { authenticate } from "@/lib/dailyResults";
import { parsePicks } from "@/lib/rosterParse";
import { savePrivatePartial } from "@/lib/privateTournamentQueries";
import { buildTournamentTeam } from "@/lib/tournamentQueries";
import { validateTeamName, normalizeTeamName } from "@/lib/tournamentValidation";
import {
  loadOpenPrivateEntry,
  validatePrivateStarters,
  hydratePrivateRoster,
} from "@/lib/privateRoster";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/private-tournament/partial — the interstitial 5-player save (no sixth
// man yet). Body: { name, pin, tournamentId, roster (5), captainSlot?, teamName? }.
// Validates the five against the tournament BOARD's starter slots (set-match, like
// daily) + position legality + off-list guard + distinct teams, hydrates, computes
// seedNet + reg-season W-L + teamBox, and saves as 'partial'. Does NOT count as a
// completed entry. The validate→hydrate→sim pipeline is shared with submit via
// lib/privateRoster; this route ORCHESTRATES it for the 5-only partial save.

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

    // ---- Tournament-open + entry-in-progress gate (shared with submit). ----
    const loaded = await loadOpenPrivateEntry({ tournamentId, userId: auth.userId });
    if (!loaded.ok) {
      return jsonWithSessionHint(sessionHint, { error: loaded.error }, { status: loaded.status });
    }
    const { tournament, entry } = loaded;

    // ---- The five must match the board's starter slots + distinct teams. ----
    const starters = validatePrivateStarters(picks, tournament.board);
    if (!starters.ok) {
      return jsonWithSessionHint(sessionHint, { error: starters.reason }, { status: 400 });
    }

    // ---- Off-list guard + hydrate + position legality + score the FIVE. ----
    const hydrate = await hydratePrivateRoster({
      picks,
      board: tournament.board,
      options: queryOptions,
    });
    if (!hydrate.ok) {
      return jsonWithSessionHint(sessionHint, { error: hydrate.error }, { status: hydrate.status });
    }
    const { hydrated, sim } = hydrate;

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
      // Full sim + roster lines so the interstitial can render the SHARED
      // ResultsPanel (the same post-selection screen the main game uses).
      result: sim,
      roster: hydrated.lines,
    });
  } catch (err) {
    console.error("[/api/private-tournament/partial]", err);
    return jsonWithSessionHint(sessionHint, { error: "Couldn't save that draft right now." }, { status: 500 });
  }
}
