/**
 * recomputeDailyResults.ts — recompute the stored daily-challenge results
 * (wins/losses/margin/perfect/box) for one Pacific day under the LIVE config, so
 * the front-page "Rank #N of N" leaderboard is uniformly on the new calc (a
 * mid-day config flip otherwise leaves pre-deploy entries on the old calc).
 *
 * WRITES TO THE DB (daily_results) — but ONLY with --commit. Dry run otherwise.
 *
 * daily_results.roster_json is a DISPLAY roster (name/team/season, no entity_id),
 * so each line is matched back to the player index by (name, team, best_season)
 * to recover full stats, then re-scored exactly as the daily flow does:
 *   simulateRoster(starters) → wins / losses / netRating(margin) / perfect / box
 *
 *   npx tsx scripts/recomputeDailyResults.ts [--date=YYYY-MM-DD] [--commit]
 */
import "./_env";
import { getPlayerIndex, type IndexedPlayer } from "../lib/queries";
import { queryRW } from "../lib/oltpDb";
import { simulateRoster, type ScoringPlayer } from "../lib/scoring";
import { pacificDate } from "../lib/dailyDate";

function flag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}
function opt(name: string, dflt: string): string {
  const m = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return m ? m.split("=").slice(1).join("=") : dflt;
}
const date = opt("date", pacificDate());
const commit = flag("commit");

const r2 = (x: number) => Math.round(x * 100) / 100;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : 0;
};

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
interface ResultRow { user_id: string; wins: number; losses: number; margin: number; perfect: boolean; roster_json: unknown }

async function main() {
  console.log(`[recompute-daily] date ${date} — ${commit ? "COMMIT" : "DRY RUN"}`);
  const pool = await getPlayerIndex();
  const byKey = new Map<string, IndexedPlayer>();
  for (const p of pool) {
    const k = `${p.player_name}|${p.team}|${p.best_season}`;
    if (!byKey.has(k)) byKey.set(k, p);
  }

  const rows = await queryRW<ResultRow>(
    `SELECT user_id, wins, losses, margin, perfect, roster_json
       FROM tournament.daily_results
      WHERE daily_date = $1`,
    [date],
  );
  console.log(`[recompute-daily] ${rows.length} results`);

  const updates: {
    user_id: string;
    wins: number; losses: number; margin: number; perfect: boolean;
    box: Record<string, number>;
    oldWins: number; oldMargin: number;
  }[] = [];
  let unresolved = 0;

  for (const row of rows) {
    const lines = (typeof row.roster_json === "string" ? JSON.parse(row.roster_json) : row.roster_json) as DailyLine[];
    const starters: ScoringPlayer[] = [];
    let ok = true;
    for (const ln of lines) {
      const p = byKey.get(`${ln.name}|${ln.team}|${ln.season}`);
      if (!p) { ok = false; break; }
      starters.push(toScoring(p));
    }
    if (!ok || starters.length !== 5) { unresolved++; continue; }

    const r = simulateRoster(starters); // live config
    const tb = r.teamBox;
    updates.push({
      user_id: row.user_id,
      wins: r.wins, losses: r.losses, margin: r.netRating, perfect: r.perfect,
      box: { pts: tb.pts, reb: tb.reb, ast: tb.ast, stl: tb.stl, blk: tb.blk, fgPct: tb.fgPct, ftPct: tb.ftPct, tov: tb.tov, fg3m: tb.fg3m },
      oldWins: row.wins, oldMargin: row.margin,
    });
  }

  const changed = updates.filter((u) => u.wins !== u.oldWins || r2(u.margin) !== r2(u.oldMargin));
  const winDeltas = updates.map((u) => u.wins - u.oldWins);
  const down = winDeltas.filter((d) => d < 0).length;
  const up = winDeltas.filter((d) => d > 0).length;
  const same = winDeltas.filter((d) => d === 0).length;
  console.log(`\nentries: ${updates.length}${unresolved ? ` (unresolved ${unresolved})` : ""}`);
  console.log(`changed (wins or margin): ${changed.length}`);
  console.log(`win Δ — mean ${r2(mean(winDeltas))}, median ${median(winDeltas)}, min ${Math.min(...winDeltas)}, max ${Math.max(...winDeltas)} (${down} down / ${same} same / ${up} up)`);

  if (!commit) {
    console.log(`\n[recompute-daily] DRY RUN — nothing written. Re-run with --commit to update ${changed.length} rows.`);
    return;
  }

  console.log(`\n[recompute-daily] COMMITTING ${changed.length} updates…`);
  let n = 0;
  for (const u of changed) {
    await queryRW(
      `UPDATE tournament.daily_results
          SET wins=$1, losses=$2, margin=$3, perfect=$4, box_json=$5
        WHERE user_id=$6 AND daily_date=$7`,
      [u.wins, u.losses, u.margin, u.perfect, JSON.stringify(u.box), u.user_id, date],
    );
    if (++n % 50 === 0) console.log(`  …${n}/${changed.length}`);
  }
  console.log(`[recompute-daily] updated: ${n}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error("[recompute-daily] FAILED:", e); process.exit(1); });
