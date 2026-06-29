/**
 * backfillSeedNet.ts — recompute stored `seed_net` under the LIVE config for a
 * single Pacific calendar day, so teams submitted under the old constants are
 * seeded consistently with fresh submissions in future tournaments.
 *
 * WRITES TO THE DB (teams, optionally daily ghosts) — but ONLY with --commit.
 * Without --commit it is a DRY RUN: it reports exactly what would change and
 * writes nothing. Scope is bounded to ONE Pacific day (midnight→midnight
 * America/Los_Angeles, DST-aware) so the blast radius is intentionally small.
 *
 * seed_net is recomputed exactly as the submit flow does:
 *   seedNet = simulateRoster(<five starters>, SCORING_CONFIG).seedNet
 *
 *   npx tsx scripts/backfillSeedNet.ts [--date=YYYY-MM-DD] [--include-ghosts] [--commit]
 *
 *   --date           Pacific calendar day to scope to (default: today, Pacific).
 *   --include-ghosts also recompute that day's DAILY ghosts (ghost_date = date).
 *   --commit         actually UPDATE seed_net (default: dry run, no writes).
 *
 * Tokens load from .env.local (MOTHERDUCK_RW_TOKEN — used for both the SELECT and
 * the UPDATE).
 */
import "./_env";
import { getPlayerIndex } from "../lib/queries";
import { queryRW } from "../lib/oltpDb";
import { simulateRoster } from "../lib/scoring";
import { regWinsFromSeedNet } from "../lib/tier";
import { pacificDate } from "../lib/dailyDate";
import {
  buildPlayerMap,
  buildDebutMap,
  hydrateTeamFromPool,
  type StoredTeamRow,
} from "../lib/calibration/hydrate";

function flag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}
function opt(name: string, dflt: string): string {
  const m = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return m ? m.split("=").slice(1).join("=") : dflt;
}

const date = opt("date", pacificDate());
const includeGhosts = flag("include-ghosts");
const commit = flag("commit");

/** Next Pacific calendar day (calendar arithmetic; DST-agnostic for date math). */
function nextDay(d: string): string {
  const [y, m, dd] = d.split("-").map(Number);
  const nx = new Date(Date.UTC(y, m - 1, dd + 1));
  return `${nx.getUTCFullYear()}-${String(nx.getUTCMonth() + 1).padStart(2, "0")}-${String(nx.getUTCDate()).padStart(2, "0")}`;
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : 0;
};

interface Recompute {
  id: string;
  name: string;
  oldSeed: number;
  newSeed: number;
  oldWins: number;
  newWins: number;
}

async function main() {
  const start = `${date} 00:00:00`;
  const end = `${nextDay(date)} 00:00:00`;
  console.log(
    `[backfill] scope: Pacific day ${date} (${start} → ${end} America/Los_Angeles)`,
  );
  console.log(commit ? `[backfill] MODE: COMMIT (will write seed_net)` : `[backfill] MODE: DRY RUN (no writes)`);

  const pool = await getPlayerIndex();
  const playerMap = buildPlayerMap(pool);
  const debutMap = buildDebutMap(pool);

  // ── teams (Pacific-day window on created_at, all modes) ──
  const teamRows = await queryRW<StoredTeamRow & { team_id: string; name: string }>(
    `SELECT team_id::text AS team_id, team_name AS name,
            roster_json, sixth_json, captain_slot, seed_net
       FROM tournament.teams
      WHERE (created_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Los_Angeles' >= $1
        AND (created_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Los_Angeles' <  $2`,
    [start, end],
  );
  console.log(`[backfill] teams in scope: ${teamRows.length}`);

  const recomputeRows = (
    rows: (StoredTeamRow & { name: string })[],
    idOf: (r: StoredTeamRow & { name: string }) => string,
  ): { changes: Recompute[]; skipped: number } => {
    const changes: Recompute[] = [];
    let skipped = 0;
    for (const row of rows) {
      const team = hydrateTeamFromPool(row, "x", false, playerMap, debutMap);
      if (!team) {
        skipped++;
        continue;
      }
      const oldSeed = Number(row.seed_net ?? NaN);
      const newSeed = simulateRoster(team.starters).seedNet; // default cfg = live
      changes.push({
        id: idOf(row),
        name: row.name,
        oldSeed,
        newSeed,
        oldWins: Number.isFinite(oldSeed) ? regWinsFromSeedNet(oldSeed) : NaN,
        newWins: regWinsFromSeedNet(newSeed),
      });
    }
    return { changes, skipped };
  };

  const report = (label: string, changes: Recompute[], skipped: number) => {
    const moved = changes.filter((c) => Number.isFinite(c.oldSeed) && r2(c.oldSeed) !== r2(c.newSeed));
    const winDeltas = changes
      .filter((c) => Number.isFinite(c.oldWins))
      .map((c) => c.newWins - c.oldWins);
    console.log(`\n── ${label} ──`);
    console.log(`  rows: ${changes.length}${skipped ? ` (skipped ${skipped} unresolvable)` : ""}`);
    console.log(`  seed_net changes: ${moved.length}`);
    if (winDeltas.length) {
      const down = winDeltas.filter((d) => d < 0).length;
      const up = winDeltas.filter((d) => d > 0).length;
      const same = winDeltas.filter((d) => d === 0).length;
      console.log(
        `  projected-win Δ — mean ${r2(mean(winDeltas))}, median ${median(winDeltas)}, ` +
          `min ${Math.min(...winDeltas)}, max ${Math.max(...winDeltas)} (${down} down / ${same} same / ${up} up)`,
      );
    }
    return moved;
  };

  const team = recomputeRows(teamRows, (r) => r.team_id!);
  const teamMoved = report("teams", team.changes, team.skipped);

  // ── daily ghosts for the date (optional) ──
  let ghostMoved: Recompute[] = [];
  if (includeGhosts) {
    const ghostRows = await queryRW<StoredTeamRow & { ghost_id: string; name: string }>(
      `SELECT ghost_id::text AS ghost_id, name, roster_json, sixth_json, seed_net
         FROM tournament.ghosts
        WHERE ghost_type = 'daily' AND ghost_date = $1`,
      [date],
    );
    console.log(`\n[backfill] daily ghosts in scope: ${ghostRows.length}`);
    const g = recomputeRows(ghostRows, (r) => (r as { ghost_id: string }).ghost_id);
    ghostMoved = report("daily ghosts", g.changes, g.skipped);
  }

  // ── write (only with --commit) ──
  if (!commit) {
    console.log(
      `\n[backfill] DRY RUN — nothing written. Re-run with --commit to apply ` +
        `(${teamMoved.length} team + ${ghostMoved.length} ghost seed_net updates).`,
    );
    return;
  }

  console.log(`\n[backfill] COMMITTING ${teamMoved.length} team seed_net updates…`);
  let n = 0;
  for (const c of teamMoved) {
    await queryRW(
      `UPDATE tournament.teams SET seed_net = $1 WHERE team_id::text = $2`,
      [c.newSeed, c.id],
    );
    if (++n % 100 === 0) console.log(`  …${n}/${teamMoved.length}`);
  }
  console.log(`[backfill] teams updated: ${n}`);

  if (includeGhosts) {
    console.log(`[backfill] COMMITTING ${ghostMoved.length} daily-ghost seed_net updates…`);
    let g = 0;
    for (const c of ghostMoved) {
      await queryRW(
        `UPDATE tournament.ghosts SET seed_net = $1 WHERE ghost_id::text = $2`,
        [c.newSeed, c.id],
      );
      g++;
    }
    console.log(`[backfill] daily ghosts updated: ${g}`);
  }
  console.log(`[backfill] done.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[backfill] FAILED:", err);
    process.exit(1);
  });
