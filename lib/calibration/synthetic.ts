// ============================================================================
// Synthetic archetype fields.
//
// Deterministic 16-team brackets built from REAL player_index rows so the
// guardrails can ask blunt questions the historical data can't isolate:
//   - do frontcourt stacks (Wemby/Wilt/Kareem/Hakeem/KG/AD-style) beat balanced
//     and perimeter-creator builds?
//   - do elite creators (Curry/Harden/Oscar/Jordan/LeBron/Luka-style) end up
//     materially below comparable elite bigs?
//
// Selection prefers the named all-time players when the pool contains them, but
// always falls back to a trait predicate so the generator works on any pool
// (including a tiny test fixture). Rosters are config-independent; only seedNet
// and game outcomes change per candidate at replay time.
// ============================================================================

import type { IndexedPlayer } from "../queries";
import type { SimPick } from "../types";
import type { BracketSize } from "../tournament";
import type { HydratedTeam, ReplayField, ReplayTeamRef } from "./types";
import {
  buildDebutMap,
  buildPlayerMap,
  hydrateTeamFromPool,
  type StoredTeamRow,
} from "./hydrate";

// ── seeded RNG (no Math.random — deterministic across runs) ──────────────────

function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── trait helpers ────────────────────────────────────────────────────────────

const isGuard = (p: IndexedPlayer) =>
  (p.pos != null && /G/.test(p.pos)) || (Number.isFinite(p.height_in) && p.height_in <= 77);
const isBig = (p: IndexedPlayer) =>
  (p.pos != null && /C/.test(p.pos)) || (Number.isFinite(p.height_in) && p.height_in >= 82);
const isWing = (p: IndexedPlayer) => !isGuard(p) && !isBig(p);
const shooter = (p: IndexedPlayer) =>
  (p.fta > 0 ? p.ftm / p.fta : 0) >= 0.78 || (p.fg3a >= 2 && p.fg3m / Math.max(p.fg3a, 1) >= 0.34);

type Rank = (a: IndexedPlayer, b: IndexedPlayer) => number;
const byValue: Rank = (a, b) => b.value - a.value;
const byHeight: Rank = (a, b) => b.height_in - a.height_in || b.value - a.value;
const byCreation: Rank = (a, b) => b.ast + b.value * 12 - (a.ast + a.value * 12);
const byDefense: Rank = (a, b) =>
  b.stl + b.blk + (2 - (b.all_def || 9)) - (a.stl + a.blk + (2 - (a.all_def || 9)));
const bySpacing: Rank = (a, b) => b.fg3m + b.value * 6 - (a.fg3m + a.value * 6);

interface SlotWant {
  preferNames?: string[];
  filter?: (p: IndexedPlayer) => boolean;
  rank: Rank;
  count: number;
}

interface ArchetypeSpec {
  label: string;
  slots: SlotWant[]; // sum of counts must be 5
  sixth: SlotWant; // count ignored (always 1)
}

// Named all-time players are PREFERRED; the predicate is the robust fallback.
const ARCHETYPES: ArchetypeSpec[] = [
  {
    label: "frontcourt-stack",
    slots: [
      {
        preferNames: ["Wembanyama", "Chamberlain", "Abdul-Jabbar", "Olajuwon", "Garnett", "Davis"],
        filter: isBig,
        rank: byHeight,
        count: 5,
      },
    ],
    sixth: { filter: isBig, rank: byHeight, count: 1 },
  },
  {
    label: "no-guard-bigs",
    slots: [{ filter: (p) => !isGuard(p), rank: byValue, count: 5 }],
    sixth: { filter: (p) => !isGuard(p), rank: byValue, count: 1 },
  },
  {
    label: "perimeter-creators",
    slots: [
      {
        preferNames: ["Curry", "Harden", "Robertson", "Jordan", "James", "Doncic"],
        filter: (p) => isGuard(p) || isWing(p),
        rank: byCreation,
        count: 5,
      },
    ],
    sixth: { filter: (p) => isGuard(p) || isWing(p), rank: byCreation, count: 1 },
  },
  {
    label: "balanced-elite",
    slots: [
      { filter: isGuard, rank: byValue, count: 2 },
      { filter: isWing, rank: byValue, count: 1 },
      { filter: isBig, rank: byValue, count: 2 },
    ],
    sixth: { filter: isWing, rank: byValue, count: 1 },
  },
  {
    label: "wing-led",
    slots: [
      { filter: isWing, rank: byValue, count: 3 },
      { filter: isGuard, rank: byValue, count: 1 },
      { filter: isBig, rank: byValue, count: 1 },
    ],
    sixth: { filter: isWing, rank: byValue, count: 1 },
  },
  {
    label: "spacing-heavy",
    slots: [
      { filter: (p) => shooter(p) && !isBig(p), rank: bySpacing, count: 3 },
      { filter: (p) => shooter(p), rank: bySpacing, count: 1 },
      { filter: isBig, rank: byValue, count: 1 },
    ],
    sixth: { filter: shooter, rank: bySpacing, count: 1 },
  },
  {
    label: "defense-small-ball",
    slots: [
      { filter: (p) => isGuard(p) || isWing(p), rank: byDefense, count: 4 },
      { filter: isWing, rank: byDefense, count: 1 },
    ],
    sixth: { filter: (p) => isGuard(p) || isWing(p), rank: byDefense, count: 1 },
  },
];

/** Base 16-team composition — guarantees the controls are present and roughly
 *  matched in count, so the conversion-rate guardrails are apples-to-apples. */
const FIELD_COMPOSITION: string[] = [
  "frontcourt-stack", "frontcourt-stack",
  "no-guard-bigs", "no-guard-bigs",
  "perimeter-creators", "perimeter-creators",
  "balanced-elite", "balanced-elite", "balanced-elite",
  "wing-led", "wing-led",
  "spacing-heavy", "spacing-heavy",
  "defense-small-ball", "defense-small-ball", "defense-small-ball",
];

// ── player selection ─────────────────────────────────────────────────────────

/** Pick `n` players for a slot: preferred names first, then predicate-ranked,
 *  relaxing the predicate and finally allowing reuse so a field always fills. */
function pickPlayers(
  pool: IndexedPlayer[],
  used: Set<string>,
  want: SlotWant,
  n: number,
): IndexedPlayer[] {
  const out: IndexedPlayer[] = [];
  const take = (p: IndexedPlayer) => {
    out.push(p);
    used.add(p.entity_id);
  };

  for (const nm of want.preferNames ?? []) {
    if (out.length >= n) break;
    const cand = pool
      .filter((p) => !used.has(p.entity_id) && p.player_name.toLowerCase().includes(nm.toLowerCase()))
      .sort(byValue)[0];
    if (cand) take(cand);
  }

  const fill = (pred: (p: IndexedPlayer) => boolean, allowReuse: boolean) => {
    const ranked = pool
      .filter((p) => (allowReuse || !used.has(p.entity_id)) && pred(p))
      .sort(want.rank);
    for (const p of ranked) {
      if (out.length >= n) break;
      if (!allowReuse && used.has(p.entity_id)) continue;
      if (allowReuse && out.includes(p)) continue;
      take(p);
    }
  };

  fill(want.filter ?? (() => true), false);
  if (out.length < n) fill(() => true, false); // relax predicate, still no reuse
  if (out.length < n) fill(() => true, true); // tiny pool: allow reuse so it fills
  return out.slice(0, n);
}

/** Build one archetype team as a HydratedTeam, reusing the stored-row hydration
 *  path. `used` is the field-level exclusion set. */
function buildArchetypeTeam(
  spec: ArchetypeSpec,
  index: number,
  pool: IndexedPlayer[],
  used: Set<string>,
  playerMap: Map<string, IndexedPlayer>,
  debutMap: Map<string, number>,
): HydratedTeam | null {
  const starters: IndexedPlayer[] = [];
  for (const slot of spec.slots) {
    starters.push(...pickPlayers(pool, used, slot, slot.count));
  }
  if (starters.length < 5) return null;
  const five = starters.slice(0, 5);
  const sixth = pickPlayers(pool, used, spec.sixth, 1)[0];
  if (!sixth) return null;

  const picks: SimPick[] = five.map((p, slot) => ({
    entity_id: p.entity_id,
    team: p.team,
    decade: p.decade,
    slot,
  }));
  // Captain = highest-GQ starter.
  let captainSlot = 0;
  for (let i = 1; i < five.length; i++) {
    if (five[i].value > five[captainSlot].value) captainSlot = i;
  }

  const row: StoredTeamRow = {
    name: spec.label.slice(0, 8),
    roster_json: picks,
    sixth_json: { entity_id: sixth.entity_id, team: sixth.team, decade: sixth.decade },
    captain_slot: captainSlot,
  };
  return hydrateTeamFromPool(row, `syn:${spec.label}:${index}`, false, playerMap, debutMap);
}

function fieldSizeFor(pool: IndexedPlayer[]): BracketSize {
  // Each team wants ~6 players; reuse fallback covers shortfalls, but pick the
  // largest standard size the pool can plausibly support distinctly.
  const n = pool.length;
  if (n >= 16 * 6) return 16;
  if (n >= 8 * 6) return 8;
  return 4;
}

/**
 * Generate `count` deterministic synthetic fields. Each field's roster is built
 * with field-level player exclusion (no player on two teams within a field,
 * pool permitting) and a seeded composition shuffle so the fields aren't
 * identical.
 */
export function buildSyntheticFields(
  pool: IndexedPlayer[],
  count: number,
  seed: string,
): ReplayField[] {
  if (pool.length === 0) return [];
  const playerMap = buildPlayerMap(pool);
  const debutMap = buildDebutMap(pool);
  const specByLabel = new Map(ARCHETYPES.map((a) => [a.label, a]));
  const size = fieldSizeFor(pool);

  const fields: ReplayField[] = [];
  for (let i = 0; i < count; i++) {
    const rng = mulberry32(hashSeed(`${seed}-syn-${i}`));
    const labels = shuffle(FIELD_COMPOSITION, rng).slice(0, size);
    const used = new Set<string>();
    const teams: ReplayTeamRef[] = [];
    let ok = true;
    labels.forEach((label, ti) => {
      const spec = specByLabel.get(label)!;
      const team = buildArchetypeTeam(spec, i * 100 + ti, pool, used, playerMap, debutMap);
      if (!team) {
        ok = false;
        return;
      }
      teams.push({ team, archetype: label });
    });
    if (ok && teams.length === size) {
      fields.push({ id: `syn-${seed}-${i}`, source: "synthetic", size, teams });
    }
  }
  return fields;
}

/** Labels in the order they're declared (for stable report ordering). */
export function archetypeLabels(): string[] {
  return ARCHETYPES.map((a) => a.label);
}

/** Archetype labels considered "tall frontcourt stacks" for the tall-stack
 *  guardrail. */
export const TALL_STACK_ARCHETYPES = new Set(["frontcourt-stack", "no-guard-bigs"]);
