/**
 * seedGhosts.ts — generate ~60 reproducible "ghost" filler teams and (re)seed
 * them into `tournament.ghosts`.
 *
 * One-off local dev script. NOT part of the request path or the build.
 *
 * HOW TO RUN:
 *   npx tsx scripts/seedGhosts.ts
 *
 *   Tokens load from .env.local (see ./_env) — never paste them inline on the
 *   command line (they leak into shell history / terminal logs).
 *   - MOTHERDUCK_TOKEN     (read)  — used by getPlayerIndex / simulateRoster inputs.
 *   - MOTHERDUCK_RW_TOKEN  (write) — used by ensureSchema + the ghost inserts.
 *
 * Idempotent: it DELETEs every existing ghost first, then re-inserts the field.
 * The roster generation is driven by a SEEDED PRNG (mulberry32(hashSeed("ghosts-v2")))
 * so re-running produces the exact same 60 ghosts every time.
 *
 * STRENGTH FLOOR: every ghost is STRONG. We bias sampling toward high-GQ players
 * and REJECT-AND-RESAMPLE any candidate whose 5-starter netRating < NET_FLOOR
 * (= 5), re-rolling on the same seeded RNG (which keeps advancing) until it
 * clears the floor. The field targets a spread of roughly +5 → +15 net so it is
 * uniformly tough but still varied. See NET_FLOOR / buildStrongGhost below.
 *
 * Stored JSON shape (must match how drawOpponents/hydrateStoredTeam re-reads it):
 *   roster_json : SimPick[]   -> [{ entity_id, team, decade, slot }]  (5 starters)
 *   sixth_json  : StoredSixth -> { entity_id, team, decade }          (bench)
 *   seed_net    : DOUBLE      -> simulateRoster(starters).seedNet
 */

import "./_env"; // loads .env.local before any lib/* module reads process.env
import type { SlotKind } from "../lib/positions";
import { canPlay } from "../lib/positions";
import { getPlayerIndex, type IndexedPlayer } from "../lib/queries";
import { simulateRoster, type ScoringPlayer } from "../lib/scoring";
import { hashSeed, mulberry32 } from "../lib/tournament";
import { ensureSchema, queryRW, TDB } from "../lib/oltpDb";
import type { SimPick } from "../lib/types";

// The fixed lineup board: 5 starters in slot order [G, FLEX, W, FLEX, B].
const SLOT_ORDER: SlotKind[] = ["G", "FLEX", "W", "FLEX", "B"];

// How many ghosts to seed.
const GHOST_COUNT = 60;

// Strength floor: every ghost's 5-starter netRating MUST be >= this. Candidates
// below it are rejected and resampled (see buildStrongGhost). This is what makes
// the ghost field uniformly hard to beat for the championship.
const NET_FLOOR = 5;

// Roster diversity: at most this many players from any single decade (across all
// six — five starters + the sixth man). Keeps ghosts from being all-one-era.
const MAX_PER_DECADE = 2;

// Max resample attempts per ghost before we widen to the strongest-players pool.
// With high-GQ-biased sampling the floor is usually cleared in a handful of
// tries; this cap just guards against pathological deadlock.
const MAX_ATTEMPTS_PER_GHOST = 200;

// Arcade-flavored names. We need GHOST_COUNT unique names; the base list below
// is long enough, but we suffix numbers if it ever runs short, so the field is
// always exactly GHOST_COUNT and always uniquely named.
const NAME_POOL = [
  "BUCKETS", "SWAT TEAM", "GLASS", "ICE", "BOOMSHAKA", "THE WALL", "SPLASH",
  "RIM REAPERS", "HACK CITY", "FAST BREAK", "DUNK MOB", "BRICK CITY",
  "NET RIPPERS", "FLOOR GENERALS", "SKY HOOKS", "POSTERIZED", "ANKLE BREAKERS",
  "PICK SIX", "ALLEY OOPS", "TOMAHAWKS", "BOARD MEN", "HEAT CHECK", "GREEN LIGHT",
  "CASH MONEY", "FROM DOWNTOWN", "GLASS CLEANERS", "RUN AND GUN", "CHALK DUST",
  "PAINT KINGS", "PERIMETER", "TRIPLE DOUBLE", "BUZZER BEATERS", "FADEAWAY",
  "CROSSOVER", "FULL COURT", "ZONE BUSTERS", "PICK AND ROLL", "TRANSITION",
  "EUROSTEP", "NO LOOK", "AND ONE", "GARBAGE TIME", "BENCH MOB", "SIXTH SENSE",
  "LOCKDOWN", "STEAL SQUAD", "BLOCK PARTY", "REBOUND CO", "SHOT CLOCK",
  "OVERTIME", "TIP OFF", "JUMP BALL", "FULL SEND", "GAME OVER", "CLUTCH GENE",
  "ELBOW JUMPER", "BANK SHOT", "GLASS HOUSE", "NOTHIN BUT NET", "FREE THROW",
] as const;

/** GQ band → an [min, max] window on the index GQ (value), used to bias strength. */
interface Band {
  lo: number;
  hi: number;
}

// Every band is STRONG — the field no longer spans weak → elite. These windows
// sit high on the GQ scale so every sampled roster starts well above average,
// and the NET_FLOOR reject-and-resample guarantees the rest. Cycling the bands
// just gives variety in the +5 → +15 net spread (lower bands cluster near the
// floor, higher bands push toward elite) without ever dropping below it.
const BANDS: Band[] = [
  { lo: 0.6, hi: 0.78 }, // strong
  { lo: 0.65, hi: 0.85 }, // very strong
  { lo: 0.7, hi: 0.9 }, // near-elite
  { lo: 0.78, hi: 1.0 }, // elite
  { lo: 0.85, hi: 1.0 }, // superteam
];

/** Map an indexed player into the scoring shape (mirrors hydrateRoster in lib/queries.ts). */
function toScoring(p: IndexedPlayer): ScoringPlayer {
  return {
    gq: p.value,
    season: p.best_season,
    mpg: p.mpg,
    pts: p.pts,
    reb: p.reb,
    ast: p.ast,
    stl: p.stl,
    blk: p.blk,
    fga: p.fga,
    fg3a: p.fg3a,
    fg3m: p.fg3m,
    fta: p.fta,
    tov: p.tov,
    fgm: p.fgm,
    ftm: p.ftm,
    tsplus: Number.isFinite(p.tsplus) ? p.tsplus : 1,
    height_in: Number.isFinite(p.height_in) ? p.height_in : 79,
    pos: p.pos ?? null,
    allDef: p.all_def ?? 0,
  };
}

/** A picked player paired with the slot index it fills. */
interface Picked {
  player: IndexedPlayer;
  slot: number;
}

/**
 * Build ONE valid 6-man ghost from the index for a given GQ band:
 *  - 5 starters filling [G, FLEX, W, FLEX, B] (respect canPlay per slot)
 *  - a 6th bench player (any eligibility)
 * Constraints across the whole six:
 *  - NO duplicate PLAYERS — deduped by entity_id, so a player who appears under
 *    multiple team/decade rows can't be picked twice.
 *  - at most MAX_PER_DECADE players from the same decade.
 * Sampling is biased to the band but falls back to `strongPool` (the strongest
 * players in the index, NOT the full index) if a band is too thin to fill a
 * slot — keeping every roster strong without deadlocking. Returns null if the
 * board can't be satisfied under the constraints (the caller resamples).
 *
 * The NET_FLOOR is enforced by the reject-and-resample loop in buildStrongGhost.
 */
function buildGhostRoster(
  index: IndexedPlayer[],
  strongPool: IndexedPlayer[],
  band: Band,
  rng: () => number,
): { starters: Picked[]; sixth: IndexedPlayer } | null {
  const inBand = index.filter((p) => p.value >= band.lo && p.value <= band.hi);

  const usedIds = new Set<string>(); // entity_id — no repeated players
  const decadeCounts = new Map<number, number>(); // ≤ MAX_PER_DECADE each
  const canTake = (p: IndexedPlayer) =>
    !usedIds.has(p.entity_id) &&
    (decadeCounts.get(p.decade) ?? 0) < MAX_PER_DECADE;
  const take = (p: IndexedPlayer) => {
    usedIds.add(p.entity_id);
    decadeCounts.set(p.decade, (decadeCounts.get(p.decade) ?? 0) + 1);
  };
  // Prefer the band; fall back to the STRONG pool so a slot is always fillable
  // without ever reaching into weak players.
  const pickFrom = (pool: IndexedPlayer[], slot: SlotKind): IndexedPlayer | null => {
    const eligible = pool.filter((p) => canTake(p) && canPlay(p, slot));
    if (eligible.length === 0) return null;
    return eligible[Math.floor(rng() * eligible.length)];
  };

  const starters: Picked[] = [];
  for (let slot = 0; slot < SLOT_ORDER.length; slot++) {
    const kind = SLOT_ORDER[slot];
    const player = pickFrom(inBand, kind) ?? pickFrom(strongPool, kind);
    if (!player) return null;
    take(player);
    starters.push({ player, slot });
  }

  // Sixth man: any eligibility, but still distinct + within the decade cap.
  const sixthBand = inBand.filter(canTake);
  const sixthFallback = strongPool.filter(canTake);
  const pool = sixthBand.length > 0 ? sixthBand : sixthFallback;
  if (pool.length === 0) return null;
  const sixth = pool[Math.floor(rng() * pool.length)];

  return { starters, sixth };
}

/**
 * Build a ghost that CLEARS THE NET FLOOR. Repeatedly calls buildGhostRoster on
 * the (continually advancing) seeded RNG, computing the 5-starter netRating each
 * time, and only returns once netRating >= NET_FLOOR. Reproducible because the
 * RNG keeps advancing deterministically across attempts. Returns the best
 * candidate seen if the cap is hit (should not happen with strong bands), so the
 * field is always full; the caller logs if any ghost ends up below the floor.
 */
function buildStrongGhost(
  index: IndexedPlayer[],
  strongPool: IndexedPlayer[],
  band: Band,
  rng: () => number,
): { starters: Picked[]; sixth: IndexedPlayer; seedNet: number } | null {
  let best: { starters: Picked[]; sixth: IndexedPlayer; seedNet: number } | null =
    null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_GHOST; attempt++) {
    const built = buildGhostRoster(index, strongPool, band, rng);
    if (!built) continue;
    const seedNet = simulateRoster(
      built.starters.map((s) => toScoring(s.player)),
    ).seedNet;
    const candidate = { ...built, seedNet };
    if (seedNet >= NET_FLOOR) return candidate; // cleared the floor — done.
    if (!best || seedNet > best.seedNet) best = candidate; // keep the strongest.
  }
  return best;
}

async function main(): Promise<void> {
  console.log("[seedGhosts] ensuring tournament schema…");
  await ensureSchema();

  console.log("[seedGhosts] loading player index…");
  const index = await getPlayerIndex();
  console.log(`[seedGhosts] index has ${index.length} player rows.`);
  if (index.length === 0) {
    throw new Error("player index is empty — cannot build ghosts");
  }

  // Deterministic field: a single seeded PRNG drives every choice. Bumped to
  // "ghosts-v3" since the field is changing (uniformly strong net >= 5, no
  // duplicate players, ≤2 players per decade).
  const rng = mulberry32(hashSeed("ghosts-v3"));

  // The "strong pool" used as the sampling fallback: the top slice of the index
  // by GQ. Widening to this (rather than the full index) keeps every roster
  // strong even when a band is thin for some slot. Take the strongest ~40% (at
  // least 200 rows) so there's always depth at every position.
  const sorted = [...index].sort((a, b) => b.value - a.value);
  const strongCount = Math.max(200, Math.floor(index.length * 0.4));
  const strongPool = sorted.slice(0, Math.min(strongCount, index.length));
  console.log(
    `[seedGhosts] strong fallback pool: ${strongPool.length} rows ` +
      `(GQ >= ${strongPool[strongPool.length - 1]?.value.toFixed(3)}).`,
  );

  // Wipe then reseed so re-running never duplicates. Only the STANDARD ghosts —
  // daily ghosts (ghost_type='daily') are date-scoped and regenerate lazily.
  console.log(`[seedGhosts] wiping standard ghosts in ${TDB}.ghosts…`);
  await queryRW(
    `DELETE FROM ${TDB}.ghosts WHERE COALESCE(ghost_type, 'standard') <> 'daily'`,
  );

  let inserted = 0;
  for (let i = 0; i < GHOST_COUNT; i++) {
    // Cycle the bands — all strong — for variety within a uniformly tough field.
    const band = BANDS[i % BANDS.length];

    // Reject-and-resample until the candidate clears NET_FLOOR (net >= 5).
    const built = buildStrongGhost(index, strongPool, band, rng);
    if (!built) {
      console.warn(`[seedGhosts] ghost ${i}: could not build a valid roster, skipping.`);
      continue;
    }
    if (built.seedNet < NET_FLOOR) {
      console.warn(
        `[seedGhosts] ghost ${i}: hit attempt cap below floor ` +
          `(seed_net=${built.seedNet.toFixed(1)} < ${NET_FLOOR}).`,
      );
    }

    const { starters, sixth, seedNet } = built;

    // roster_json: SimPick[] — exactly what hydrateStoredTeam parses + feeds to
    // hydrateRoster (entity_id|team|decade re-resolve the index row; slot drives
    // the per-slot eligibility / display order).
    const rosterJson: SimPick[] = starters.map((s) => ({
      entity_id: s.player.entity_id,
      team: s.player.team,
      decade: s.player.decade,
      slot: s.slot,
    }));
    // sixth_json: StoredSixth — { entity_id, team, decade } (no slot).
    const sixthJson = {
      entity_id: sixth.entity_id,
      team: sixth.team,
      decade: sixth.decade,
    };

    // seed_net = the FIVE starters' netRating via simulateRoster (NO buffs) —
    // exactly the seeding strength the engine consumes. Already computed (and
    // floor-checked) inside buildStrongGhost; reuse it.

    const name = NAME_POOL[i] ?? `GHOST ${i + 1}`;

    await queryRW(
      `INSERT INTO ${TDB}.ghosts
         (ghost_id, name, roster_json, sixth_json, seed_net, ghost_type, ghost_date)
       VALUES ($1, $2, $3, $4, $5, 'standard', NULL)`,
      [
        i, // ghost_id
        name,
        JSON.stringify(rosterJson),
        JSON.stringify(sixthJson),
        seedNet,
      ],
    );
    inserted++;
    console.log(
      `[seedGhosts] ghost ${String(i).padStart(2, " ")} "${name}" ` +
        `band[${band.lo}-${band.hi}] seed_net=${seedNet.toFixed(1)}`,
    );
  }

  // Final summary so the field's strength spread is visible at a glance. Scoped to
  // the STANDARD pool this script manages — daily ghosts (ghost_type='daily') are
  // "Open" (no tier floor) and would otherwise drag the min below NET_FLOOR and
  // trip a false floor-breach warning.
  const summary = await queryRW<{ n: number; min_net: number; max_net: number }>(
    `SELECT count(*) AS n, min(seed_net) AS min_net, max(seed_net) AS max_net
       FROM ${TDB}.ghosts
      WHERE COALESCE(ghost_type, 'standard') <> 'daily'`,
  );
  const s = summary[0];
  const minNet = Number(s?.min_net);
  const maxNet = Number(s?.max_net);
  console.log("[seedGhosts] done.");
  console.log(
    `[seedGhosts] inserted=${inserted} | rows=${s?.n} | ` +
      `seed_net min=${minNet.toFixed(1)} max=${maxNet.toFixed(1)}`,
  );
  // Confirm the strength floor held across the whole field.
  if (minNet >= NET_FLOOR) {
    console.log(
      `[seedGhosts] ✓ floor OK: every ghost has seed_net >= ${NET_FLOOR} ` +
        `(min=${minNet.toFixed(1)}).`,
    );
  } else {
    console.warn(
      `[seedGhosts] ✗ floor BREACHED: min seed_net ${minNet.toFixed(1)} ` +
        `< ${NET_FLOOR} — widen the bands or raise MAX_ATTEMPTS_PER_GHOST.`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seedGhosts] FAILED:", err);
    process.exit(1);
  });
