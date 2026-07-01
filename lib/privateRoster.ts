// Private-tournament roster service. The partial (5-player draft save) and
// submit (full six lock-in) routes share almost the entire validate→hydrate→sim
// pipeline; this module owns that pipeline so the routes only ORCHESTRATE
// (partial-vs-final) instead of each carrying a local copy. The validation ORDER
// and the exact player-facing error STRINGS here mirror the original routes
// verbatim, so behaviour and messages are unchanged.
//
// Three pieces:
//   • loadOpenPrivateEntry  — load the tournament + this user's entry and gate on
//     "tournament still open" + "entry still in progress". UUID is validated by
//     the caller. Returns the loaded rows or a structured { error, status }.
//   • validatePrivateStarters — the five starters match the board's starter slots
//     (set-match) + distinct starter teams. PURE (no I/O).
//   • hydratePrivateRoster — bench-match (when a sixth is provided) + distinct
//     teams (over the five, or the six when includeSixth) + off-list guard +
//     hydrate + position legality + simulateRoster. Returns the hydrated roster +
//     sim both routes need, or a structured { error } on the first failure.

import { canPlay } from "./positions";
import { getOfferedIds } from "./queries";
import { simulateRoster } from "./scoring";
import { KINDS } from "./rosterParse";
import type { SixthPick } from "./rosterParse";
import { isEntryExpired, isExpired } from "./privateTournament";
import { startersMatchBoard } from "./privateTournamentRun";
import {
  getPrivateEntry,
  getPrivateTournament,
  purgeStaleIncompleteEntries,
  type PrivateEntryRow,
  type PrivateTournamentRow,
} from "./privateTournamentQueries";
import {
  hydrateTournamentRoster,
  type HydratedTournamentRoster,
} from "./tournamentQueries";
import type { QueryOptions } from "./motherduck";
import type { SimPick, SimResult } from "./types";

// ── Load + gate the open tournament and the in-progress entry ─────────────────

export interface LoadOpenPrivateEntryArgs {
  tournamentId: string; // UUID — already format-validated by the caller
  userId: string;
}

/** A loaded {tournament, entry} or a structured player-facing error + status. */
export type LoadOpenPrivateEntryResult =
  | { ok: true; tournament: PrivateTournamentRow; entry: PrivateEntryRow }
  | { ok: false; error: string; status: number };

/**
 * Load the tournament and this user's entry, gating on the same conditions both
 * routes enforce (same order + messages + status codes):
 *   • tournament exists                      (404 "tournament not found")
 *   • not completed                          (400 "this tournament is already finished")
 *   • not expired                            (400 "this tournament's entry window has closed")
 *   • the user has an entry                  (400 "register for this tournament first")
 *   • the entry is still in progress         (400 "your entry is already locked in")
 *   • (PUBLIC) still within the 10-min window (410 "Your 10-minute window expired…")
 * Returns the loaded rows on success, else { ok: false, error, status }.
 */
export async function loadOpenPrivateEntry(
  args: LoadOpenPrivateEntryArgs,
): Promise<LoadOpenPrivateEntryResult> {
  const tournament = await getPrivateTournament(args.tournamentId);
  if (!tournament) {
    return { ok: false, error: "tournament not found", status: 404 };
  }
  if (tournament.status === "completed") {
    return {
      ok: false,
      error: "this tournament is already finished",
      status: 400,
    };
  }
  if (isExpired(tournament.expiresAt, Date.now())) {
    return {
      ok: false,
      error: "this tournament's entry window has closed",
      status: 400,
    };
  }

  const entry = await getPrivateEntry(args.tournamentId, args.userId);
  if (!entry) {
    return {
      ok: false,
      error: "register for this tournament first",
      status: 400,
    };
  }
  if (entry.status === "submitted" || entry.status === "bot_replaced") {
    return { ok: false, error: "your entry is already locked in", status: 400 };
  }
  // Per-entrant completion window (PUBLIC only): a registered/partial entry past
  // its 10-minute deadline is kicked. Purge the dead row so the freed slot is real,
  // then reject deterministically — this is the authoritative decision even when no
  // read/register purge fired first (e.g. a submit attempt at 10:30). Private
  // tournaments skip this entirely (isPublic gate) so their behaviour is unchanged.
  if (
    tournament.isPublic &&
    isEntryExpired(entry.createdAt, Date.now(), entry.status)
  ) {
    await purgeStaleIncompleteEntries({
      tournamentId: args.tournamentId,
      isPublic: true,
    });
    return {
      ok: false,
      error:
        "Your 10-minute window expired — you were removed. Rejoin if there's still room.",
      status: 410,
    };
  }

  return { ok: true, tournament, entry };
}

// ── Validate the five starters (PURE) ──────────────────────────────────────────

export type ValidateStartersResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * The five starters must match the board's starter slots (set-match) and come
 * from distinct teams. PURE — no I/O. The off-list guard + position legality run
 * in hydratePrivateRoster (they need hydration / index lookups). Error strings
 * match the routes verbatim.
 */
export function validatePrivateStarters(
  picks: SimPick[],
  board: PrivateTournamentRow["board"],
): ValidateStartersResult {
  if (!startersMatchBoard(picks, board)) {
    return {
      ok: false,
      reason: "those picks aren't from this tournament's board",
    };
  }
  const teams = picks.map((p) => p.team);
  if (new Set(teams).size !== teams.length) {
    return { ok: false, reason: "each player must come from a different team" };
  }
  return { ok: true };
}

// ── Hydrate + score (off-list guard, position legality, sim) ──────────────────

export interface HydratePrivateRosterArgs {
  picks: SimPick[];
  /** When provided, the sixth man is validated (bench match), included in the
   *  distinct-teams check, and hydrated alongside the five. Omit for the partial
   *  save (a throwaway sixth is used internally so hydration succeeds). */
  sixthPick?: SixthPick;
  board: PrivateTournamentRow["board"];
  options?: QueryOptions;
}

export type HydratePrivateRosterResult =
  | { ok: true; hydrated: HydratedTournamentRoster; sim: SimResult }
  | { ok: false; error: string; status: number };

/**
 * The shared off-list → hydrate → position-legality → simulate pipeline.
 *
 * With a sixthPick (submit): validate the bench slot (the sixth's team+decade
 * equals board.benchSlot), check distinct teams across all six, off-list-guard
 * all six, hydrate the six, then position-check the five and score them.
 *
 * Without a sixthPick (partial): the caller has already distinct-checked the
 * five (validatePrivateStarters); here we off-list-guard the five, hydrate them
 * with a THROWAWAY sixth (the first starter — its stats are never used because we
 * score hydrated.scoring, the five), position-check the five, and score them.
 *
 * The five starters' set-match must be validated by the caller first
 * (validatePrivateStarters). Validation order + error strings mirror the routes.
 * Returns the hydrated roster + sim, else { ok: false, error, status }.
 */
export async function hydratePrivateRoster(
  args: HydratePrivateRosterArgs,
): Promise<HydratePrivateRosterResult> {
  const { picks, sixthPick, board, options = {} } = args;

  // ---- Bench match + distinct teams (six when a sixth is provided). ----
  let offListPicks: Array<SimPick | SixthPick>;
  if (sixthPick) {
    const bench = board.benchSlot;
    if (sixthPick.team !== bench.team || sixthPick.decade !== bench.decade) {
      return {
        ok: false,
        error: "that sixth man isn't from this tournament's board",
        status: 400,
      };
    }
    const allTeams = [...picks.map((p) => p.team), sixthPick.team];
    if (new Set(allTeams).size !== allTeams.length) {
      return {
        ok: false,
        error: "each player must come from a different team",
        status: 400,
      };
    }
    offListPicks = [...picks, sixthPick];
  } else {
    offListPicks = picks;
  }

  // ---- Off-list guard: every pick must be a real offered player. ----
  for (const pk of offListPicks) {
    const offered = await getOfferedIds(pk.team, pk.decade, options);
    if (!offered.has(pk.entity_id)) {
      return {
        ok: false,
        error: "that player wasn't in the draft list",
        status: 400,
      };
    }
  }

  // ---- Hydrate. With no sixth, use the first starter as a throwaway bench pick
  // (its stats are never used — we score the five via hydrated.scoring). ----
  const hydrateSixth = sixthPick ?? {
    entity_id: picks[0].entity_id,
    team: picks[0].team,
    decade: picks[0].decade,
  };
  let hydrated: HydratedTournamentRoster;
  try {
    hydrated = await hydrateTournamentRoster(picks, hydrateSixth, options);
  } catch {
    return { ok: false, error: "unknown roster pick", status: 400 };
  }

  // ---- Position legality: each starter must be eligible for its slot. ----
  for (let i = 0; i < picks.length; i++) {
    if (!canPlay(hydrated.players[i], KINDS[picks[i].slot])) {
      return { ok: false, error: "illegal lineup", status: 400 };
    }
  }

  // ---- Score the FIVE (no buffs). ----
  const sim = simulateRoster(hydrated.scoring);

  return { ok: true, hydrated, sim };
}
