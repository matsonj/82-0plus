/**
 * rerankDailyToday.ts — READ-ONLY. Re-scores the daily-challenge teams submitted
 * on a given day under the LEGACY (pre-calibration) config vs the CURRENT (live,
 * adopted combined-max) config, and reports the projected-win impact per team.
 *
 * Writes nothing. Reads teams from nba_tournament.main.teams and the cached
 * player index, re-hydrates each roster, and runs simulateRoster under both
 * configs. "Projected wins" mirrors the app's reg-season record:
 *   wins = regWinsFromSeedNet(seedNet), seedNet = simulateRoster(roster, cfg).seedNet
 *
 *   npx tsx scripts/rerankDailyToday.ts [--date=YYYY-MM-DD] [--by=created|daily_date]
 *
 *   --date  default: today (local). --by: created (created_at date) | daily_date.
 */
import "./_env";
import { writeFileSync } from "node:fs";
import { getPlayerIndex } from "../lib/queries";
import { queryRW } from "../lib/tournamentDb";
import { simulateRoster } from "../lib/scoring";
import { regWinsFromSeedNet } from "../lib/tier";
import { CANDIDATES, resolveCandidate } from "../lib/calibration/configs";
import {
  buildPlayerMap,
  buildDebutMap,
  hydrateTeamFromPool,
  type StoredTeamRow,
} from "../lib/calibration/hydrate";

function arg(name: string, dflt: string): string {
  const m = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return m ? m.split("=").slice(1).join("=") : dflt;
}

const date = arg("date", new Date().toISOString().slice(0, 10));
const by = arg("by", "created"); // "created" | "daily_date"
const dateCol = by === "daily_date" ? "daily_date" : "CAST(created_at AS DATE)";

interface Row extends StoredTeamRow {
  team_id: string;
  team_name: string;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : 0;
};
const r1 = (x: number) => Math.round(x * 10) / 10;

async function main() {
  const legacy = resolveCandidate(CANDIDATES.find((c) => c.name === "legacy-pre-calibration")!).scoring;
  const current = resolveCandidate(CANDIDATES.find((c) => c.name === "current")!).scoring;

  console.log(`[rerank] player index…`);
  const pool = await getPlayerIndex();
  const playerMap = buildPlayerMap(pool);
  const debutMap = buildDebutMap(pool);

  console.log(`[rerank] daily teams where ${dateCol} = ${date}…`);
  const rows = await queryRW<Row>(
    `SELECT CAST(team_id AS VARCHAR) AS team_id, team_name,
            roster_json, sixth_json, captain_slot, seed_net
       FROM nba_tournament.main.teams
      WHERE mode = 'daily' AND ${dateCol} = $1
      ORDER BY created_at`,
    [date],
  );
  console.log(`[rerank] ${rows.length} teams`);

  const results: {
    name: string;
    avgHeight: number;
    oldWins: number;
    newWins: number;
    delta: number;
    oldSeed: number;
    newSeed: number;
  }[] = [];

  let skipped = 0;
  for (const row of rows) {
    const team = hydrateTeamFromPool(
      { ...row, name: row.team_name },
      `team:${row.team_id}`,
      false,
      playerMap,
      debutMap,
    );
    if (!team) {
      skipped++;
      continue;
    }
    const oldSeed = simulateRoster(team.starters, legacy).seedNet;
    const newSeed = simulateRoster(team.starters, current).seedNet;
    const oldWins = regWinsFromSeedNet(oldSeed);
    const newWins = regWinsFromSeedNet(newSeed);
    const avgHeight = mean(team.starters.map((p) => p.height_in));
    results.push({
      name: row.team_name,
      avgHeight: r1(avgHeight),
      oldWins,
      newWins,
      delta: newWins - oldWins,
      oldSeed: r1(oldSeed),
      newSeed: r1(newSeed),
    });
  }

  const deltas = results.map((r) => r.delta);
  const down = results.filter((r) => r.delta < 0).length;
  const up = results.filter((r) => r.delta > 0).length;
  const same = results.filter((r) => r.delta === 0).length;

  console.log(`\n========== DAILY RE-RANK: legacy → current (${date}) ==========`);
  console.log(`teams scored: ${results.length}${skipped ? ` (skipped ${skipped} unresolvable)` : ""}`);
  console.log(`projected-win delta — mean ${r1(mean(deltas))}, median ${median(deltas)}, min ${Math.min(...deltas)}, max ${Math.max(...deltas)}`);
  console.log(`direction: ${down} lost wins, ${same} unchanged, ${up} gained wins`);

  // Histogram of deltas.
  const buckets = new Map<number, number>();
  for (const d of deltas) buckets.set(d, (buckets.get(d) ?? 0) + 1);
  console.log(`\ndelta histogram (Δwins: count):`);
  [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .forEach(([d, n]) => console.log(`  ${d > 0 ? "+" : ""}${d}: ${"█".repeat(n)} ${n}`));

  const fmt = (r: (typeof results)[number]) =>
    `${r.name.padEnd(10)} ${String(r.oldWins).padStart(3)}→${String(r.newWins).padStart(3)} (${r.delta > 0 ? "+" : ""}${r.delta})  h=${r.avgHeight}"  seed ${r.oldSeed}→${r.newSeed}`;

  console.log(`\nbiggest drops (most wins lost):`);
  [...results].sort((a, b) => a.delta - b.delta).slice(0, 15).forEach((r) => console.log(`  ${fmt(r)}`));
  console.log(`\nbiggest gains / least affected:`);
  [...results].sort((a, b) => b.delta - a.delta).slice(0, 10).forEach((r) => console.log(`  ${fmt(r)}`));

  // Full table → markdown for inspection.
  const md =
    `# Daily re-rank ${date} (legacy → current)\n\n` +
    `${results.length} teams. mean Δ ${r1(mean(deltas))}, median ${median(deltas)}; ${down} down / ${same} same / ${up} up.\n\n` +
    `| team | avgHeight | old wins | new wins | Δ | old seedNet | new seedNet |\n` +
    `| --- | --- | --- | --- | --- | --- | --- |\n` +
    [...results]
      .sort((a, b) => a.delta - b.delta)
      .map((r) => `| ${r.name} | ${r.avgHeight} | ${r.oldWins} | ${r.newWins} | ${r.delta} | ${r.oldSeed} | ${r.newSeed} |`)
      .join("\n") +
    "\n";
  const out = `/tmp/daily-rerank-${date}.md`;
  writeFileSync(out, md);
  console.log(`\n[rerank] full per-team table: ${out}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[rerank] FAILED:", err);
    process.exit(1);
  });
