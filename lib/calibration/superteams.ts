// ============================================================================
// Real 82-0 watch-set fields.
//
// These are real hoopiq rosters that the current model projected as 82-0. They
// are NOT keep-perfect guards; they are deliberately spacing-flawed watch teams
// that should move down when the era-aware spacing lever is tuned.
// ============================================================================

import type { IndexedPlayer } from "../queries";
import type { SimPick } from "../types";
import type { ReplayField, ReplayTeamRef } from "./types";
import {
  buildDebutMap,
  buildPlayerMap,
  hydrateTeamFromPool,
  type StoredTeamRow,
} from "./hydrate";
import { buildSyntheticFields } from "./synthetic";

type PickSpec = readonly [entityId: string, team: string, decade: number, slot: number];
type SixthSpec = readonly [entityId: string, team: string, decade: number];

interface RealSuperteamSpec {
  name: string;
  picks: readonly PickSpec[];
  sixth: SixthSpec;
}

export const REAL_82_0_ARCHETYPE = "real-82-0";

export const REAL_82_0_HOOPIQ: readonly RealSuperteamSpec[] = [
  {
    name: "SOHA",
    picks: [
      ["467", "NJN", 2000, 0],
      ["78450", "POR", 1970, 1],
      ["252", "UTA", 1980, 2],
      ["787", "PHI", 1990, 3],
      ["203999", "DEN", 2020, 4],
    ],
    sixth: ["202695", "SAS", 2010],
  },
  {
    name: "HERETOWIN",
    picks: [
      ["893", "CHI", 1980, 0],
      ["201939", "GSW", 2010, 1],
      ["787", "PHI", 1990, 2],
      ["708", "BOS", 2000, 3],
      ["1631096", "OKC", 2020, 4],
    ],
    sixth: ["76003", "MIL", 1970],
  },
  {
    name: "JOKCP",
    picks: [
      ["101108", "LAC", 2010, 0],
      ["76750", "NYK", 1960, 1],
      ["252", "UTA", 1990, 2],
      ["203999", "DEN", 2020, 3],
      ["77449", "HOU", 1980, 4],
    ],
    sixth: ["302", "ATL", 1990],
  },
  {
    name: "PEEN",
    picks: [
      ["101108", "LAC", 2010, 0],
      ["893", "CHI", 1990, 1],
      ["2222", "CHA", 2000, 2],
      ["76003", "MIL", 1970, 3],
      ["77449", "HOU", 1970, 4],
    ],
    sixth: ["2544", "LAL", 2020],
  },
  {
    name: "SAVOY",
    picks: [
      ["77142", "LAL", 1980, 0],
      ["23", "DET", 1990, 1],
      ["252", "UTA", 2000, 2],
      ["78450", "POR", 1970, 3],
      ["76003", "MIL", 1960, 4],
    ],
    sixth: ["76979", "SDR", 1970],
  },
  {
    name: "JOKINAROUND",
    picks: [
      ["76750", "NYK", 1970, 0],
      ["1630567", "TOR", 2020, 1],
      ["1905", "UTA", 2000, 2],
      ["203999", "DEN", 2010, 3],
      ["78049", "BOS", 1960, 4],
    ],
    sixth: ["78149", "SEA", 1980],
  },
  {
    name: "FAVS",
    picks: [
      ["76750", "NYK", 1970, 0],
      ["893", "CHI", 1980, 1],
      ["202695", "TOR", 2010, 2],
      ["201142", "BKN", 2020, 3],
      ["165", "HOU", 1990, 4],
    ],
    sixth: ["78497", "LAL", 1960],
  },
  {
    name: "J",
    picks: [
      ["76750", "NYK", 1960, 0],
      ["201566", "WAS", 2020, 1],
      ["77142", "LAL", 1980, 2],
      ["203076", "NOP", 2010, 3],
      ["708", "MIN", 1990, 4],
    ],
    sixth: ["2544", "CLE", 2010],
  },
];

const pickKey = (entityId: string, team: string, decade: number) =>
  `${entityId}|${team}|${decade}`;

function toStoredRow(
  spec: RealSuperteamSpec,
  playerMap: Map<string, IndexedPlayer>,
): StoredTeamRow {
  const picks: SimPick[] = spec.picks.map(([entity_id, team, decade, slot]) => ({
    entity_id,
    team,
    decade,
    slot,
  }));

  let captainSlot = 0;
  let captainValue = -Infinity;
  for (const [entityId, team, decade, slot] of spec.picks) {
    const player = playerMap.get(pickKey(entityId, team, decade));
    if (player && player.value > captainValue) {
      captainSlot = slot;
      captainValue = player.value;
    }
  }

  return {
    name: spec.name,
    roster_json: picks,
    sixth_json: {
      entity_id: spec.sixth[0],
      team: spec.sixth[1],
      decade: spec.sixth[2],
    },
    captain_slot: captainSlot,
  };
}

function hydrateReal82Refs(pool: IndexedPlayer[]): {
  refs: ReplayTeamRef[];
  missing: string[];
} {
  const playerMap = buildPlayerMap(pool);
  const debutMap = buildDebutMap(pool);
  const refs: ReplayTeamRef[] = [];
  const missing: string[] = [];

  for (const spec of REAL_82_0_HOOPIQ) {
    const row = toStoredRow(spec, playerMap);
    const team = hydrateTeamFromPool(
      row,
      `super:${spec.name}`,
      false,
      playerMap,
      debutMap,
    );
    if (team) refs.push({ team, archetype: REAL_82_0_ARCHETYPE });
    else missing.push(spec.name);
  }

  return { refs, missing };
}

/**
 * Build deterministic watch-set fields by replacing the first eight synthetic
 * teams in each field with the real 82-0 rosters. If the pool lacks the specific
 * entity/team/decade rows, no watch fields are emitted (fixture mode stays DB-free).
 */
export function buildSuperteamFields(
  pool: IndexedPlayer[],
  count: number,
  seed: string,
): ReplayField[] {
  const { refs: watchRefs, missing } = hydrateReal82Refs(pool);
  if (watchRefs.length === 0) return [];
  if (missing.length > 0) {
    throw new Error(
      `real-82-0 watch set partially hydrated: ` +
        `${watchRefs.length}/${REAL_82_0_HOOPIQ.length} teams present; ` +
        `missing ${missing.join(", ")}`,
    );
  }

  const baseFields = buildSyntheticFields(pool, count, `${seed}-real-82-0`);
  return baseFields.map((field, i) => {
    const inserted = watchRefs.slice(0, Math.min(watchRefs.length, field.size));
    return {
      ...field,
      id: `super-${seed}-${i}`,
      teams: [...inserted, ...field.teams.slice(inserted.length)],
    };
  });
}
