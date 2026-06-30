/**
 * buildCache.ts — build/refresh the `app_cache` derived-data cache once, then
 * verify it. One-off dev/ops helper; in production the lazy stale-while-
 * revalidate check (lib/appCache.refreshCacheIfStale) does this automatically.
 *
 * HOW TO RUN:  npx tsx scripts/buildCache.ts
 *   Tokens load from .env.local (see ./_env). Needs MOTHERDUCK_RW_TOKEN (its
 *   account must also be able to read nba_box_scores_v2 — the rebuild's source).
 */
import "./_env";
import { rebuildCache, ACDB, PGC } from "../lib/appCache";
import { queryRW } from "../lib/tournamentDb";
import { query } from "../lib/motherduck";
import { queryRW as queryPG } from "../lib/oltpDb";

async function main() {
  console.time("rebuild");
  await rebuildCache();
  console.timeEnd("rebuild");

  console.log("MotherDuck app_cache:");
  for (const t of [
    "game_quality",
    "player_season_stats",
    "player_index",
    "team_decade_weights",
  ]) {
    const [{ n }] = await queryRW<{ n: number }>(
      `SELECT count(*) AS n FROM ${ACDB}.${t}`,
    );
    console.log(`  ${t}: ${n.toLocaleString()} rows`);
  }

  // rebuildCache() also pushed the three small tables to the Postgres serving cache
  // (what the request path reads). Verify parity there too.
  console.log("Postgres serving cache:");
  for (const [pg, md] of [
    ["cache_player_index", "player_index"],
    ["cache_player_season_stats", "player_season_stats"],
    ["cache_team_decade_weights", "team_decade_weights"],
  ]) {
    const [{ n: pgN }] = await queryPG<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${PGC}.${pg}`,
    );
    const [{ n: mdN }] = await queryRW<{ n: number }>(
      `SELECT count(*) AS n FROM ${ACDB}.${md}`,
    );
    const mark = Number(pgN) === Number(mdN) ? "✓" : "✗ MISMATCH";
    console.log(`  ${pg}: ${pgN.toLocaleString()} rows (MotherDuck ${mdN.toLocaleString()}) ${mark}`);
  }

  // Spot-check: cached card rows for entity 1449 must match the live view.
  const cached = await queryRW(
    `SELECT season, team, gq, gp, pts FROM ${ACDB}.player_season_stats
      WHERE entity_id = '1449' ORDER BY season, gp DESC, team`,
  );
  const live = await query(
    `SELECT s.season_year AS season, b.team_abbreviation AS team,
            round(median(g.game_quality),3) AS gq,
            count(*) AS gp, round(avg(b.points),1) AS pts
       FROM nba_box_scores_v2.main.game_quality g
       JOIN nba_box_scores_v2.main.box_scores b
         ON g.game_id=b.game_id AND g.entity_id=b.entity_id AND b.period='FullGame'
       JOIN nba_box_scores_v2.main.schedule s ON g.game_id=s.game_id
      WHERE g.entity_id='1449' AND g.game_quality>=0 AND s.season_type='Regular Season'
      GROUP BY 1, b.team_abbreviation HAVING count(*)>=5 ORDER BY season, gp DESC, team`,
  );
  const same = JSON.stringify(cached) === JSON.stringify(live);
  console.log(
    `  spot-check entity 1449: cached ${cached.length} seasons, live ${live.length} — ${same ? "MATCH ✓" : "MISMATCH ✗"}`,
  );
  if (!same) {
    console.log("cached:", JSON.stringify(cached.slice(0, 3)));
    console.log("live:  ", JSON.stringify(live.slice(0, 3)));
  }
  process.exit(same ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
