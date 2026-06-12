// ============================================================================
// Deterministic in-memory player pool + stat norms for the fixture smoke mode.
//
// Lets the CLI (and CI) verify the full replay → report pipeline (Markdown +
// JSON output, synthetic field generation, scoring) WITHOUT MotherDuck tokens or
// any DB access. Everything here is derived from a fixed seed; no Math.random.
// ============================================================================

import type { IndexedPlayer } from "../queries";
import type { StatNorms } from "../types";
import { STAT_KEYS, FG_BASELINE, FT_BASELINE } from "../types";

function mk(over: Partial<IndexedPlayer> & { entity_id: string }): IndexedPlayer {
  return {
    player_name: over.entity_id,
    team: "FIX",
    decade: 2010,
    best_season: 2012,
    value: 0.6,
    gp: 70,
    mpg: 32,
    pts: 18,
    reb: 6,
    ast: 4,
    stl: 1.2,
    blk: 0.6,
    fga: 14,
    fg3a: 3,
    fg3m: 1.2,
    fta: 4,
    tov: 2,
    fgm: 7,
    ftm: 3,
    tsplus: 1.05,
    height_in: 79,
    pos: "F",
    all_def: 0,
    debut: 2008,
    ...over,
  };
}

/** ~60 synthetic players spanning guards / wings / bigs with varied talent,
 *  height, shooting and defense so the archetype selectors all resolve. */
export function fixturePlayerPool(): IndexedPlayer[] {
  const pool: IndexedPlayer[] = [];
  const tiers = [0.92, 0.85, 0.78, 0.7, 0.62];

  // Guards: short, high assist, good shooters.
  for (let i = 0; i < 20; i++) {
    const v = tiers[i % tiers.length] - (i % 7) * 0.01;
    pool.push(
      mk({
        entity_id: `G${i}`,
        player_name: `Guard_${i}`,
        pos: "G",
        height_in: 73 + (i % 4),
        value: v,
        pts: 20 + (i % 6),
        ast: 7 + (i % 5),
        reb: 3 + (i % 3),
        stl: 1.6 + (i % 3) * 0.2,
        blk: 0.2,
        fga: 16,
        fg3a: 6,
        fg3m: 2.6,
        fta: 5,
        ftm: 4.4, // ~0.88 FT
        fgm: 7,
        all_def: i % 5 === 0 ? 1 : 0,
        best_season: 2000 + i,
        debut: 1996 + (i % 6),
      }),
    );
  }
  // Wings: mid height, balanced.
  for (let i = 0; i < 20; i++) {
    const v = tiers[i % tiers.length] - (i % 5) * 0.012;
    pool.push(
      mk({
        entity_id: `W${i}`,
        player_name: `Wing_${i}`,
        pos: "F",
        height_in: 78 + (i % 4),
        value: v,
        pts: 22 + (i % 5),
        ast: 4 + (i % 4),
        reb: 6 + (i % 4),
        stl: 1.3,
        blk: 0.7 + (i % 3) * 0.2,
        fga: 16,
        fg3a: 4,
        fg3m: 1.7,
        fta: 5,
        ftm: 4.0,
        fgm: 8,
        all_def: i % 4 === 0 ? 2 : 0,
        best_season: 2002 + i,
        debut: 1998 + (i % 6),
      }),
    );
  }
  // Bigs: tall, rebound/block, weaker shooters.
  for (let i = 0; i < 20; i++) {
    const v = tiers[i % tiers.length] + 0.01 - (i % 6) * 0.01;
    pool.push(
      mk({
        entity_id: `B${i}`,
        player_name: `Big_${i}`,
        pos: i % 3 === 0 ? "C" : "C-F",
        height_in: 82 + (i % 5),
        value: v,
        pts: 19 + (i % 6),
        ast: 2 + (i % 2),
        reb: 11 + (i % 5),
        stl: 0.7,
        blk: 1.8 + (i % 4) * 0.3,
        fga: 13,
        fg3a: 0.3,
        fg3m: 0.05,
        fta: 7,
        ftm: 4.2, // ~0.6 FT — non-shooter tell
        fgm: 7,
        all_def: i % 3 === 0 ? 1 : 0,
        best_season: 1995 + i,
        debut: 1990 + (i % 7),
      }),
    );
  }
  return pool;
}

/** Per-36 population mean + std over the fixture pool (mirrors getStatNorms). */
export function fixtureStatNorms(pool: IndexedPlayer[]): StatNorms {
  const per36 = (stat: number, mpg: number) => (mpg > 0 ? (stat * 36) / mpg : 0);
  const valsFor = (p: IndexedPlayer): Record<string, number> => ({
    pts: per36(p.pts, p.mpg),
    reb: per36(p.reb, p.mpg),
    ast: per36(p.ast, p.mpg),
    stl: per36(p.stl, p.mpg),
    blk: per36(p.blk, p.mpg),
    fgV: p.fga > 0 ? (p.fgm / p.fga - FG_BASELINE) * per36(p.fga, p.mpg) : 0,
    ftV: p.fta > 0 ? (p.ftm / p.fta - FT_BASELINE) * per36(p.fta, p.mpg) : 0,
    tov: per36(p.tov, p.mpg),
  });
  const filtered = pool.filter((p) => p.mpg >= 10);
  const n = filtered.length || 1;
  const vals = filtered.map(valsFor);
  const mean = {} as StatNorms["mean"];
  const std = {} as StatNorms["std"];
  for (const key of STAT_KEYS) {
    let sum = 0;
    for (const v of vals) sum += v[key];
    const m = sum / n;
    let varSum = 0;
    for (const v of vals) varSum += (v[key] - m) ** 2;
    mean[key] = m;
    std[key] = Math.sqrt(varSum / n);
  }
  return { mean, std };
}
