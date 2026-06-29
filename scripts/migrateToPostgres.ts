/**
 * One-time migration: MotherDuck `nba_tournament` → PlanetScale Postgres.
 *
 *   node --env-file=.env.local --import tsx scripts/migrateToPostgres.ts
 *
 * Needs DATABASE_URL (Postgres, a role that can CREATE/TRUNCATE the `tournament`
 * schema) and MOTHERDUCK_RW_TOKEN (reads the source tables on MotherDuck). It:
 *   1. creates the `tournament` schema + tables + indexes (lib/oltpDb.ensureSchema),
 *   2. TRUNCATEs each target and copies every row (re-runnable; preserves ids +
 *      timestamps), paging the large `teams` table to bound memory,
 *   3. verifies row-count parity between the two stores.
 *
 * Alternative server-side copy (no local streaming) once the schema exists — run on
 * MotherDuck:  ATTACH '<postgres-uri>' AS pg (TYPE postgres);
 *              INSERT INTO pg.tournament.<t> BY NAME SELECT * FROM nba_tournament.main.<t>;
 */
import { queryRW as queryMD } from "../lib/tournamentDb"; // MotherDuck RW pool (source)
import { ensureSchema, queryRW as queryPG } from "../lib/oltpDb"; // Postgres (target)

const SRC = "nba_tournament.main";

/** Per-table column lists (explicit, so MotherDuck physical column order is
 *  irrelevant), the jsonb columns (stringified if they arrive parsed), and an
 *  optional text key used to keyset-page a large table. */
const TABLES: Record<
  string,
  { cols: string[]; jsonb: string[]; pageKey?: string }
> = {
  users: {
    cols: ["user_id", "name", "name_norm", "pin_hash", "pin_salt", "created_at"],
    jsonb: [],
  },
  ghosts: {
    cols: ["ghost_id", "name", "roster_json", "sixth_json", "seed_net", "ghost_type", "ghost_date"],
    jsonb: ["roster_json", "sixth_json"],
  },
  daily_results: {
    cols: ["user_id", "daily_date", "wins", "losses", "margin", "perfect", "box_json", "roster_json", "created_at"],
    jsonb: ["box_json", "roster_json"],
  },
  private_tournaments: {
    cols: ["tournament_id", "name", "name_norm", "pin_hash", "pin_salt", "admin_user_id", "admin_name", "mode", "size", "board_mode", "board_json", "status", "created_at", "expires_at", "finalized_at", "final_bracket_json", "champion_name"],
    jsonb: ["board_json", "final_bracket_json"],
  },
  private_entries: {
    cols: ["entry_id", "tournament_id", "user_id", "user_name", "team_name", "status", "roster_json", "sixth_json", "roster_display", "captain_slot", "seed_net", "reg_w", "reg_l", "team_box_json", "provisional_record_w", "provisional_record_l", "provisional_status", "final_record_w", "final_record_l", "final_status", "final_realized_margin", "final_reached_round", "viewed_final_at", "created_at", "submitted_at"],
    jsonb: ["roster_json", "sixth_json", "roster_display", "team_box_json"],
  },
  // teams is the large table (~925 MB, mostly bracket_json) — keyset-paged by team_id.
  teams: {
    cols: ["team_id", "user_id", "team_name", "mode", "daily_date", "roster_json", "sixth_json", "roster_display", "captain_slot", "seed_net", "record_w", "record_l", "realized_margin", "reached_round", "champion_name", "bracket_json", "team_box_json", "created_at"],
    jsonb: ["roster_json", "sixth_json", "roster_display", "bracket_json", "team_box_json"],
    pageKey: "team_id",
  },
};

const PAGE = 500;

function bindValues(
  row: Record<string, unknown>,
  cfg: { cols: string[]; jsonb: string[] },
): unknown[] {
  return cfg.cols.map((c) => {
    const v = row[c];
    // jsonb columns arrive from the MotherDuck pg endpoint as JSON strings (insert
    // as-is, Postgres casts text→jsonb) — but stringify defensively if parsed.
    if (v != null && cfg.jsonb.includes(c) && typeof v !== "string") {
      return JSON.stringify(v);
    }
    return v;
  });
}

async function insertRows(table: string, cfg: { cols: string[]; jsonb: string[] }, rows: Record<string, unknown>[]) {
  const colList = cfg.cols.join(", ");
  const ph = cfg.cols.map((_, i) => `$${i + 1}`).join(", ");
  for (const row of rows) {
    await queryPG(
      `INSERT INTO tournament.${table} (${colList}) VALUES (${ph}) ON CONFLICT DO NOTHING`,
      bindValues(row, cfg) as never,
    );
  }
}

async function copyTable(table: string): Promise<number> {
  const cfg = TABLES[table];
  const select = cfg.cols.join(", ");
  await queryPG(`TRUNCATE tournament.${table}`);

  if (!cfg.pageKey) {
    const rows = await queryMD<Record<string, unknown>>(`SELECT ${select} FROM ${SRC}.${table}`);
    await insertRows(table, cfg, rows);
    return rows.length;
  }

  // Keyset pagination on a stable text key (bounds memory for the big table).
  const key = cfg.pageKey;
  let last: string | null = null;
  let total = 0;
  for (;;) {
    const where: string = last !== null ? `WHERE CAST(${key} AS VARCHAR) > $1` : "";
    const params: string[] = last !== null ? [last] : [];
    const rows: Record<string, unknown>[] = await queryMD<Record<string, unknown>>(
      `SELECT ${select} FROM ${SRC}.${table} ${where}
       ORDER BY CAST(${key} AS VARCHAR) LIMIT ${PAGE}`,
      params,
    );
    if (rows.length === 0) break;
    await insertRows(table, cfg, rows);
    total += rows.length;
    last = String(rows[rows.length - 1][key]);
    process.stdout.write(`\r  ${table}: ${total} rows…`);
    if (rows.length < PAGE) break;
  }
  process.stdout.write("\n");
  return total;
}

async function main() {
  console.log("[migrate] creating Postgres schema…");
  await ensureSchema();

  console.log("[migrate] copying tables (MotherDuck → Postgres)…");
  const order = ["users", "teams", "ghosts", "daily_results", "private_tournaments", "private_entries"];
  for (const t of order) {
    const n = await copyTable(t);
    console.log(`  copied tournament.${t}: ${n}`);
  }

  console.log("[migrate] verifying row-count parity…");
  let ok = true;
  for (const t of order) {
    const [{ n: src }] = await queryMD<{ n: number }>(`SELECT count(*)::bigint AS n FROM ${SRC}.${t}`);
    const [{ n: dst }] = await queryPG<{ n: number }>(`SELECT count(*)::int AS n FROM tournament.${t}`);
    const mark = Number(src) === Number(dst) ? "✓" : "✗ MISMATCH";
    if (Number(src) !== Number(dst)) ok = false;
    console.log(`  ${t}: MotherDuck=${src} Postgres=${dst} ${mark}`);
  }
  if (!ok) throw new Error("row-count parity check failed");
  console.log("[migrate] done — parity verified.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n[migrate] FAILED:", err);
    process.exit(1);
  });
