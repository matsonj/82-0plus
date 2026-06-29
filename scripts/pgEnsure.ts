// Create the tournament tables + indexes via the canonical app DDL (lib/oltpDb).
// The `tournament` schema must already exist with CREATE/USAGE granted to the app
// role. Run: node --env-file=.env.local --import tsx scripts/pgEnsure.ts
import { ensureSchema, queryRW } from "../lib/oltpDb";

ensureSchema()
  .then(async () => {
    const rows = await queryRW<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'tournament' ORDER BY table_name`,
    );
    console.log("OK — tables in tournament:", rows.map((r) => r.table_name).join(", "));
    process.exit(0);
  })
  .catch((e) => {
    console.error("FAIL:", e.message);
    process.exit(1);
  });
