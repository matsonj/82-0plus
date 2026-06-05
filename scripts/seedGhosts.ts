/**
 * seedGhosts.ts — generate ~60 reproducible "ghost" filler teams and (re)seed
 * them into `nba_tournament.main.ghosts`.
 *
 * One-off local dev script. NOT part of the request path or the build.
 *
 * HOW TO RUN:
 *   MOTHERDUCK_TOKEN=<read token> \
 *   MOTHERDUCK_RW_TOKEN=<read-write token> \
 *     npx tsx scripts/seedGhosts.ts
 *
 *   - MOTHERDUCK_TOKEN     (read)  — used by getPlayerIndex / simulateRoster inputs.
 *   - MOTHERDUCK_RW_TOKEN  (write) — used by ensureSchema + the ghost inserts.
 *
 * Idempotent: it DELETEs every existing ghost first, then re-inserts the field.
 * The roster generation is driven by a SEEDED PRNG (mulberry32(hashSeed("ghosts-v1")))
 * so re-running produces the exact same 60 ghosts every time.
 *
 * Stored JSON shape (must match how drawOpponents/hydrateStoredTeam re-reads it):
 *   roster_json : SimPick[]   -> [{ entity_id, team, decade, slot }]  (5 starters)
 *   sixth_json  : StoredSixth -> { entity_id, team, decade }          (bench)
 *   seed_net    : DOUBLE      -> simulateRoster(starters).netRating
 */

import type { SlotKind } from "../lib/positions";
import { canPlay } from "../lib/positions";
import { getPlayerIndex, type IndexedPlayer } from "../lib/queries";
import { simulateRoster, type ScoringPlayer } from "../lib/scoring";
import { hashSeed, mulberry32 } from "../lib/tournament";
import { ensureSchema, queryRW, TDB } from "../lib/tournamentDb";
import type { SimPick } from "../lib/types";

// The fixed lineup board: 5 starters in slot order [G, FLEX, W, FLEX, B].
const SLOT_ORDER: SlotKind[] = ["G", "FLEX", "W", "FLEX", "B"];

// How many ghosts to seed.
const GHOST_COUNT = 60;

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

// Spread the field across strength so seed_net ranges weak → strong. Each ghost
// samples its players from one of these GQ windows; lower windows make weaker
// rosters, higher windows make stronger ones.
const BANDS: Band[] = [
  { lo: 0.35, hi: 0.5 }, // weak
  { lo: 0.45, hi: 0.6 }, // below average
  { lo: 0.5, hi: 0.7 }, // average
  { lo: 0.6, hi: 0.85 }, // strong
  { lo: 0.7, hi: 1.0 }, // elite
];

/** Map an indexed player into the scoring shape (mirrors hydrateRoster in lib/queries.ts). */
function toScoring(p: IndexedPlayer): ScoringPlayer {
  return {
    gq: p.value,
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
 *  - 5 starters filling [G, FLEX, W, FLEX, B] (respect canPlay per slot; distinct)
 *  - a 6th bench player (any eligibility, distinct from the five)
 * Sampling is biased to the band but falls back to the full pool if a band is
 * too thin to fill a slot, so generation never deadlocks. Returns null only if
 * the index itself can't satisfy the board (shouldn't happen with a real index).
 */
function buildGhostRoster(
  index: IndexedPlayer[],
  band: Band,
  rng: () => number,
): { starters: Picked[]; sixth: IndexedPlayer } | null {
  const inBand = index.filter((p) => p.value >= band.lo && p.value <= band.hi);
  // Prefer the band; fall back to the full index so a slot is always fillable.
  const pickFrom = (
    pool: IndexedPlayer[],
    slot: SlotKind,
    used: Set<string>,
  ): IndexedPlayer | null => {
    const eligible = pool.filter(
      (p) => !used.has(keyOf(p)) && canPlay(p, slot),
    );
    if (eligible.length === 0) return null;
    return eligible[Math.floor(rng() * eligible.length)];
  };

  const used = new Set<string>();
  const starters: Picked[] = [];
  for (let slot = 0; slot < SLOT_ORDER.length; slot++) {
    const kind = SLOT_ORDER[slot];
    const player =
      pickFrom(inBand, kind, used) ?? pickFrom(index, kind, used);
    if (!player) return null;
    used.add(keyOf(player));
    starters.push({ player, slot });
  }

  // Sixth man: any eligibility, distinct from the five. Prefer the band.
  const sixthPool = inBand.filter((p) => !used.has(keyOf(p)));
  const fallbackPool = index.filter((p) => !used.has(keyOf(p)));
  const pool = sixthPool.length > 0 ? sixthPool : fallbackPool;
  if (pool.length === 0) return null;
  const sixth = pool[Math.floor(rng() * pool.length)];

  return { starters, sixth };
}

/** Stable de-dup key for an index row (a player can appear per team+decade). */
function keyOf(p: IndexedPlayer): string {
  return `${p.entity_id}|${p.team}|${p.decade}`;
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

  // Deterministic field: a single seeded PRNG drives every choice.
  const rng = mulberry32(hashSeed("ghosts-v1"));

  // Wipe then reseed so re-running never duplicates.
  console.log(`[seedGhosts] wiping ${TDB}.ghosts…`);
  await queryRW(`DELETE FROM ${TDB}.ghosts`);

  let inserted = 0;
  for (let i = 0; i < GHOST_COUNT; i++) {
    // Cycle the bands so the field is evenly spread weak → strong.
    const band = BANDS[i % BANDS.length];

    let built = buildGhostRoster(index, band, rng);
    // Retry a few times within the band in case of an unlucky de-dup deadlock.
    for (let attempt = 0; attempt < 5 && !built; attempt++) {
      built = buildGhostRoster(index, band, rng);
    }
    if (!built) {
      console.warn(`[seedGhosts] ghost ${i}: could not build a valid roster, skipping.`);
      continue;
    }

    const { starters, sixth } = built;

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
    // exactly the seeding strength the engine consumes.
    const seedNet = simulateRoster(starters.map((s) => toScoring(s.player)))
      .netRating;

    const name = NAME_POOL[i] ?? `GHOST ${i + 1}`;

    await queryRW(
      `INSERT INTO ${TDB}.ghosts (ghost_id, name, roster_json, sixth_json, seed_net)
       VALUES ($1, $2, $3, $4, $5)`,
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

  // Final summary so the field's strength spread is visible at a glance.
  const summary = await queryRW<{ n: number; min_net: number; max_net: number }>(
    `SELECT count(*) AS n, min(seed_net) AS min_net, max(seed_net) AS max_net
       FROM ${TDB}.ghosts`,
  );
  const s = summary[0];
  console.log("[seedGhosts] done.");
  console.log(
    `[seedGhosts] inserted=${inserted} | rows=${s?.n} | ` +
      `seed_net min=${Number(s?.min_net).toFixed(1)} max=${Number(s?.max_net).toFixed(1)}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seedGhosts] FAILED:", err);
    process.exit(1);
  });
