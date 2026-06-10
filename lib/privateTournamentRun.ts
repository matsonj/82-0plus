// Private tournament — simulation + finalization MATH. PURE-ish: no HTTP, no
// direct DB writes. It takes already-loaded data (entry rows, the board, stat
// norms) and the bot generator/index, runs simulateBracket, and returns results
// the route layer persists. The only I/O it may do is hydrate rosters through
// the player-index helpers (hydrateTournamentRoster / buildTournamentTeam), the
// same path the public submit uses.
//
// Three jobs:
//   • planFinalField   — PURE: decide the bracket field composition (humans,
//                        "{USERNAME} BOT" for reserved-but-incomplete, generic
//                        bots for never-reserved slots). UNIT-TESTABLE, no DB.
//   • runProvisional   — a frozen single-entry run vs board bots, for the
//                        "your provisional standing" shown before finalize.
//   • runFinal         — the full size-team bracket at finalize time.
// A shared statusLabel(bracket, teamId) produces the human round label reused by
// both runs. Record math is NEVER reimplemented — deriveRecord/deriveYou own it.

import type { QueryOptions } from "./motherduck";
import type { GeneratedPrivateBot, PrivateBoard } from "./privateBoard";
import { generatePrivateBots } from "./privateBoard";
import type { PrivateSize } from "./privateTournament";
import { simulateRoster } from "./scoring";
import {
  buildTournamentTeam,
  getStatNorms,
  hydrateTournamentRoster,
} from "./tournamentQueries";
import {
  simulateBracket,
  type BracketSize,
  type TournamentTeam,
} from "./tournament";
import { deriveRecord, deriveYou, stripBreakdown } from "./tournamentRun";
import type { BracketResult, SimPick, StatNorms } from "./types";

// Re-export so the route layer can get norms through one import.
export { getStatNorms };

// ── Board set-match (PURE) ─────────────────────────────────────────────────────

/**
 * The five starters' (team, decade) must equal the board's five starter slots as
 * a SET — each board slot used once, positions assigned by the player (not by
 * board order). Mirrors the daily set-match. PURE — used by partial + submit.
 */
export function startersMatchBoard(
  picks: SimPick[],
  board: PrivateBoard,
): boolean {
  const boardKeys = new Set(board.slots.map((s) => `${s.team}|${s.decade}`));
  const pickKeys = picks.map((p) => `${p.team}|${p.decade}`);
  return (
    pickKeys.length === board.slots.length &&
    new Set(pickKeys).size === pickKeys.length &&
    pickKeys.every((k) => boardKeys.has(k))
  );
}

// ── Status label ─────────────────────────────────────────────────────────────

/**
 * Human round label for `teamId` inside a resolved bracket. Reused by the
 * provisional and final runs so the wording is identical everywhere.
 *
 *   "Champion"      — won the Final
 *   "Lost Finals"   — reached and lost the Final
 *   "Lost Conf Finals" / "Lost Semis" / "Lost R1" — lost the named earlier round
 *   "Lost Play-In"  — size-20 only: eliminated in the play-in (flagged on the
 *                     BracketTeam as lostPlayIn; never appears in any round)
 *   "Eliminated"    — fallback (team not found / never in a round and not a
 *                     play-in loss; shouldn't happen for a real entrant)
 *
 * The label is derived purely from the bracket shape: reachedRound (from
 * deriveYou) counts series the team WON, and the bracket's round count tells us
 * how deep the tree is, so the same code labels every size (4/8/12/16/20).
 */
export function statusLabel(bracket: BracketResult, teamId: string): string {
  // Size-20 play-in elimination: the team never enters `rounds`, so check first.
  const bt = bracket.teams.find((t) => t.id === teamId);
  if (bt?.lostPlayIn) return "Lost Play-In";

  // reachedRound = number of series this team won (0 = lost its first series).
  // deriveYou throws if the team isn't in the bracket — guard that to a fallback.
  let reachedRound: number;
  try {
    reachedRound = deriveYou(bracket, teamId).reachedRound;
  } catch {
    return "Eliminated";
  }

  const totalRounds = bracket.rounds.length; // includes the Final
  if (reachedRound >= totalRounds) return "Champion"; // won every series, incl. Final

  // The team lost the series in round index `reachedRound` (0-based). Name it by
  // how far that round is from the Final. distanceFromFinal 0 = the Final itself.
  const distanceFromFinal = totalRounds - 1 - reachedRound;
  switch (distanceFromFinal) {
    case 0:
      return "Lost Finals";
    case 1:
      return "Lost Conf Finals";
    case 2:
      return "Lost Semis";
    default:
      // Any earlier round (R1 in a 16/20 bracket, the opening round in 12, etc.).
      return "Lost R1";
  }
}

// ── Field planning (PURE) ──────────────────────────────────────────────────────

/** The minimal entry shape planFinalField reasons about. */
export interface FieldPlanEntry {
  entryId: string;
  userId: string;
  userName: string;
  teamName: string | null;
  status: "registered" | "partial" | "submitted" | "bot_replaced";
}

/** One planned bracket slot. */
export type FieldSlot =
  | { kind: "human"; entry: FieldPlanEntry }
  | { kind: "reservedBot"; entry: FieldPlanEntry; botName: string }
  | { kind: "genericBot"; seedIndex: number; botName: string };

/**
 * Decide the bracket field composition, deterministically, for a tournament of
 * `size` slots. The rule (documented for the test):
 *
 *   1. SUBMITTED humans come first, in their incoming order (registration order
 *      — the caller passes entries oldest-first).
 *   2. RESERVED-INCOMPLETE entries (registered | partial — they joined but never
 *      locked a full six) become a "{USERNAME} BOT": a board-constrained bot that
 *      carries the entrant's name so the bracket shows who timed out. (A
 *      bot_replaced entry is treated the same — it was already handed off.)
 *   3. Any remaining slots up to `size` become GENERIC bots, named by the caller
 *      (here: "BOT 1", "BOT 2", …), filling the field so the bracket always runs.
 *
 * Order is stable: submitted-humans (input order) → reserved-bots (input order)
 * → generic bots (ascending seedIndex). Always returns exactly `size` slots; if
 * there are MORE humans+reserved than `size` the extras are dropped (the route
 * caps registration at `size`, so this is just a safety clamp).
 */
export function planFinalField(
  entries: FieldPlanEntry[],
  size: PrivateSize,
): FieldSlot[] {
  const submitted = entries.filter((e) => e.status === "submitted");
  const reserved = entries.filter((e) => e.status !== "submitted");

  const slots: FieldSlot[] = [];
  for (const e of submitted) {
    if (slots.length >= size) break;
    slots.push({ kind: "human", entry: e });
  }
  for (const e of reserved) {
    if (slots.length >= size) break;
    slots.push({
      kind: "reservedBot",
      entry: e,
      botName: reservedBotName(e.userName),
    });
  }
  // Generic bots fill the rest. seedIndex is the bot's stable index into the
  // generated bot stream (0-based), which the caller uses to pull the matching
  // GeneratedPrivateBot from generatePrivateBots.
  let seedIndex = 0;
  while (slots.length < size) {
    slots.push({
      kind: "genericBot",
      seedIndex,
      botName: genericBotName(seedIndex),
    });
    seedIndex += 1;
  }
  return slots;
}

/** "{USERNAME} BOT" — the name a reserved-but-incomplete slot plays under. */
export function reservedBotName(userName: string): string {
  return `${userName} BOT`;
}

/** Generic filler bot name for a never-reserved empty slot (1-based for humans). */
export function genericBotName(seedIndex: number): string {
  return `BOT ${seedIndex + 1}`;
}

// ── Team building ──────────────────────────────────────────────────────────────

/** Bracket size is a BracketSize at runtime (PrivateSize ⊆ BracketSize). */
function asBracketSize(size: PrivateSize): BracketSize {
  return size as BracketSize;
}

/**
 * Hydrate a SUBMITTED entry's stored roster into a TournamentTeam. Mirrors how
 * the public submit builds its team: hydrateTournamentRoster(roster, sixth) →
 * buildTournamentTeam with the stored captain slot. seedNet uses the stored
 * value when present (the same number the seed line was computed from at submit)
 * and recomputes via simulateRoster only as a fallback.
 */
export async function buildEntryTeam(
  entry: {
    entryId: string;
    teamName: string | null;
    rosterJson: unknown;
    sixthJson: unknown;
    captainSlot: number | null;
    seedNet: number | null;
  },
  id: string,
  name: string,
  options: QueryOptions = {},
): Promise<TournamentTeam> {
  const picks = entry.rosterJson as SimPick[];
  const sixth = entry.sixthJson as {
    entity_id: string;
    team: string;
    decade: number;
  };
  const hydrated = await hydrateTournamentRoster(picks, sixth, options);
  const seedNet =
    entry.seedNet != null && Number.isFinite(entry.seedNet)
      ? entry.seedNet
      : simulateRoster(hydrated.scoring).seedNet;
  return buildTournamentTeam({
    id,
    name,
    isGhost: false,
    seedNet,
    hydrated,
    captainSlot:
      typeof entry.captainSlot === "number" ? entry.captainSlot : 0,
  });
}

/**
 * Hydrate a generated bot into a TournamentTeam under `name`. Mirrors the daily
 * ghost handling: a bot has NO chosen captain, so we default captainSlot to 0
 * (no meaningful captain boost is intended — same as drawOpponents' stored
 * ghosts, which default to slot 0). isGhost is true so the UI can mark it.
 */
export async function buildBotTeam(
  bot: GeneratedPrivateBot,
  id: string,
  name: string,
  options: QueryOptions = {},
): Promise<TournamentTeam> {
  const hydrated = await hydrateTournamentRoster(bot.roster, bot.sixth, options);
  return buildTournamentTeam({
    id,
    name,
    isGhost: true,
    seedNet: bot.seedNet,
    hydrated,
    captainSlot: 0,
  });
}

// ── Provisional run (frozen, single entry vs board bots) ──────────────────────

/** What the provisional run returns — just the entrant's standing, no bracket. */
export interface ProvisionalResult {
  recordW: number;
  recordL: number;
  status: string; // statusLabel output (incl. "Lost Play-In")
}

/**
 * A FROZEN provisional run for one submitted entry: build a field of
 * [entryTeam] + (size-1) board-constrained GENERIC bots and simulate it. The bot
 * seed is derived from `${tournamentId}:${entryId}` so the run is stable — the
 * same entry always sees the same provisional standing regardless of who else
 * submits. The seedKey is likewise entry-scoped so it doesn't collide with the
 * final bracket's run. Returns only W-L (EXCLUDING play-in, via deriveRecord)
 * and a status label; no provisional bracket is stored.
 */
export async function runProvisional(
  entryTeam: TournamentTeam,
  board: PrivateBoard,
  tournamentId: string,
  entryId: string,
  size: PrivateSize,
  statNorms: StatNorms,
  options: QueryOptions = {},
): Promise<ProvisionalResult> {
  const botSeed = `${tournamentId}:prov:${entryId}`;
  const bots = await generatePrivateBots(board, botSeed, size - 1, options);
  if (bots.length < size - 1) {
    // The board can't field enough legal bots — shouldn't happen for a valid
    // board, but degrade to a 0-0 / Eliminated rather than throw mid-submit.
    return { recordW: 0, recordL: 0, status: "Eliminated" };
  }
  const botTeams = await Promise.all(
    bots
      .slice(0, size - 1)
      .map((b, i) =>
        buildBotTeam(b, `provbot:${entryId}:${i}`, genericBotName(i), options),
      ),
  );
  const field = [entryTeam, ...botTeams];
  const bracket = simulateBracket(
    field,
    botSeed,
    statNorms,
    undefined,
    asBracketSize(size),
  );
  const rec = deriveRecord(bracket, entryTeam.id);
  return {
    recordW: rec.recordW,
    recordL: rec.recordL,
    status: statusLabel(bracket, entryTeam.id),
  };
}

// ── Final run (the full size-team bracket) ────────────────────────────────────

/** One entry's resolved final standing, ready for updateEntryFinal. */
export interface EntryFinalResult {
  entryId: string;
  finalRecordW: number;
  finalRecordL: number;
  finalStatus: string;
  finalRealizedMargin: number;
  finalReachedRound: number;
}

/** Everything the route needs to persist a finalized tournament. */
export interface FinalRunResult {
  bracket: BracketResult; // stripBreakdown'd — safe to store + serve
  championName: string;
  entryResults: EntryFinalResult[];
  botReplacedUserIds: string[]; // userIds of reserved-incomplete entries replaced
}

/**
 * Build the full `size`-team field per planFinalField and run the bracket:
 *   • SUBMITTED humans → buildEntryTeam (their stored roster + captain).
 *   • RESERVED-INCOMPLETE → a board bot named "{USERNAME} BOT". These map back to
 *     their entry so the route can mark the entry bot_replaced AND record the
 *     bot's final standing against the entry (so the user still sees a result).
 *   • Never-reserved slots → generic board bots ("BOT n").
 *
 * Bots are generated from a single deterministic stream seeded by the
 * tournamentId; planFinalField hands each bot slot a stable seedIndex into that
 * stream so a re-finalize (idempotent retry) reproduces the same field. The
 * bracket is seeded by the tournamentId (the public, stable seedKey) so the
 * result is reproducible. Per-entry W-L EXCLUDES play-in (deriveRecord), and
 * statusLabel surfaces "Lost Play-In" off the BracketTeam flag.
 */
export async function runFinal(
  tournamentId: string,
  board: PrivateBoard,
  size: PrivateSize,
  entries: FieldPlanEntry[],
  entryRowsById: Map<
    string,
    {
      entryId: string;
      teamName: string | null;
      rosterJson: unknown;
      sixthJson: unknown;
      captainSlot: number | null;
      seedNet: number | null;
    }
  >,
  statNorms: StatNorms,
  options: QueryOptions = {},
): Promise<FinalRunResult> {
  const plan = planFinalField(entries, size);

  // Generate enough bots to cover EVERY bot slot (reserved + generic) from one
  // deterministic stream. reservedBots and genericBots both index into it: a
  // reserved bot uses the i-th stream entry by its position among bot slots.
  const botSlotCount = plan.filter(
    (s) => s.kind === "reservedBot" || s.kind === "genericBot",
  ).length;
  const bots = await generatePrivateBots(
    board,
    `${tournamentId}:final`,
    botSlotCount,
    options,
  );
  if (botSlotCount > 0 && bots.length < botSlotCount) {
    throw new Error(
      `private finalize: board for ${tournamentId} can't field ${botSlotCount} bots`,
    );
  }

  // Walk the plan, building each TournamentTeam and remembering which bracket id
  // belongs to which entry (humans + reserved bots) so we can map results back.
  const teams: TournamentTeam[] = [];
  const idToEntryId = new Map<string, string>(); // bracket teamId → entryId
  const botReplacedUserIds: string[] = [];
  let botCursor = 0; // next index into `bots`

  for (const slot of plan) {
    if (slot.kind === "human") {
      const row = entryRowsById.get(slot.entry.entryId);
      if (!row) {
        throw new Error(
          `private finalize: missing row for submitted entry ${slot.entry.entryId}`,
        );
      }
      const id = `entry:${slot.entry.entryId}`;
      const name = slot.entry.teamName ?? slot.entry.userName;
      teams.push(await buildEntryTeam(row, id, name, options));
      idToEntryId.set(id, slot.entry.entryId);
    } else if (slot.kind === "reservedBot") {
      const bot = bots[botCursor++];
      const id = `entry:${slot.entry.entryId}`; // keep the entry's id so we map back
      teams.push(await buildBotTeam(bot, id, slot.botName, options));
      idToEntryId.set(id, slot.entry.entryId);
      botReplacedUserIds.push(slot.entry.userId);
    } else {
      const bot = bots[botCursor++];
      const id = `genbot:${slot.seedIndex}`;
      teams.push(await buildBotTeam(bot, id, slot.botName, options));
    }
  }

  const rawBracket = simulateBracket(
    teams,
    tournamentId,
    statNorms,
    undefined,
    asBracketSize(size),
  );

  // Per-entry final standing (humans AND reserved bots — both map to an entry).
  const entryResults: EntryFinalResult[] = [];
  for (const [bracketId, entryId] of idToEntryId) {
    const rec = deriveRecord(rawBracket, bracketId);
    entryResults.push({
      entryId,
      finalRecordW: rec.recordW,
      finalRecordL: rec.recordL,
      finalStatus: statusLabel(rawBracket, bracketId),
      finalRealizedMargin: rec.realizedMargin,
      finalReachedRound: rec.reachedRound,
    });
  }

  return {
    bracket: stripBreakdown(rawBracket),
    championName: rawBracket.championName,
    entryResults,
    botReplacedUserIds,
  };
}
