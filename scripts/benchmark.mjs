#!/usr/bin/env node
/**
 * benchmark.mjs — compare two running deployments of this app across the
 * request-heavy board-load flows (free draft, daily board, authenticated daily
 * start, private-tournament register).
 *
 * Standalone Node script — no build, no deps beyond Node built-ins + global
 * fetch. It drives the PUBLIC HTTP API of two servers and reports, per flow:
 *   - API call count          (round-trips eliminated)
 *   - median wall-clock ms    (real latency, network included)
 *   - response bytes          (payload moved)
 *   - endpoint counts         (which routes each branch hit)
 *   - raw per-run JSON
 *
 * ─ MODES ────────────────────────────────────────────────────────────────────
 *   BENCH_MODE=bundled (default)
 *     MAIN_URL runs the OLD request pattern (separate /api/players calls);
 *     PR_URL runs the NEW bundled pattern (rosters folded into the parent
 *     response via ?includePlayers=1, /api/daily/start, bundled register).
 *     Use for the request-bundling PR — measures call-count + latency.
 *
 *   BENCH_MODE=mirror
 *     BOTH URLs run the SAME (old) request pattern. Call counts are identical;
 *     only latency/bytes differ. Use for query-speed PRs that do NOT change the
 *     request shape (e.g. cache materialization) — measures latency only.
 *
 * ─ HOW TO RUN ───────────────────────────────────────────────────────────────
 *   Local (two prod servers — see docs/benchmarking.md for the worktree setup):
 *     MAIN_URL=http://127.0.0.1:4100 PR_URL=http://127.0.0.1:4101 \
 *       node scripts/benchmark.mjs | tee bench-local.txt
 *
 *   Deployed (prod alias vs a protected preview):
 *     MAIN_URL=https://<prod-alias> PR_URL=https://<preview> \
 *     VERCEL_PROTECTION_BYPASS=<secret> \
 *       node scripts/benchmark.mjs | tee bench-deployed.txt
 *   See docs/benchmarking.md for the full deployed runbook (deploy a preview,
 *   warm the cache, mint a protection-bypass secret, run, tear down).
 *
 * ─ ENV VARS ─────────────────────────────────────────────────────────────────
 *   MAIN_URL   baseline server         (default http://127.0.0.1:4100)
 *   PR_URL     candidate server        (default http://127.0.0.1:4101)
 *   BENCH_MODE bundled | mirror        (default bundled)
 *   RUNS       read-flow repetitions   (default 5)
 *   AUTH_RUNS  write-flow repetitions  (default 0 — OFF). Read flows never
 *              mutate. Write flows create benchmark users in nba_tournament on
 *              BOTH targets (private tournaments auto-delete; a few DLY*
 *              daily_results rows persist). Refused against a prod-looking host
 *              unless ALLOW_PROD_WRITES=1.
 *   ALLOW_PROD_WRITES  set to 1 to permit write flows against a prod-looking URL.
 *   VERCEL_PROTECTION_BYPASS  if set, sent as the x-vercel-protection-bypass
 *              header on every request so a protected Vercel preview is reachable
 *              (harmless against a public production alias).
 *
 * Each iteration measures main vs pr in RANDOMIZED order, so warmup can't
 * systematically favor whichever branch is always measured second.
 *
 * NOTE: with AUTH_RUNS>0, both servers must point at a MotherDuck account where
 * `nba_tournament` is WRITABLE (the write flows run CREATE/INSERT).
 * TOURNAMENT_SECRET must be set on each server (required in production mode).
 */

import { performance } from "node:perf_hooks";

const BASES = {
  main: process.env.MAIN_URL ?? "http://127.0.0.1:4100",
  pr: process.env.PR_URL ?? "http://127.0.0.1:4101",
};

const MODE = process.env.BENCH_MODE ?? "bundled";
if (MODE !== "bundled" && MODE !== "mirror") {
  throw new Error(`BENCH_MODE must be "bundled" or "mirror" (got "${MODE}")`);
}

const RUNS = Number(process.env.RUNS ?? "5");
// Write flows are OFF by default: read flows tell the main story and never
// mutate, while write flows create benchmark users/tournaments in nba_tournament.
const AUTH_RUNS = Number(process.env.AUTH_RUNS ?? "0");

// Guard: write flows (AUTH_RUNS>0) create benchmark users + tournaments in
// nba_tournament on BOTH targets (private tournaments auto-delete; a few DLY*
// daily_results rows persist — the app exposes no delete for them). Refuse to do
// that against a production-looking host unless explicitly allowed.
const looksProd = (u) => /82-0plus\.vercel\.app/i.test(u) || /(^|[./])prod\b/i.test(u);
if (AUTH_RUNS > 0 && !process.env.ALLOW_PROD_WRITES) {
  for (const [name, url] of Object.entries(BASES)) {
    if (looksProd(url)) {
      throw new Error(
        `Refusing write flows (AUTH_RUNS=${AUTH_RUNS}) against ${name.toUpperCase()}_URL=${url}: ` +
          `they create benchmark users in nba_tournament (DLY* rows persist). Point the ` +
          `baseline at a non-prod preview, or set ALLOW_PROD_WRITES=1 to override.`,
      );
    }
  }
}

const DECADES = [2020, 2010, 2000, 1990, 1980];
const MANUAL_SLOTS = [
  { team: "BOS", decade: 1980 },
  { team: "CHI", decade: 1990 },
  { team: "LAL", decade: 2000 },
  { team: "MIA", decade: 2010 },
  { team: "GSW", decade: 2010 },
  { team: "SAS", decade: 2000 },
];

// If a Vercel protection-bypass secret is provided, attach it to every request
// so a protected preview deployment is reachable. Harmless on a public prod
// alias (an unrecognized header is ignored). Header-only — we deliberately do
// NOT send x-vercel-set-bypass-cookie, which triggers a redirect that loops
// under fetch's auto-follow.
const BYPASS = process.env.VERCEL_PROTECTION_BYPASS;
if (BYPASS) {
  const orig = globalThis.fetch;
  globalThis.fetch = (input, init = {}) => {
    const headers = new Headers(init.headers || {});
    headers.set("x-vercel-protection-bypass", BYPASS);
    return orig(input, { ...init, headers });
  };
}

function todayPacific() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function getSetCookies(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const raw = headers.get("set-cookie");
  if (!raw) return [];
  return raw.split(/,(?=\s*[^;,=]+=[^;,]+)/);
}

class Client {
  constructor(base, branch) {
    this.base = base;
    this.branch = branch;
    this.jar = new Map();
    this.requests = [];
  }

  clear() {
    this.requests = [];
  }

  cookieHeader() {
    return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  async request(method, path, body) {
    const headers = {};
    const cookie = this.cookieHeader();
    if (cookie) headers.cookie = cookie;

    let payload;
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }

    const started = performance.now();
    const res = await fetch(`${this.base}${path}`, { method, headers, body: payload });
    const text = await res.text();
    const ms = performance.now() - started;

    for (const cookieText of getSetCookies(res.headers)) {
      const pair = cookieText.split(";")[0];
      const eq = pair.indexOf("=");
      if (eq > 0) this.jar.set(pair.slice(0, eq), pair.slice(eq + 1));
    }

    this.requests.push({
      method,
      path,
      status: res.status,
      ok: res.ok,
      ms,
      bytes: Buffer.byteLength(text),
    });

    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (!res.ok) {
      throw new Error(`${this.branch} ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
    }
    return json;
  }

  get(path) {
    return this.request("GET", path);
  }

  post(path, body) {
    return this.request("POST", path, body);
  }
}

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function pctReduction(before, after) {
  return ((before - after) / before) * 100;
}

function endpointCounts(requests) {
  const out = {};
  for (const r of requests.filter((req) => req.path.startsWith("/api/"))) {
    const endpoint = r.path.split("?")[0];
    out[endpoint] = (out[endpoint] ?? 0) + 1;
  }
  return out;
}

async function measure(flow, client, fn) {
  client.clear();
  const started = performance.now();
  const extra = await fn(client);
  const totalMs = performance.now() - started;
  const apiRequests = client.requests.filter((r) => r.path.startsWith("/api/"));
  return {
    flow,
    branch: client.branch,
    requestCount: apiRequests.length,
    totalMs,
    totalBytes: apiRequests.reduce((sum, r) => sum + r.bytes, 0),
    endpointCounts: endpointCounts(apiRequests),
    maxRequestMs: Math.max(...apiRequests.map((r) => r.ms)),
    ...extra,
  };
}

async function freeFiveOld(client) {
  await client.get("/api/decades");
  const excludes = [];
  let playerRows = 0;

  for (const decade of DECADES) {
    const exclude = excludes.length ? `&exclude=${excludes.join(",")}` : "";
    const slot = await client.get(`/api/slot?decade=${decade}${exclude}`);
    excludes.push(slot.team);
    const roster = await client.get(
      `/api/players?team=${slot.team}&decade=${slot.decade}&mode=classic`,
    );
    playerRows += roster.players?.length ?? 0;
  }

  return { playerRows };
}

async function freeFiveNew(client) {
  await client.get("/api/decades");
  const excludes = [];
  let playerRows = 0;

  for (const decade of DECADES) {
    const exclude = excludes.length ? `&exclude=${excludes.join(",")}` : "";
    const slot = await client.get(
      `/api/slot?decade=${decade}${exclude}&includePlayers=1&mode=classic`,
    );
    excludes.push(slot.team);
    playerRows += slot.players?.length ?? 0;
  }

  return { playerRows };
}

async function dailyBoardOld(client) {
  const daily = await client.get("/api/daily");
  const sources = [...daily.slots, ...(daily.benchSlot ? [daily.benchSlot] : [])];
  let playerRows = 0;

  for (const source of sources) {
    const roster = await client.get(
      `/api/players?team=${source.team}&decade=${source.decade}&mode=hoopiq`,
    );
    playerRows += roster.players?.length ?? 0;
  }

  return { sources: sources.length, playerRows };
}

async function dailyBoardNew(client) {
  const daily = await client.get("/api/daily?includePlayers=1&mode=hoopiq");
  const rosters = Object.values(daily.rosters ?? {});
  return {
    sources: rosters.length,
    playerRows: rosters.reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0),
  };
}

async function dailyStartOld(client, suffix) {
  const date = todayPacific();
  const name = `DLYM${suffix}`.slice(0, 16);
  const pin = "2468";
  const gate = await client.post("/api/daily/result", { name, pin, date });
  if (gate.result) throw new Error("benchmark daily user unexpectedly has a result");

  const daily = await client.get(`/api/daily?date=${date}`);
  const sources = [...daily.slots, ...(daily.benchSlot ? [daily.benchSlot] : [])];
  let playerRows = 0;

  for (const source of sources) {
    const roster = await client.get(
      `/api/players?team=${source.team}&decade=${source.decade}&mode=hoopiq`,
    );
    playerRows += roster.players?.length ?? 0;
  }

  return { sources: sources.length, playerRows };
}

async function dailyStartNew(client, suffix) {
  const date = todayPacific();
  const name = `DLYP${suffix}`.slice(0, 16);
  const pin = "2468";
  const start = await client.post("/api/daily/start", { name, pin, date });
  if (start.status !== "open") throw new Error(`daily start returned ${start.status}`);

  const rosters = Object.values(start.rosters ?? {});
  return {
    sources: rosters.length,
    playerRows: rosters.reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0),
  };
}

async function createPrivate(client, suffix) {
  const body = {
    adminName: `ADM${suffix}`.slice(0, 16),
    adminPin: "1357",
    name: `TOUR${suffix}`.slice(0, 24),
    pin: "8642",
    mode: "classic",
    size: 4,
    boardMode: "manual",
    manualSlots: MANUAL_SLOTS,
  };
  const created = await client.post("/api/private-tournament/create", body);
  return { ...body, tournamentId: created.tournamentId };
}

async function deletePrivate(client, setup) {
  await client.post("/api/private-tournament/delete", {
    adminName: setup.adminName,
    adminPin: setup.adminPin,
    tournamentId: setup.tournamentId,
  });
}

async function privateRegisterOld(client, suffix) {
  const setup = await createPrivate(client, `M${suffix}`);
  client.clear();

  try {
    const reg = await client.post("/api/private-tournament/register", {
      name: `ENTM${suffix}`.slice(0, 16),
      pin: "9753",
      tournamentId: setup.tournamentId,
    });
    const sources = [...reg.board.slots, reg.board.benchSlot];
    let playerRows = 0;
    for (const source of sources) {
      const roster = await client.get(
        `/api/players?team=${source.team}&decade=${source.decade}&mode=${reg.mode}`,
      );
      playerRows += roster.players?.length ?? 0;
    }
    return { sources: sources.length, playerRows };
  } finally {
    const measured = client.requests.slice();
    client.clear();
    await deletePrivate(client, setup);
    client.requests = measured;
  }
}

async function privateRegisterNew(client, suffix) {
  const setup = await createPrivate(client, `P${suffix}`);
  client.clear();

  try {
    const reg = await client.post("/api/private-tournament/register", {
      name: `ENTP${suffix}`.slice(0, 16),
      pin: "9753",
      tournamentId: setup.tournamentId,
    });
    const rosters = Object.values(reg.rosters ?? {});
    return {
      sources: rosters.length,
      playerRows: rosters.reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0),
    };
  } finally {
    const measured = client.requests.slice();
    client.clear();
    await deletePrivate(client, setup);
    client.requests = measured;
  }
}

// Per-mode flow selection. `mirror` runs the OLD (identical) pattern against
// both servers so latency is the only variable; `bundled` pits OLD vs NEW.
const PR_FLOWS =
  MODE === "mirror"
    ? {
        free: freeFiveOld,
        daily: dailyBoardOld,
        dailyStart: dailyStartOld,
        privateRegister: privateRegisterOld,
      }
    : {
        free: freeFiveNew,
        daily: dailyBoardNew,
        dailyStart: dailyStartNew,
        privateRegister: privateRegisterNew,
      };

async function run() {
  const mainWarm = new Client(BASES.main, "main");
  const prWarm = new Client(BASES.pr, "pr");
  await Promise.all([
    mainWarm.get("/api/decades"),
    prWarm.get("/api/decades"),
    mainWarm.get("/api/daily"),
    MODE === "mirror"
      ? prWarm.get("/api/daily")
      : prWarm.get("/api/daily?includePlayers=1&mode=hoopiq"),
  ]);

  // Measure the main + pr halves of one flow in RANDOMIZED order each iteration,
  // so a systematic warmup advantage (shared backend caches, connection reuse,
  // cold start) can't always accrue to whichever branch is measured second and
  // manufacture a win for it.
  const measurePair = async (flow, mainFn, prFn) => {
    const order = [
      ["main", BASES.main, mainFn],
      ["pr", BASES.pr, prFn],
    ];
    if (Math.random() < 0.5) order.reverse();
    const out = [];
    for (const [branch, base, fn] of order) {
      out.push(await measure(flow, new Client(base, branch), fn));
    }
    return out;
  };

  const results = [];
  for (let i = 0; i < RUNS; i++) {
    results.push(...(await measurePair("Free draft: 5 rolled sources", freeFiveOld, PR_FLOWS.free)));
    results.push(...(await measurePair("Daily board load", dailyBoardOld, PR_FLOWS.daily)));
  }

  for (let i = 0; i < AUTH_RUNS; i++) {
    const suffix = `${Date.now().toString(36).slice(-5)}${i}`.toUpperCase();
    results.push(
      ...(await measurePair(
        "Authenticated daily start",
        (c) => dailyStartOld(c, suffix),
        (c) => PR_FLOWS.dailyStart(c, suffix),
      )),
    );
    results.push(
      ...(await measurePair(
        "Private register + board rosters",
        (c) => privateRegisterOld(c, suffix),
        (c) => PR_FLOWS.privateRegister(c, suffix),
      )),
    );
  }

  return results;
}

function summarize(results) {
  const flows = [...new Set(results.map((r) => r.flow))];
  return flows.map((flow) => {
    const main = results.filter((r) => r.flow === flow && r.branch === "main");
    const pr = results.filter((r) => r.flow === flow && r.branch === "pr");
    const mainCalls = median(main.map((r) => r.requestCount));
    const prCalls = median(pr.map((r) => r.requestCount));
    const mainMs = median(main.map((r) => r.totalMs));
    const prMs = median(pr.map((r) => r.totalMs));
    const mainBytes = median(main.map((r) => r.totalBytes));
    const prBytes = median(pr.map((r) => r.totalBytes));

    return {
      flow,
      runs: `${main.length} each`,
      mainCalls,
      prCalls,
      callReductionPct: pctReduction(mainCalls, prCalls),
      mainMedianMs: mainMs,
      prMedianMs: prMs,
      latencyReductionPct: pctReduction(mainMs, prMs),
      mainMedianBytes: mainBytes,
      prMedianBytes: prBytes,
      byteChangePct: ((prBytes - mainBytes) / mainBytes) * 100,
      mainEndpoints: main[0]?.endpointCounts,
      prEndpoints: pr[0]?.endpointCounts,
    };
  });
}

function fmt(n) {
  return Number.isFinite(n) ? String(Math.round(n * 10) / 10) : "n/a";
}

const results = await run();
const summary = summarize(results);

console.log(`Benchmark date: ${new Date().toISOString()}`);
console.log(`Mode:     ${MODE}`);
console.log(`Baseline: ${BASES.main}`);
console.log(`PR:       ${BASES.pr}`);
console.log("");
console.log("| Flow | Runs | main API calls | PR API calls | Call reduction | main median ms | PR median ms | Latency change | main bytes | PR bytes | Byte change |");
console.log("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
for (const row of summary) {
  console.log(
    `| ${row.flow} | ${row.runs} | ${row.mainCalls} | ${row.prCalls} | ${fmt(row.callReductionPct)}% | ${fmt(row.mainMedianMs)} | ${fmt(row.prMedianMs)} | ${fmt(row.latencyReductionPct)}% | ${Math.round(row.mainMedianBytes)} | ${Math.round(row.prMedianBytes)} | ${fmt(row.byteChangePct)}% |`,
  );
}

console.log("");
console.log("Endpoint counts from the first run of each branch:");
for (const row of summary) {
  console.log("");
  console.log(row.flow);
  console.log(`  main: ${JSON.stringify(row.mainEndpoints)}`);
  console.log(`  pr:   ${JSON.stringify(row.prEndpoints)}`);
}

console.log("");
console.log("Raw runs:");
console.log(JSON.stringify(results, null, 2));
