/**
 * cleanupStalePublicEntries.ts — one-time backfill for the public-tournament
 * 10-minute completion timeout. Removes entries that were stuck BEFORE the feature
 * shipped: registered/partial entries on OPEN PUBLIC tournaments whose 10-minute
 * window has already elapsed. Freeing their slots lets real players join and lets
 * the field finalize honestly.
 *
 * After the feature deploys this purge happens lazily (on register / lobby view);
 * this script just clears the pre-existing backlog immediately, including for
 * tournaments nobody has re-opened yet.
 *
 * WRITES TO THE DB (tournament.private_entries) — but ONLY with --commit. Dry run
 * otherwise (prints exactly what WOULD be deleted, grouped by tournament).
 *
 *   npx tsx scripts/cleanupStalePublicEntries.ts            # dry run (no writes)
 *   npx tsx scripts/cleanupStalePublicEntries.ts --commit   # actually delete
 *
 * NEVER touches: submitted / bot_replaced entries, private tournaments, completed
 * tournaments, or incomplete entries still inside their 10-minute window. Uses the
 * SAME window constant (ENTRY_COMPLETION_MINUTES) as the live feature, so it can be
 * re-run safely at any time and stays in lockstep with the app.
 */
import "./_env";
import { queryRW } from "../lib/oltpDb";
import { ENTRY_COMPLETION_MINUTES } from "../lib/privateTournament";

const commit = process.argv.includes("--commit");

// The exact predicate the live purge uses, scoped to OPEN PUBLIC tournaments.
const STALE_PREDICATE = `t.is_public = true
      AND t.status = 'open'
      AND e.status IN ('registered', 'partial')
      AND e.created_at < now() - interval '${ENTRY_COMPLETION_MINUTES} minutes'`;

interface PreviewRow {
  tournament_id: string;
  name: string;
  size: number;
  total: number;
  locked: number;
  stale: number;
  active_incomplete: number;
}

async function main() {
  // ---- Preview: every open public tournament, with what would be removed. ----
  const preview = await queryRW<PreviewRow>(
    `SELECT t.tournament_id,
            t.name,
            t.size,
            count(e.entry_id)::int AS total,
            count(e.entry_id) FILTER (
              WHERE e.status IN ('submitted', 'bot_replaced')
            )::int AS locked,
            count(e.entry_id) FILTER (
              WHERE e.status IN ('registered', 'partial')
                AND e.created_at < now() - interval '${ENTRY_COMPLETION_MINUTES} minutes'
            )::int AS stale,
            count(e.entry_id) FILTER (
              WHERE e.status IN ('registered', 'partial')
                AND e.created_at >= now() - interval '${ENTRY_COMPLETION_MINUTES} minutes'
            )::int AS active_incomplete
       FROM tournament.private_tournaments t
       LEFT JOIN tournament.private_entries e ON e.tournament_id = t.tournament_id
      WHERE t.is_public = true AND t.status = 'open'
      GROUP BY t.tournament_id, t.name, t.size
      ORDER BY stale DESC, t.name`,
  );

  const affected = preview.filter((r) => r.stale > 0);
  const totalStale = affected.reduce((n, r) => n + r.stale, 0);

  console.log(
    `\nOpen public tournaments: ${preview.length} · with stale incomplete entries: ${affected.length} · stale entries to remove: ${totalStale}\n`,
  );
  console.log(
    `(stale = registered/partial older than ${ENTRY_COMPLETION_MINUTES} min; locked = submitted/bot_replaced kept; active = incomplete still inside the window, kept)\n`,
  );
  for (const r of affected) {
    console.log(
      `  ${r.name}  [${r.tournament_id}]  size ${r.size} · total ${r.total} · locked ${r.locked} · active ${r.active_incomplete} · REMOVE ${r.stale}  →  ${r.locked + r.active_incomplete}/${r.size} after`,
    );
  }
  if (affected.length === 0) {
    console.log("  Nothing to clean up. ✅");
    return;
  }

  if (!commit) {
    console.log(
      `\nDRY RUN — no rows deleted. Re-run with --commit to remove the ${totalStale} stale entr${totalStale === 1 ? "y" : "ies"}.\n`,
    );
    return;
  }

  // ---- Commit: delete the stale incomplete entries. ----
  const deleted = await queryRW<{ entry_id: string }>(
    `DELETE FROM tournament.private_entries e
       USING tournament.private_tournaments t
      WHERE e.tournament_id = t.tournament_id
        AND ${STALE_PREDICATE}
      RETURNING e.entry_id`,
  );
  console.log(`\n✅ Deleted ${deleted.length} stale incomplete entr${deleted.length === 1 ? "y" : "ies"}.\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("cleanupStalePublicEntries failed:", err);
    process.exit(1);
  });
