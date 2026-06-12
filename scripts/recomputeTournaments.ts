/**
 * recomputeTournaments.ts — re-simulate the memorialized tournament brackets for
 * teams submitted on one Pacific day, under the LIVE config, and rewrite their
 * stored results (record_w/l, realized_margin, reached_round, champion_name,
 * bracket_json). Used after a scoring/tournament config change so today's
 * recorded results match what the live engine would now produce.
 *
 * WRITES TO THE DB (teams) — but ONLY with --commit. Dry run otherwise.
 *
 * For each team in scope it reconstructs the ORIGINAL field from the stored
 * bracket_json.teams ids, re-hydrates every member from teams/ghosts, recomputes
 * each member's seed_net under the live config, re-runs simulateBracket with the
 * owner's team_id as the seed key (as the submit flow does), then re-derives the
 * owner's record. Rewrites recorded history for that day — scope it deliberately.
 *
 *   npx tsx scripts/recomputeTournaments.ts [--date=YYYY-MM-DD] [--commit]
 */
import "./_env";
import { getPlayerIndex } from "../lib/queries";
import { getStatNorms } from "../lib/tournamentQueries";
import { queryRW } from "../lib/tournamentDb";
import { simulateRoster } from "../lib/scoring";
import {
  simulateBracket,
  TOURNAMENT_CONFIG,
  type TournamentTeam,
  type BracketSize,
} from "../lib/tournament";
import { deriveRecord } from "../lib/tournamentRun";
import { pacificDate } from "../lib/dailyDate";
import type { BracketPlayer } from "../lib/types";
import {
  buildPlayerMap,
  buildDebutMap,
  hydrateTeamFromPool,
  parseJson,
  type StoredTeamRow,
} from "../lib/calibration/hydrate";
import type { HydratedTeam } from "../lib/calibration/types";
import { parseAnchorRow } from "../lib/calibration/historical";

function flag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}
function opt(name: string, dflt: string): string {
  const m = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return m ? m.split("=").slice(1).join("=") : dflt;
}
const date = opt("date", pacificDate());
const commit = flag("commit");

function nextDay(d: string): string {
  const [y, m, dd] = d.split("-").map(Number);
  const nx = new Date(Date.UTC(y, m - 1, dd + 1));
  return `${nx.getUTCFullYear()}-${String(nx.getUTCMonth() + 1).padStart(2, "0")}-${String(nx.getUTCDate()).padStart(2, "0")}`;
}
const stripPrefix = (id: string) => (id.startsWith("team:") ? id.slice(5) : id.startsWith("ghost:") ? id.slice(6) : id);
const chunk = <T,>(a: T[], n: number) => { const o: T[][] = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

const toBP = (m: HydratedTeam["sixthMeta"]): BracketPlayer => ({ name: m.name, team: m.team, season: m.season });
function toTournamentTeam(team: HydratedTeam, seedNet: number): TournamentTeam {
  const roster = team.starterMeta.map((m, i) => (i === team.captainSlot ? { ...toBP(m), captain: true } : toBP(m)));
  return {
    id: team.id, name: team.name, isGhost: team.isGhost,
    starters: team.starters, sixthMan: team.sixthMan, captainSlot: team.captainSlot,
    ageAtPeak: team.ageAtPeak, sixthManAge: team.sixthManAge, seedNet,
    roster, sixthManInfo: toBP(team.sixthMeta),
  };
}

interface AnchorRow {
  team_id: string; mode: string; bracket_json: unknown;
  record_w: number; record_l: number; reached_round: number; champion_name: string; realized_margin: number;
}

async function main() {
  console.log(`[recompute-tourneys] date ${date} — ${commit ? "COMMIT" : "DRY RUN"}`);
  const pool = await getPlayerIndex();
  const playerMap = buildPlayerMap(pool);
  const debutMap = buildDebutMap(pool);
  const norms = await getStatNorms();

  const start = `${date} 00:00:00`, end = `${nextDay(date)} 00:00:00`;
  const anchors = await queryRW<AnchorRow>(
    `SELECT CAST(team_id AS VARCHAR) AS team_id, mode, bracket_json,
            record_w, record_l, reached_round, champion_name, realized_margin
       FROM nba_tournament.main.teams
      WHERE (created_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Los_Angeles' >= $1
        AND (created_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Los_Angeles' <  $2`,
    [start, end],
  );
  console.log(`[recompute-tourneys] teams in scope: ${anchors.length}`);

  // Parse each anchor's stored field; collect all referenced member ids.
  const specs = anchors
    .map((a) => ({ a, spec: parseAnchorRow({ team_id: a.team_id, mode: a.mode, bracket_json: a.bracket_json }) }))
    .filter((x) => x.spec) as { a: AnchorRow; spec: NonNullable<ReturnType<typeof parseAnchorRow>> }[];

  const teamIds = new Set<string>(), ghostIds = new Set<string>();
  for (const { spec } of specs) for (const id of spec.teamIds) {
    if (id.startsWith("team:")) teamIds.add(stripPrefix(id));
    else if (id.startsWith("ghost:")) ghostIds.add(stripPrefix(id));
  }
  console.log(`[recompute-tourneys] referenced members: ${teamIds.size} teams, ${ghostIds.size} ghosts`);

  // Hydrate every referenced member once, recompute seed_net under the live config.
  const ttById = new Map<string, TournamentTeam>();
  const hydrateBatch = async (ids: string[], table: "teams" | "ghosts") => {
    for (const part of chunk(ids, 400)) {
      if (!part.length) continue;
      const ph = part.map((_, i) => `$${i + 1}`).join(",");
      const sql = table === "teams"
        ? `SELECT CAST(team_id AS VARCHAR) AS team_id, team_name AS name, roster_json, sixth_json, captain_slot, seed_net
             FROM nba_tournament.main.teams WHERE CAST(team_id AS VARCHAR) IN (${ph})`
        : `SELECT CAST(ghost_id AS VARCHAR) AS ghost_id, name, roster_json, sixth_json, seed_net
             FROM nba_tournament.main.ghosts WHERE CAST(ghost_id AS VARCHAR) IN (${ph})`;
      const rows = await queryRW<StoredTeamRow & { team_id?: string; ghost_id?: string }>(sql, part);
      for (const row of rows) {
        const bare = table === "teams" ? row.team_id! : String(row.ghost_id);
        const id = table === "teams" ? `team:${bare}` : `ghost:${bare}`;
        const h = hydrateTeamFromPool(row, id, table === "ghosts", playerMap, debutMap);
        if (h) ttById.set(id, toTournamentTeam(h, simulateRoster(h.starters).seedNet));
      }
    }
  };
  await hydrateBatch([...teamIds], "teams");
  await hydrateBatch([...ghostIds], "ghosts");

  // Replay each anchor's field; derive the owner's new record.
  const updates: { id: string; rw: number; rl: number; rm: number; rr: number; champ: string; bracket: unknown; a: AnchorRow }[] = [];
  let skipped = 0;
  for (const { a, spec } of specs) {
    const field = spec.teamIds.map((id) => ttById.get(id));
    if (field.some((t) => !t)) { skipped++; continue; }
    const bracket = simulateBracket(field as TournamentTeam[], a.team_id, norms, TOURNAMENT_CONFIG, spec.size as BracketSize);
    const rec = deriveRecord(bracket, `team:${a.team_id}`);
    updates.push({
      id: a.team_id, rw: rec.recordW, rl: rec.recordL, rm: rec.realizedMargin, rr: rec.reachedRound,
      champ: bracket.championName, bracket, a,
    });
  }

  const roundChanged = updates.filter((u) => u.rr !== u.a.reached_round).length;
  const champChanged = updates.filter((u) => u.champ !== u.a.champion_name).length;
  const recChanged = updates.filter((u) => u.rw !== u.a.record_w || u.rl !== u.a.record_l).length;
  console.log(`\nreplayed: ${updates.length}${skipped ? ` (skipped ${skipped} unresolvable fields)` : ""}`);
  console.log(`changed — reached_round: ${roundChanged}, champion_name: ${champChanged}, W/L record: ${recChanged}`);

  if (!commit) {
    console.log(`\n[recompute-tourneys] DRY RUN — nothing written. Re-run with --commit to rewrite ${updates.length} brackets.`);
    return;
  }

  console.log(`\n[recompute-tourneys] COMMITTING ${updates.length} bracket rewrites…`);
  let n = 0;
  for (const u of updates) {
    await queryRW(
      `UPDATE nba_tournament.main.teams
          SET record_w=$1, record_l=$2, realized_margin=$3, reached_round=$4, champion_name=$5, bracket_json=$6
        WHERE CAST(team_id AS VARCHAR)=$7`,
      [u.rw, u.rl, u.rm, u.rr, u.champ, JSON.stringify(u.bracket), u.id],
    );
    if (++n % 100 === 0) console.log(`  …${n}/${updates.length}`);
  }
  console.log(`[recompute-tourneys] updated: ${n}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error("[recompute-tourneys] FAILED:", e); process.exit(1); });
