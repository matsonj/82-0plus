/**
 * One-time seed: copy the already-built MotherDuck `app_cache` derived tables into
 * the Postgres serving cache (tournament.cache_*). Run this ONCE before deploying
 * the reader cutover, so the request path has data to read from Postgres on the
 * first request (otherwise it falls back to the live MotherDuck view until the
 * first cron rebuild — correct, but it wakes the duckling, defeating the point).
 *
 *   node --env-file=.env.local --import tsx scripts/seedCacheToPostgres.ts
 *
 * Needs DATABASE_URL (Postgres target) and MOTHERDUCK_RW_TOKEN (reads the existing
 * `app_cache` on MotherDuck — its account must also read `nba_box_scores_v2` for the
 * source fingerprint). This does NOT recompute the cache (no heavy self-join); it
 * just copies the existing rollups. To recompute first, run scripts/buildCache.ts.
 */
import "./_env";
import { pushCacheToPostgres, PGC } from "../lib/appCache";
import { queryRW as queryPG } from "../lib/oltpDb";

async function main() {
  console.log("[seed-cache] copying app_cache (MotherDuck) → Postgres…");
  console.time("seed");
  const pushed = await pushCacheToPostgres();
  console.timeEnd("seed");
  console.log(`[seed-cache] pushed ${pushed.toLocaleString()} rows total`);

  for (const t of [
    "cache_player_index",
    "cache_player_season_stats",
    "cache_team_decade_weights",
  ]) {
    const [{ n }] = await queryPG<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${PGC}.${t}`,
    );
    console.log(`  ${PGC}.${t}: ${n.toLocaleString()} rows`);
  }
  console.log("[seed-cache] done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("\n[seed-cache] FAILED:", err);
  process.exit(1);
});
