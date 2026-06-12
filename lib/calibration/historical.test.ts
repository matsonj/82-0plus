import { describe, it, expect } from "vitest";
import type { IndexedPlayer } from "../queries";
import { fixturePlayerPool } from "./fixture";
import {
  buildPlayerMap,
  buildDebutMap,
  hydrateTeamFromPool,
  type StoredTeamRow,
} from "./hydrate";
import { parseAnchorRow, reconstructFields, stratify } from "./historical";
import type { HydratedTeam } from "./types";

const pool = fixturePlayerPool();
const playerMap = buildPlayerMap(pool);
const debutMap = buildDebutMap(pool);

function rowFrom(
  players: IndexedPlayer[],
  opts: { name: string },
): StoredTeamRow {
  const five = players.slice(0, 5);
  return {
    name: opts.name,
    captain_slot: 0,
    roster_json: five.map((p, i) => ({
      entity_id: p.entity_id,
      team: p.team,
      decade: p.decade,
      slot: i,
    })),
    sixth_json: {
      entity_id: players[5].entity_id,
      team: players[5].team,
      decade: players[5].decade,
    },
  };
}

describe("stratify", () => {
  it("splits 600 across modes ≈ classic 300 / hoopiq 200 / daily 100", () => {
    const s = stratify(600, ["classic", "hoopiq", "daily"]);
    expect(s.classic).toBe(300);
    expect(s.hoopiq).toBe(200);
    expect(s.daily).toBe(100);
    expect(s.classic + s.hoopiq + s.daily).toBe(600);
  });

  it("a single mode gets the whole budget", () => {
    expect(stratify(50, ["classic"]).classic).toBe(50);
  });
});

describe("hydrateTeamFromPool", () => {
  it("hydrates a team:<uuid> row in slot order with config-independent metadata", () => {
    const row = rowFrom(pool.slice(0, 6), { name: "Alpha" });
    const team = hydrateTeamFromPool(row, "team:uuid-1", false, playerMap, debutMap);
    expect(team).not.toBeNull();
    expect(team!.id).toBe("team:uuid-1");
    expect(team!.isGhost).toBe(false);
    expect(team!.starters).toHaveLength(5);
    expect(team!.starterMeta).toHaveLength(5);
    expect(team!.heightTotal).toBeGreaterThan(0);
  });

  it("returns null when a pick can't be resolved against the pool", () => {
    const row: StoredTeamRow = {
      name: "Ghosted",
      roster_json: Array.from({ length: 5 }, (_, i) => ({
        entity_id: `MISSING_${i}`,
        team: "XXX",
        decade: 1900,
        slot: i,
      })),
      sixth_json: { entity_id: "MISSING_5", team: "XXX", decade: 1900 },
    };
    expect(hydrateTeamFromPool(row, "team:bad", false, playerMap, debutMap)).toBeNull();
  });
});

describe("parseAnchorRow + reconstructFields", () => {
  it("reconstructs a full field from team:<uuid> and ghost:<id> rows", () => {
    // Four distinct teams off non-overlapping player slices.
    const t1 = hydrateTeamFromPool(rowFrom(pool.slice(0, 6), { name: "T1" }), "team:T1", false, playerMap, debutMap)!;
    const t2 = hydrateTeamFromPool(rowFrom(pool.slice(6, 12), { name: "T2" }), "team:T2", false, playerMap, debutMap)!;
    const g1 = hydrateTeamFromPool(rowFrom(pool.slice(12, 18), { name: "G1" }), "ghost:1", true, playerMap, debutMap)!;
    const g2 = hydrateTeamFromPool(rowFrom(pool.slice(18, 24), { name: "G2" }), "ghost:2", true, playerMap, debutMap)!;
    const hydratedById = new Map<string, HydratedTeam>([
      ["team:T1", t1],
      ["team:T2", t2],
      ["ghost:1", g1],
      ["ghost:2", g2],
    ]);

    const spec = parseAnchorRow({
      team_id: "T1",
      mode: "classic",
      bracket_json: {
        size: 4,
        teams: [{ id: "team:T1" }, { id: "team:T2" }, { id: "ghost:1" }, { id: "ghost:2" }],
      },
    });
    expect(spec).not.toBeNull();
    expect(spec!.seedKey).toBe("T1");
    expect(spec!.size).toBe(4);
    expect(spec!.teamIds).toHaveLength(4);

    const { fields, dropped } = reconstructFields([spec!], hydratedById);
    expect(dropped).toBe(0);
    expect(fields).toHaveLength(1);
    expect(fields[0].teams).toHaveLength(4);
    expect(fields[0].id).toBe("T1");
    expect(fields[0].source).toBe("historical");
  });

  it("drops an anchor whose field references a missing team", () => {
    const t1 = hydrateTeamFromPool(rowFrom(pool.slice(0, 6), { name: "T1" }), "team:T1", false, playerMap, debutMap)!;
    const hydratedById = new Map<string, HydratedTeam>([["team:T1", t1]]);
    const spec = parseAnchorRow({
      team_id: "T1",
      mode: "classic",
      bracket_json: { size: 4, teams: [{ id: "team:T1" }, { id: "team:GONE" }, { id: "ghost:9" }, { id: "ghost:8" }] },
    });
    const { fields, dropped } = reconstructFields([spec!], hydratedById);
    expect(fields).toHaveLength(0);
    expect(dropped).toBe(1);
  });

  it("rejects an anchor with too few teams", () => {
    expect(
      parseAnchorRow({ team_id: "x", mode: "classic", bracket_json: { teams: [{ id: "team:a" }] } }),
    ).toBeNull();
  });
});
