import { describe, it, expect } from "vitest";
import type { IndexedPlayer } from "../queries";
import { fixturePlayerPool } from "./fixture";
import {
  buildSuperteamFields,
  REAL_82_0_ARCHETYPE,
  REAL_82_0_HOOPIQ,
} from "./superteams";

function mkPlayer(
  entity_id: string,
  team: string,
  decade: number,
  value: number,
  index: number,
): IndexedPlayer {
  return {
    entity_id,
    player_name: `Super_${entity_id}_${team}_${decade}`,
    team,
    decade,
    best_season: decade + 5,
    value,
    gp: 72,
    mpg: 34,
    pts: 20,
    reb: 7,
    ast: 4,
    stl: 1,
    blk: 0.8,
    fga: 15,
    fg3a: index % 3 === 0 ? 0.3 : 3,
    fg3m: index % 3 === 0 ? 0.05 : 1.1,
    fta: 5,
    tov: 2,
    fgm: 8,
    ftm: index % 4 === 0 ? 3.5 : 4,
    tsplus: 1.05,
    height_in: index % 3 === 0 ? 84 : index % 3 === 1 ? 80 : 76,
    pos: index % 3 === 0 ? "C" : index % 3 === 1 ? "F" : "G",
    all_def: index % 5 === 0 ? 1 : 0,
    debut: decade,
  };
}

function superteamPool(): IndexedPlayer[] {
  const seen = new Set<string>();
  const rows: IndexedPlayer[] = [];
  let index = 0;
  const add = (entityId: string, team: string, decade: number, value: number) => {
    const key = `${entityId}|${team}|${decade}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(mkPlayer(entityId, team, decade, value, index++));
  };

  for (const spec of REAL_82_0_HOOPIQ) {
    spec.picks.forEach(([entityId, team, decade, slot]) => {
      add(entityId, team, decade, 0.95 - slot * 0.02);
    });
    add(spec.sixth[0], spec.sixth[1], spec.sixth[2], 0.75);
  }

  return rows;
}

describe("real 82-0 superteam watch fields", () => {
  it("returns no fields when the exact hoopiq rows are absent", () => {
    expect(buildSuperteamFields(fixturePlayerPool(), 2, "seed")).toEqual([]);
  });

  it("hydrates the eight real watch teams and replaces the first teams in each field", () => {
    const pool = [...fixturePlayerPool(), ...superteamPool()];
    const fields = buildSuperteamFields(pool, 2, "seed");

    expect(fields).toHaveLength(2);
    for (const [i, field] of fields.entries()) {
      expect(field.id).toBe(`super-seed-${i}`);
      expect(field.source).toBe("synthetic");
      expect(field.size).toBe(16);
      expect(field.teams).toHaveLength(16);
      expect(
        field.teams
          .slice(0, REAL_82_0_HOOPIQ.length)
          .map((ref) => ref.team.id),
      ).toEqual(REAL_82_0_HOOPIQ.map((spec) => `super:${spec.name}`));
      expect(
        field.teams
          .slice(0, REAL_82_0_HOOPIQ.length)
          .every((ref) => ref.archetype === REAL_82_0_ARCHETYPE),
      ).toBe(true);
      expect(field.teams[0].team.starters).toHaveLength(5);
      expect(field.teams[0].team.sixthMan).toBeTruthy();
    }
  });
});
