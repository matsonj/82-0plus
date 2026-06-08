// Load .env.local (and .env) into process.env for one-off dev scripts run under
// `npx tsx`, the same way `next dev` does. Import this FIRST so the DB tokens are
// present before any lib/* module reads process.env — that way tokens never have
// to be pasted inline on the command line (where they'd leak into shell history).
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
