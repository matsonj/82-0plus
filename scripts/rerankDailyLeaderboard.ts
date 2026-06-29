/**
 * rerankDailyLeaderboard.ts — READ-ONLY. Reconstructs the daily-challenge
 * leaderboard field for a date (the same `daily_results` rows the front-page
 * "Rank #N of TOTAL" ranks) and re-scores every entry under the CURRENT
 * (live, adopted height-aware) config vs the LEGACY (pre-calibration) config,
 * reporting the projected-win and rank impact per entry.
 *
 * The leaderboard ranks daily_results by (wins DESC, margin DESC), where
 *   wins   = simulateRoster(roster).wins
 *   margin = simulateRoster(roster).netRating
 * daily_results.roster_json is a DISPLAY roster (name/team/season, no entity_id),
 * so each line is matched back to the player index by (name, team, best_season)
 * to recover full stats. Writes nothing.
 *
 *   npx tsx scripts/rerankDailyLeaderboard.ts [--date=YYYY-MM-DD]
 */
import "./_env";
import { writeFileSync } from "node:fs";
import { getPlayerIndex, type IndexedPlayer } from "../lib/queries";
import { queryRW } from "../lib/oltpDb";
import { simulateRoster, type ScoringPlayer } from "../lib/scoring";
import { CANDIDATES, resolveCandidate } from "../lib/calibration/configs";

function arg(name: string, dflt: string): string {
  const m = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return m ? m.split("=").slice(1).join("=") : dflt;
}
const date = arg("date", new Date().toISOString().slice(0, 10));

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : 0;
};
const r1 = (x: number) => Math.round(x * 10) / 10;

function toScoring(p: IndexedPlayer): ScoringPlayer {
  return {
    gq: p.value, season: p.best_season, mpg: p.mpg,
    pts: p.pts, reb: p.reb, ast: p.ast, stl: p.stl, blk: p.blk,
    fga: p.fga, fg3a: p.fg3a, fg3m: p.fg3m, fta: p.fta, tov: p.tov,
    fgm: p.fgm, ftm: p.ftm,
    tsplus: Number.isFinite(p.tsplus) ? p.tsplus : 1,
    height_in: Number.isFinite(p.height_in) ? p.height_in : 79,
    pos: p.pos ?? null, allDef: p.all_def ?? 0,
  };
}

interface DailyLine { name: string; team: string; season: number }
interface ResultRow { user_id: string; name: string; wins: number; margin: number; roster_json: unknown }

/** Competition rank (ties share a rank): 1 + #strictly-better. */
function ranks(entries: { wins: number; margin: number }[]): number[] {
  return entries.map(
    (e) =>
      1 +
      entries.filter(
        (o) => o.wins > e.wins || (o.wins === e.wins && o.margin > e.margin),
      ).length,
  );
}

async function main() {
  const legacy = resolveCandidate(CANDIDATES.find((c) => c.name === "legacy-pre-calibration")!).scoring;
  const current = resolveCandidate(CANDIDATES.find((c) => c.name === "current")!).scoring;

  console.log(`[rerank] player index…`);
  const pool = await getPlayerIndex();
  const byNameTeamSeason = new Map<string, IndexedPlayer>();
  for (const p of pool) {
    const k = `${p.player_name}|${p.team}|${p.best_season}`;
    if (!byNameTeamSeason.has(k)) byNameTeamSeason.set(k, p);
  }

  console.log(`[rerank] daily_results for ${date}…`);
  const rows = await queryRW<ResultRow>(
    `SELECT d.user_id, u.name, d.wins, d.margin, d.roster_json
       FROM tournament.daily_results d
       JOIN tournament.users u ON u.user_id = d.user_id
      WHERE d.daily_date = $1`,
    [date],
  );
  console.log(`[rerank] ${rows.length} ranked entries`);

  type Scored = {
    name: string; oldWins: number; oldMargin: number; newWins: number; newMargin: number;
    storedWins: number; avgHeight: number;
  };
  const scored: Scored[] = [];
  let unresolved = 0;

  for (const row of rows) {
    const lines =
      (typeof row.roster_json === "string" ? JSON.parse(row.roster_json) : row.roster_json) as DailyLine[];
    const starters: ScoringPlayer[] = [];
    let ok = true;
    for (const ln of lines) {
      const p = byNameTeamSeason.get(`${ln.name}|${ln.team}|${ln.season}`);
      if (!p) { ok = false; break; }
      starters.push(toScoring(p));
    }
    if (!ok || starters.length !== 5) { unresolved++; continue; }

    const oldSim = simulateRoster(starters, legacy);
    const newSim = simulateRoster(starters, current);
    scored.push({
      name: row.name,
      oldWins: oldSim.wins, oldMargin: oldSim.netRating,
      newWins: newSim.wins, newMargin: newSim.netRating,
      storedWins: row.wins,
      avgHeight: r1(mean(starters.map((p) => p.height_in))),
    });
  }

  // Fidelity: recomputed-legacy wins vs the stored (play-time) wins.
  const fidGap = scored.map((s) => Math.abs(s.oldWins - s.storedWins));
  console.log(
    `[rerank] fidelity: recomputed-legacy vs stored wins — max |Δ| ${Math.max(0, ...fidGap)}, ` +
      `${fidGap.filter((d) => d !== 0).length}/${scored.length} differ`,
  );

  const oldRanks = ranks(scored.map((s) => ({ wins: s.oldWins, margin: s.oldMargin })));
  const newRanks = ranks(scored.map((s) => ({ wins: s.newWins, margin: s.newMargin })));
  const out = scored.map((s, i) => ({
    ...s,
    winDelta: s.newWins - s.oldWins,
    oldRank: oldRanks[i],
    newRank: newRanks[i],
    rankDelta: newRanks[i] - oldRanks[i], // negative = moved UP the board
  }));

  const deltas = out.map((o) => o.winDelta);
  const down = out.filter((o) => o.winDelta < 0).length;
  const up = out.filter((o) => o.winDelta > 0).length;
  const same = out.filter((o) => o.winDelta === 0).length;

  console.log(`\n========== DAILY LEADERBOARD RE-RANK: legacy → current (${date}) ==========`);
  console.log(`entries scored: ${out.length}${unresolved ? ` (unresolved rosters: ${unresolved})` : ""}`);
  console.log(`projected-win Δ — mean ${r1(mean(deltas))}, median ${median(deltas)}, min ${Math.min(...deltas)}, max ${Math.max(...deltas)}`);
  console.log(`direction: ${down} lost wins, ${same} unchanged, ${up} gained wins`);

  const buckets = new Map<number, number>();
  for (const d of deltas) buckets.set(d, (buckets.get(d) ?? 0) + 1);
  console.log(`\nΔwins histogram:`);
  [...buckets.entries()].sort((a, b) => a[0] - b[0])
    .forEach(([d, n]) => console.log(`  ${d > 0 ? "+" : ""}${d}: ${"█".repeat(n)} ${n}`));

  const rankMoved = out.filter((o) => o.rankDelta !== 0).length;
  console.log(`\nrank changed for ${rankMoved}/${out.length} entries (ties shared).`);
  const fmt = (o: (typeof out)[number]) =>
    `${o.name.padEnd(11)} #${String(o.oldRank).padStart(3)}→#${String(o.newRank).padStart(3)} (${o.rankDelta <= 0 ? "" : "+"}${o.rankDelta})  ${o.oldWins}→${o.newWins}w (${o.winDelta > 0 ? "+" : ""}${o.winDelta})  h=${o.avgHeight}"`;
  console.log(`\nbiggest climbers (gained rank):`);
  [...out].sort((a, b) => a.rankDelta - b.rankDelta).slice(0, 12).forEach((o) => console.log(`  ${fmt(o)}`));
  console.log(`\nbiggest fallers (lost rank):`);
  [...out].sort((a, b) => b.rankDelta - a.rankDelta).slice(0, 12).forEach((o) => console.log(`  ${fmt(o)}`));

  const md =
    `# Daily leaderboard re-rank ${date} (legacy → current)\n\n` +
    `${out.length} entries. mean Δwins ${r1(mean(deltas))}, median ${median(deltas)}; ${down} down / ${same} same / ${up} up. Rank changed for ${rankMoved}.\n\n` +
    `| newRank | oldRank | Δrank | team | avgH | old wins | new wins | Δwins |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n` +
    [...out].sort((a, b) => a.newRank - b.newRank)
      .map((o) => `| ${o.newRank} | ${o.oldRank} | ${o.rankDelta} | ${o.name} | ${o.avgHeight} | ${o.oldWins} | ${o.newWins} | ${o.winDelta} |`)
      .join("\n") + "\n";
  const path = `/tmp/daily-leaderboard-rerank-${date}.md`;
  writeFileSync(path, md);
  console.log(`\n[rerank] full table: ${path}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error("[rerank] FAILED:", e); process.exit(1); });
