import { NextRequest } from "next/server";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { requireAuth } from "@/lib/apiAuth";
import { isUuid } from "@/lib/uuid";
import { parsePicks, parseSixth } from "@/lib/rosterParse";
import {
  listPrivateEntries,
  submitPrivateEntry,
} from "@/lib/privateTournamentQueries";
import { buildTournamentTeam } from "@/lib/tournamentQueries";
import { getStatNorms, runProvisional } from "@/lib/privateTournamentRun";
import { isHeadToHead } from "@/lib/privateTournament";
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

export async function POST(req: NextRequest) {
  const sessionHint = getSessionHint(req);
  const queryOptions = { sessionHint: sessionHint.value };
  try {
    const body = await req.json();

    const tournamentId = String(body?.tournamentId ?? "");
    if (!isUuid(tournamentId)) {
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

    const auth = await requireAuth(req, sessionHint, body?.name, body?.pin);
    if (!auth.ok) return auth.response;

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
    // SKIPPED for head-to-head: a size-2 provisional is this entry vs ONE bot, so
    // it resolves to "Champion" or "Lost Finals" — it would read as the match
    // result before the opponent has even drafted. Nulls here leave the columns
    // empty and the lobby's `!= null` guard hides the line entirely.
    const prov = isHeadToHead(tournament.size)
      ? null
      : await runProvisional(
          entryTeam,
          tournament.board,
          tournamentId,
          entry.entryId,
          tournament.size,
          await getStatNorms(queryOptions),
          queryOptions,
        );

    const submitted = await submitPrivateEntry({
      entryId: entry.entryId,
      rosterJson: picks,
      sixthJson: sixthPick,
      captainSlot,
      rosterDisplay: { roster: entryTeam.roster, sixthMan: entryTeam.sixthManInfo },
      provisionalRecordW: prov?.recordW ?? null,
      provisionalRecordL: prov?.recordL ?? null,
      // The result label (e.g. "Champion", "Lost Play-In") — a PrivateResultLabel,
      // distinct from the tournament's open/completed lifecycle. Null for H2H.
      provisionalStatus: prov?.status ?? null,
      teamName,
    });
    if (!submitted.ok) {
      // The write matched no in-progress row; skip the eager finalize. `gone` =
      // purged (10-min timeout) → removed (410); `locked` = a concurrent submit or
      // finalize already advanced this entry → conflict (409). Never clobbers a
      // submitted/bot_replaced row, never false-succeeds.
      return submitted.reason === "gone"
        ? jsonWithSessionHint(
            sessionHint,
            {
              error:
                "Your 10-minute window expired — you were removed. Rejoin if there's still room.",
            },
            { status: 410 },
          )
        : jsonWithSessionHint(
            sessionHint,
            { error: "This entry is already locked in." },
            { status: 409 },
          );
    }

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
      // null for head-to-head, which runs no provisional (see above).
      provisional: prov,
      teamId: entryTeam.id,
      redirect: `/p/${tournamentId}`,
    });
  } catch (err) {
    console.error("[/api/private-tournament/submit]", err);
    return jsonWithSessionHint(sessionHint, { error: "Couldn't submit that entry right now." }, { status: 500 });
  }
}
