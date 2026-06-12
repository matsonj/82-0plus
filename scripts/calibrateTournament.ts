/**
 * calibrateTournament.ts — a READ-ONLY tournament calibration harness.
 *
 * Replays real + synthetic tournament fields under named candidate configs and
 * ranks them across three targets: regular-season team ratings, tournament
 * conversion, and per-game W/L behavior. It tunes config CONSTANTS only — it
 * never rewrites formulas or changes the player-index / Game-Quality derivation,
 * and it WRITES NOTHING to the database.
 *
 * HOW TO RUN:
 *   npm run calibrate:tournament -- [flags]
 *   npx tsx scripts/calibrateTournament.ts [flags]
 *
 * FLAGS (all optional):
 *   --sample=N       historical anchor brackets to replay (default 600; 0 to skip)
 *   --synthetic=N    synthetic archetype fields to replay (default 96)
 *   --configs=a,b    candidate names to run (default: all)
 *   --seed=KEY       deterministic seed for synthetic generation (default "calib")
 *   --modes=a,b      historical pools to sample (default classic,hoopiq,daily)
 *   --out=DIR        output dir (default /tmp/82-0plus-calibration/<run-id>)
 *   --fixture        smoke mode: no DB / tokens — synthetic-only off a fixed pool
 *
 * Tokens load from .env.local (see ./_env): MOTHERDUCK_TOKEN (player index +
 * norms) and MOTHERDUCK_RW_TOKEN (used READ-ONLY here to SELECT teams/ghosts).
 * --fixture needs neither.
 *
 * Output: <out>/report.md (human) and <out>/metrics.json (machine).
 */

import "./_env"; // loads .env.local before any lib/* reads process.env
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { resolveCandidates, allCandidateNames } from "../lib/calibration/configs";
import { loadHistoricalFields, type QueryFn } from "../lib/calibration/historical";
import { buildSyntheticFields } from "../lib/calibration/synthetic";
import { runCalibration } from "../lib/calibration/run";
import { renderMarkdown, renderJson } from "../lib/calibration/report";
import { fixturePlayerPool, fixtureStatNorms } from "../lib/calibration/fixture";
import type { CalibrationRunOptions, ReplayField } from "../lib/calibration/types";
import type { IndexedPlayer } from "../lib/queries";
import type { StatNorms, TournamentMode } from "../lib/types";

// ── arg parsing ────────────────────────────────────────────────────────────────
function parseArgs(argv: string[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const a of argv) {
    const kv = /^--([^=]+)=(.*)$/.exec(a);
    if (kv) m.set(kv[1], kv[2]);
    else if (a.startsWith("--")) m.set(a.slice(2), "true");
  }
  return m;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function runIdFor(seed: string): string {
  const d = new Date();
  const stamp =
    `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}` +
    `-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
  return `${seed}-${stamp}`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const fixture = args.has("fixture");

  const seed = args.get("seed") ?? "calib";
  const sample = Number(args.get("sample") ?? (fixture ? 0 : 600));
  const synthetic = Number(args.get("synthetic") ?? (fixture ? 8 : 96));
  const modes = (args.get("modes") ?? "classic,hoopiq,daily")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as TournamentMode[];
  const configNames = (args.get("configs") ?? allCandidateNames().join(","))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const runId = runIdFor(seed);
  const outDir = args.get("out") ?? join("/tmp/82-0plus-calibration", runId);

  const options: CalibrationRunOptions = {
    sampleSize: Number.isFinite(sample) ? sample : 600,
    syntheticCount: Number.isFinite(synthetic) ? synthetic : 96,
    seed,
    modes,
    outDir,
    candidates: configNames,
  };

  const candidates = resolveCandidates(configNames);
  console.log(
    `[calibrate] run ${runId} — candidates: ${configNames.join(", ")}` +
      (fixture ? " (FIXTURE smoke mode — no DB)" : ""),
  );

  // ── source the player pool, norms, and historical fields ──
  let pool: IndexedPlayer[];
  let norms: StatNorms;
  let historicalFields: ReplayField[] = [];

  if (fixture) {
    pool = fixturePlayerPool();
    norms = fixtureStatNorms(pool);
    console.log(`[calibrate] fixture pool: ${pool.length} players`);
  } else {
    const { getPlayerIndex } = await import("../lib/queries");
    const { getStatNorms } = await import("../lib/tournamentQueries");
    const { queryRW } = await import("../lib/tournamentDb");

    console.log("[calibrate] loading player index + stat norms…");
    pool = await getPlayerIndex();
    norms = await getStatNorms();
    console.log(`[calibrate] player index: ${pool.length} players`);

    if (options.sampleSize > 0) {
      const q: QueryFn = (sql, params = []) =>
        queryRW(sql, params as Parameters<typeof queryRW>[1]);
      console.log(
        `[calibrate] sampling ${options.sampleSize} historical anchors (${modes.join(", ")})…`,
      );
      const h = await loadHistoricalFields(q, pool, modes, options.sampleSize);
      historicalFields = h.fields;
      console.log(
        `[calibrate] historical: ${h.anchors} anchors → ${h.fields.length} fields (${h.dropped} dropped)`,
      );
    }
  }

  console.log(`[calibrate] building ${options.syntheticCount} synthetic fields…`);
  const syntheticFields = buildSyntheticFields(pool, options.syntheticCount, seed);
  console.log(`[calibrate] synthetic: ${syntheticFields.length} fields`);

  if (historicalFields.length === 0 && syntheticFields.length === 0) {
    throw new Error(
      "no fields to replay — historical sample was empty and synthetic generation produced nothing",
    );
  }

  console.log(`[calibrate] replaying ${candidates.length} candidate(s)…`);
  const report = runCalibration({
    options,
    candidates,
    historicalFields,
    syntheticFields,
    norms,
    runId,
    generatedAt: new Date().toISOString(),
  });

  mkdirSync(outDir, { recursive: true });
  const mdPath = join(outDir, "report.md");
  const jsonPath = join(outDir, "metrics.json");
  writeFileSync(mdPath, renderMarkdown(report));
  writeFileSync(jsonPath, renderJson(report));

  // ── console summary ──
  console.log("\n========== RANKING ==========");
  const ranked = [...report.candidates].sort((a, b) => b.score - a.score);
  for (const [i, m] of ranked.entries()) {
    const g = `${m.guardrails.filter((x) => x.passed).length}/${m.guardrails.length}`;
    console.log(
      `${i + 1}. ${m.candidate.padEnd(26)} score ${m.score.toFixed(3)} ` +
        `(team ${m.subScores.teamRating}, tourney ${m.subScores.tournament}, game ${m.subScores.game}; guardrails ${g})`,
    );
  }
  console.log(`\n[calibrate] report:  ${mdPath}`);
  console.log(`[calibrate] metrics: ${jsonPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[calibrate] FAILED:", err);
    process.exit(1);
  });
