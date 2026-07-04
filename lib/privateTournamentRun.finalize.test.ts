import { beforeEach, describe, expect, it } from "vitest";
import { runFinal } from "./privateTournamentRun";
import { hydrateRoster, UnresolvedRosterError, type IndexedPlayer } from "./queries";
import type { PrivateBoard } from "./privateBoard";
import type { PrivateSize } from "./privateTournament";
import type { SimPick, StatNorms } from "./types";
import { STAT_KEYS } from "./types";

// ── Fixtures ─────────────────────────────────────────────────────────────────

// An all-role player (pos "G-F-C" ⇒ eligible G/W/B) so any board slot fills any
// lineup position and buildPrivateBots always fields a legal six.
function row(entity_id: string, team: string, decade: number): IndexedPlayer {
  return {
    entity_id, player_name: `${entity_id} name`, team, decade,
    best_season: 1990, value: 0.6, gp: 70, mpg: 30,
    pts: 18, reb: 6, ast: 5, stl: 1, blk: 1,
    fga: 14, fg3a: 3, fg3m: 1, fta: 5, tov: 2, fgm: 7, ftm: 4,
    tsplus: 1.05, height_in: 79, pos: "G-F-C", all_def: 0, debut: 1988,
  };
}

const STARTER_TEAMS = ["T0", "T1", "T2", "T3", "T4"] as const;
function buildIndex(): IndexedPlayer[] {
  const rows: IndexedPlayer[] = [];
  for (const t of STARTER_TEAMS) {
    rows.push(row(`${t}a`, t, 1990), row(`${t}b`, t, 1990));
  }
  rows.push(row("TBa", "TB", 1990), row("TBb", "TB", 1990));
  return rows;
}

function board(): PrivateBoard {
  return {
    slots: STARTER_TEAMS.map((t) => ({ team: t, decade: 1990 })),
    benchSlot: { team: "TB", decade: 1990 },
    mode: "blind",
  };
}

function norms(): StatNorms {
  const mean = {} as StatNorms["mean"];
  const std = {} as StatNorms["std"];
  for (const k of STAT_KEYS) { mean[k] = 0; std[k] = 1; }
  return { mean, std };
}

// A full stored entry row (roster + sixth persisted = a locked six). `status` is
// included so tests can flip it and prove classification IGNORES it. If `badSlot`
// is set, that starter references an id NOT in the index (dropped by a rebuild).
function fullEntryRow(status: string, badSlot: number | null) {
  const picks: SimPick[] = STARTER_TEAMS.map((t, i) => ({
    entity_id: i === badSlot ? "77847" : `${t}a`,
    team: t,
    decade: 1990,
    slot: i,
  }));
  return {
    entryId: "e_test",
    userId: "u_test",
    userName: "ALICE",
    teamName: "MY TEAM",
    status,
    rosterJson: picks,
    sixthJson: { entity_id: "TBa", team: "TB", decade: 1990 },
    captainSlot: 0,
    seedNet: 5,
  };
}

// Mirror finalize's runFinalForTournament: `submitted` is derived from the
// IMMUTABLE sixth_json signal (a locked six), never from the mutable `status`.
function planEntryFrom(r: ReturnType<typeof fullEntryRow>) {
  return {
    entryId: r.entryId,
    userId: r.userId,
    userName: r.userName,
    teamName: r.teamName,
    submitted: r.sixthJson != null,
  };
}

async function finalizeRow(r: ReturnType<typeof fullEntryRow>, tournamentId = "tourney-1") {
  const size: PrivateSize = 4;
  return runFinal(
    tournamentId,
    board(),
    size,
    [planEntryFrom(r)],
    new Map([[r.entryId, r]]),
    norms(),
  );
}

// Seed the warm index directly and gate the warm-reconcile off (no DB in tests).
function seedIndex(): void {
  globalThis.__app_cache_last_check__ = Date.now();
  globalThis.__player_index__ = Promise.resolve(buildIndex());
  globalThis.__player_index_view__ = undefined;
}

// ── Finalize degrade contract ─────────────────────────────────────────────────

describe("runFinal — unresolvable stored roster is degraded, never fabricated", () => {
  beforeEach(seedIndex);

  it("a resolvable submitted roster plays as the real human team", async () => {
    const res = await finalizeRow(fullEntryRow("submitted", null));
    const me = res.bracket.teams.find((t) => t.id === "entry:e_test");
    expect(me).toBeDefined();
    expect(me!.name).toBe("MY TEAM"); // the entrant's own team name
    expect(me!.isGhost).toBe(false); // a real human roster, not a bot
    expect(res.botReplacedUserIds).not.toContain("u_test");
    expect(res.entryResults.some((r) => r.entryId === "e_test")).toBe(true);
    expect(typeof res.championName).toBe("string");
  });

  it("an unresolvable pick degrades the entry to a {USERNAME} BOT (no fabricated stats persisted)", async () => {
    const res = await finalizeRow(fullEntryRow("submitted", 2)); // slot 2 = dropped id
    const me = res.bracket.teams.find((t) => t.id === "entry:e_test");
    expect(me).toBeDefined();
    // Ran as a board bot under the entrant's name — NOT a placeholder-hydrated
    // roster. The contract: no fabricated height/role/fit gets scored & persisted.
    expect(me!.name).toBe("ALICE BOT");
    expect(me!.isGhost).toBe(true);
    expect(res.botReplacedUserIds).toContain("u_test");
    expect(res.entryResults.some((r) => r.entryId === "e_test")).toBe(true);
    expect(res.bracket.teams.some((t) => t.name === "(unavailable player)")).toBe(false);
  });
});

// ── Idempotency across the bot_replaced status flip ───────────────────────────

describe("runFinal — finalize is idempotent across the bot_replaced status flip", () => {
  beforeEach(seedIndex);

  it("a degraded entry re-classifies identically after its status flips (byte-stable)", async () => {
    // First finalize: the entry is still 'submitted'.
    const first = await finalizeRow(fullEntryRow("submitted", 2));
    // Re-run AFTER persistEntryFinals flipped it to 'bot_replaced'. sixth_json is
    // unchanged, so classification (roster presence) is unchanged: it is still a
    // submitted entry that degrades to a TAIL-draw bot — NOT a front-draw reserved
    // bot. Everything must come out byte-identical.
    const second = await finalizeRow(fullEntryRow("bot_replaced", 2));

    expect(planEntryFrom(fullEntryRow("submitted", 2)).submitted).toBe(true);
    expect(planEntryFrom(fullEntryRow("bot_replaced", 2)).submitted).toBe(true);
    expect(second).toEqual(first);
    expect(second.championName).toBe(first.championName);
    const meFirst = first.bracket.teams.find((t) => t.id === "entry:e_test");
    const meSecond = second.bracket.teams.find((t) => t.id === "entry:e_test");
    expect(meSecond).toEqual(meFirst);
    expect(meSecond!.name).toBe("ALICE BOT");
    expect(second.botReplacedUserIds).toEqual(first.botReplacedUserIds);
  });
});

// ── Direct registered→submit→finalize is NOT misclassified ────────────────────

describe("runFinal — a direct (registered→submit) entry is classified as submitted", () => {
  beforeEach(seedIndex);

  it("a valid direct submit plays its real roster, not a bot", async () => {
    // A direct submit (no interstitial partial) now persists BOTH roster_json and
    // sixth_json, so it classifies as submitted and its resolvable roster is played
    // as the real human team — never treated as incomplete/bot-replaced.
    const directSubmit = fullEntryRow("submitted", null);
    expect(planEntryFrom(directSubmit).submitted).toBe(true);

    const res = await finalizeRow(directSubmit);
    const me = res.bracket.teams.find((t) => t.id === "entry:e_test");
    expect(me).toBeDefined();
    expect(me!.isGhost).toBe(false); // real roster, not a filler/replacement bot
    expect(me!.name).toBe("MY TEAM");
    expect(res.botReplacedUserIds).not.toContain("u_test");
    expect(res.entryResults.some((r) => r.entryId === "e_test")).toBe(true);
  });
});

// ── Typed-error boundary: only UnresolvedRosterError degrades ─────────────────

describe("typed-error boundary", () => {
  beforeEach(seedIndex);

  it("hydrateRoster throws UnresolvedRosterError (not a plain Error) on an unknown pick", async () => {
    const picks: SimPick[] = [
      { entity_id: "77847", team: "T2", decade: 1990, slot: 0 },
    ];
    await expect(hydrateRoster(picks)).rejects.toBeInstanceOf(UnresolvedRosterError);
  });

  it("runFinal RETHROWS a transient (non-roster) failure instead of degrading to a bot", async () => {
    // A transient index/cache failure must NOT be silently converted into persisted
    // bot standings — finalize should abort so the lazy GET can retry.
    const boom = new Error("player index cache unavailable");
    globalThis.__app_cache_last_check__ = Date.now();
    globalThis.__player_index__ = Promise.reject(boom);
    globalThis.__player_index_view__ = undefined;

    await expect(finalizeRow(fullEntryRow("submitted", null))).rejects.toThrow(
      "player index cache unavailable",
    );
  });
});
