# Benchmarking server-side perf PRs

A minimal, on-demand harness for proving (or disproving) that a performance PR
actually helps. It drives the public HTTP API of two running deployments and
compares them across the request-heavy board-load flows:

- **Free draft** — roll 5 sources + their rosters
- **Daily board load**
- **Authenticated daily start**
- **Private tournament register + board rosters**

The driver is [`scripts/benchmark.mjs`](../scripts/benchmark.mjs) (plain Node, no
build, no deps). It reports per flow: API call count, median wall-clock latency,
response bytes, the endpoints each side hit, and the raw runs.

This is **run-it-when-you-need-it** tooling — not a CI gate. The measurement is
noisy (network RTT, cold starts, MotherDuck load), so a pass/fail check on every
PR would just flap. Run it deliberately when a PR claims a server-perf win.

## Two modes

| Mode | What it compares | Use for |
|---|---|---|
| `bundled` (default) | `MAIN_URL` runs the **old** pattern (separate `/api/players` calls); `PR_URL` runs the **new** bundled pattern (`?includePlayers=1`, `/api/daily/start`, bundled register). | PRs that **change the request shape** (e.g. request bundling). Measures call-count **and** latency. |
| `mirror` | **Both** servers run the **same (old)** pattern. | PRs that keep the request shape but make queries faster (e.g. cache materialization). Call counts are identical; **latency** is the only variable. |

Pick the mode that matches the PR. Getting it wrong gives misleading numbers:
a bundling PR in `mirror` mode understates it; a same-shape PR in `bundled` mode
404s on endpoints it never added. (See "Gotchas" — running `mirror` against a
server that *already* bundles double-counts the rosters and looks like a
regression that isn't real.)

## Prerequisites

- A MotherDuck token whose account **owns `nba_tournament` (writable)** — the
  auth/private flows run `CREATE`/`INSERT`. A **short-lived token (SLT)** is
  ideal because it auto-expires; get one from the MotherDuck UI / API / MCP, or
  use a long-lived RW token.
- `TOURNAMENT_SECRET` must be set on each server (required in production mode —
  both `next start` and Vercel run production). Any value works; it just has to
  be present.

> **Write flows are OFF by default (`AUTH_RUNS=0`).** Read flows never mutate.
> Setting `AUTH_RUNS>0` creates benchmark users in `nba_tournament` on **both**
> targets — private tournaments auto-delete, but a few `daily_results` rows under
> `DLY*` names persist (the app exposes no delete for them). The harness
> **refuses** write flows against a prod-looking host unless `ALLOW_PROD_WRITES=1`.
> Prefer a non-prod preview baseline so production data is never touched.

---

## Path A — deployed (recommended): a Vercel preview vs its baseline

Real network RTT to Vercel + MotherDuck is exactly where bundling/caching wins
show up (on localhost they look like noise). Steps:

### 1. Pick the right baseline — the PR's merge-base, NOT whatever's on prod

This matters. If production is behind `main`, comparing against it conflates the
PR under test with everything that merged since prod was last deployed. Use the
PR's actual base:

```bash
git merge-base <pr-branch> origin/main   # the baseline commit
```

**Prefer deploying the baseline commit as its own preview** (same steps below)
and use *that* as `MAIN_URL`, so you compare only the PR's change. Using the prod
alias as `MAIN_URL` is acceptable **only for read-only runs** (`AUTH_RUNS=0`):
write flows would create benchmark users in production data, so the harness
refuses a prod-looking baseline unless you set `ALLOW_PROD_WRITES=1`.

### 2. Deploy the candidate (and baseline, if needed) as a preview

From a worktree at the commit you want, with tokens injected **per-deployment**
(they don't touch project settings):

```bash
git worktree add --detach /tmp/bench-pr <pr-branch>
cd /tmp/bench-pr
cp -R /path/to/repo/.vercel .vercel          # link to the project
printf '.next\nnode_modules\n.git\n' > .vercelignore

vercel deploy --yes \
  -e MOTHERDUCK_TOKEN="$MD" \
  -e MOTHERDUCK_RW_TOKEN="$MD" \
  -e TOURNAMENT_SECRET="$(openssl rand -hex 24)"
# → note the preview URL it prints
```

### 3. Mint a protection-bypass secret (preview URLs are SSO-protected)

Protection stays **on**; the benchmark just sends a header.

```bash
BYPASS=$(openssl rand -hex 16)   # must be 32 alphanumeric chars
vercel project protection enable --protection-bypass \
  --protection-bypass-secret "$BYPASS" --format json
```

### 4. Warm the cache (caching PRs only — skip for pure request-shape PRs)

A caching PR serves a multi-second **cold build** on the first hit (the
`game_quality` materialization is a ~1.46M-row self-join). If you benchmark
cold, those builds pollute the early runs. Warm it first and watch the latency
drop:

```bash
PR=<preview-url>; H="x-vercel-protection-bypass: $BYPASS"
curl -s -o /dev/null "$PR/api/players?team=LAL&decade=2000&mode=classic" -H "$H"  # triggers build
for i in $(seq 1 8); do
  curl -s -o /dev/null -w "%{time_total}s\n" "$PR/api/players?team=LAL&decade=2000&mode=classic" -H "$H"
  sleep 5
done
# first probe may be ~20s+ (cold build); proceed once it's consistently sub-second
```

(`app_cache` is per-MotherDuck-account, so if a prior run already built it for
the same token, it's warm immediately.)

### 5. Run the benchmark

```bash
MAIN_URL=<baseline-url> PR_URL=<preview-url> \
VERCEL_PROTECTION_BYPASS=$BYPASS \
BENCH_MODE=bundled \
  node scripts/benchmark.mjs | tee bench-deployed.txt
```

Write flows are off by default. To include them, deploy a **non-prod** baseline
preview and add `AUTH_RUNS=3` — they create throwaway users in `nba_tournament`
(and are refused against a prod-looking URL unless `ALLOW_PROD_WRITES=1`).

> Header-only bypass (no `x-vercel-set-bypass-cookie`): the set-cookie variant
> answers with a redirect that loops under `fetch`'s auto-follow. The plain
> header returns `200` directly. `benchmark.mjs` already does it this way.

### 6. Tear down — always

```bash
vercel project protection disable --protection-bypass \
  --protection-bypass-secret "$BYPASS" --format json   # restore protection
vercel remove <preview-url> --yes
git worktree remove --force /tmp/bench-pr
```

---

## Path B — local: two production servers

No Vercel needed. Build each branch in its own worktree and run both as
production servers, then benchmark across loopback.

> Caveat: loopback RTT is ~0, so latency deltas are tiny and noisy. Use this to
> verify **correctness** and **call-count** changes; use Path A for real latency.

```bash
git fetch origin main <pr-branch>
BASE=$(git merge-base <pr-branch> origin/main)   # the PR's base — NOT bare origin/main
git worktree add --detach /tmp/bench-main "$BASE"
git worktree add --detach /tmp/bench-pr   <pr-branch>

cp .env.local /tmp/bench-main/.env.local
cp .env.local /tmp/bench-pr/.env.local
# ensure MOTHERDUCK_RW_TOKEN's account owns nba_tournament writable, and that
# TOURNAMENT_SECRET is present in each .env.local

for d in /tmp/bench-main /tmp/bench-pr; do (cd "$d" && npm ci && npm run build); done
```

Do **not** symlink `node_modules` into the worktrees — Next/Turbopack rejects it.
Use a real `npm ci`. Start each in its own terminal:

```bash
cd /tmp/bench-main && npm start -- -H 127.0.0.1 -p 4100
cd /tmp/bench-pr   && npm start -- -H 127.0.0.1 -p 4101
```

Then (warm first if it's a caching PR — hit port 4101 a few times):

```bash
MAIN_URL=http://127.0.0.1:4100 PR_URL=http://127.0.0.1:4101 \
BENCH_MODE=bundled node scripts/benchmark.mjs | tee bench-local.txt
```

Cleanup: `git worktree remove --force /tmp/bench-main /tmp/bench-pr`.

---

## Reading the output

- **Call reduction** — round-trips eliminated (only meaningful in `bundled`).
- **Latency change** — positive = PR faster (median wall-clock).
- **Byte change** — should stay ~0; a big jump means the bundle is moving more
  data than the sum of the old calls (investigate).
- **Endpoint counts** — confirms each side actually hit the routes you expect.

A healthy bundling result: large call reduction, flat bytes, latency win that
**grows** from localhost (Path B) to deployed (Path A). A healthy
materialization (`mirror`) result: identical calls + bytes, latency win.

## Gotchas (learned the hard way)

- **`mirror` against a server that already bundles → false "regression."** If
  the candidate bundles rosters into a response *and* `mirror` mode also makes
  the old separate calls, you pay for the data twice → bytes look doubled and
  latency looks worse. It's an artifact of the wrong mode/baseline, not a bug.
  Match bundling state on both sides (use the merge-base baseline).
- **Stale prod baseline.** Production can lag `main` by several merges. Always
  baseline against the PR's merge-base (Step 1), not the prod alias by reflex.
- **Cold cache.** First hit on a caching PR is a multi-second build; warm before
  measuring (Step 4).
- **Don't deploy a preview's SLT to prod.** When promoting/redeploying prod, use
  the project's configured Production env (long-lived tokens), never the
  short-lived token you injected per-deployment for a preview.

## npm shortcut

```bash
npm run bench   # = node scripts/benchmark.mjs  (set MAIN_URL/PR_URL/BENCH_MODE)
```
