# daily82 🦆

**daily82** — draft an NBA roster across the decades and see if it can go a
perfect **82-0**. The namesake **Daily** mode rolls one date-seeded challenge for
everyone (the same five team/era rolls, once per Pacific day); there's also
free-play Classic/Ranked and a Tournament bracket. Powered by the
`nba_box_scores_v2` MotherDuck database and styled as a 90s hoops-magazine
"SLAM Editorial" theme. An homage to [82-0.com](https://82-0.com) — independent
and unaffiliated.

## How it works

- **Draft** — five slots: `[G, FLEX, W, FLEX, B]`. Each slot rolls a decade
  (used decades' odds decay 90% per use, so a lineup spreads across eras) and a
  franchise (weighted by seasons present). A decade is only offered once it has
  enough playable franchises (today the 1960s–2020s; the 1950s are still too
  thin). Teams never repeat; one team-skip and one decade-skip in free play.
- **Player value = Game Quality (GQ).** Players are valued by their **highest
  single-season median GQ** on that team in that decade. GQ is the share of
  weekly head-to-head matchups a player wins across the box-score categories the
  NBA actually tracked that era — the `game_quality` view is **era-aware** (no
  3PT before 1979-80, no steals/blocks before 1973-74, no turnovers before
  1977-78), so a pre-tracking-era great isn't penalized for stats that didn't
  exist.
- **Scoring** — the roster is simulated as a team into an 82-game record:
  - **Talent = Game Quality**, era-neutral by construction, mapped to a base
    **net rating**.
  - **Construction adjustments** then move that net rating (each shown on the
    result breakdown): **usage fit** (five ball-dominant stars can't all eat),
    **outside shooting** (a non-shooter is ≤65% FT or a genuine bad 3pt shooter;
    one is fine, each extra is taxed), **ball movement** (a low assisted-FG% iso
    lineup pays a ball-hog tax), **balance** (need a real ball-handler; no
    lopsided five), **size** (too little total height — though All-Defense players
    add effective inches), and a **defense buff** (All-Defensive selections add
    margin, since GQ undercounts defense). A small **synergy** bonus rewards a
    well-built roster.
  - **Wins = 41 + 2.7 × net rating** (the canonical NBA relationship), so an
    82-0 season needs ≈ **+15.2 net** — reachable only by an elite, well-fit core.

  Positions, height, and All-Defensive selections come from **basketball-reference**
  (enriched to our player ids — see `db/enrichment_tables.md`); positions fall back
  to a box-line heuristic where bio is missing. The full model lives in
  `lib/scoring.ts` (unit-tested, tunable via `SCORING_CONFIG`).

Three modes: **Classic** (stats visible), **Ranked** (draft blind), and **Daily**
(a date-seeded Ranked challenge — the same five rolls for everyone, once per
Pacific day).

## Setup

```bash
npm install
cp .env.example .env.local   # then add your MotherDuck token (+ PlanetScale DATABASE_URL)
npm run dev                  # http://localhost:3000
```

`MOTHERDUCK_TOKEN` is required — create a **Read Scaling Token** in
[app.motherduck.com](https://app.motherduck.com) (Settings → Access Tokens). The
token's account must have access to the `nba_box_scores_v2` database. The app
queries `nba_box_scores_v2` live at runtime via the pure-JS `pg` driver against
MotherDuck's PostgreSQL wire endpoint (it still runs DuckDB SQL — no native
bindings needed). Tables are referenced fully-qualified as
`nba_box_scores_v2.main.<table>` because read-only tokens can't switch the active
workspace. API routes set an anonymous HTTP-only session GUID cookie and pass it
as MotherDuck's `session_hint`, so read-scaling replicas can preserve per-user
affinity.

### Local previews & the database

For **layout / design previews** you don't strictly need a database — `npm run dev`
renders every screen and the data fetches fail gracefully (empty lists, no daily
result, no live-tournaments bar).

For previews **with real data** (tournaments, daily results, player lists), set
`DATABASE_URL` in `.env.local`:

- `DATABASE_URL` is marked **Sensitive** in Vercel, so `vercel env pull` returns it
  **blank** — you can't pull it. Copy the pooled connection string (`:6432`) from the
  **PlanetScale dashboard** into `.env.local` by hand.
- ⚠️ Pointing at the **production** branch means local writes (creating a tournament,
  submitting a daily) hit the live DB. For isolated testing, create a **PlanetScale
  dev branch** and use its connection string instead.
- Repeatable team setup: add a **non-sensitive** `DATABASE_URL` to Vercel's
  **Development** environment (pointing at a dev branch) — then `vercel env pull`
  populates `.env.local` automatically.

Run local dev from the **main checkout**, not a git worktree: Turbopack rejects a
symlinked `node_modules`, which worktrees use.

## Tournament Edition

Submit a drafted team (under an 8-char arcade name + PIN) into a 16-team, East/West
single-elimination bracket that's simulated instantly and stored so you can return with
NAME+PIN to watch your run. This is the app's only **write** path, so it needs a
read-write token:

The transactional tables (`users`, `teams`, `daily_results`, `ghosts`, `private_*`)
live in **PlanetScale Postgres**. Set `DATABASE_URL` to the **pooled** connection
string (PgBouncer, port **6432**) so serverless fan-out doesn't exhaust connections;
the direct **5432** endpoint is for migrations/DDL/admin only. Tables are created
lazily by `lib/oltpDb.ts` → `ensureSchema()` — the `tournament` schema must already
exist (the app role is least-privilege, so an admin runs once:
`CREATE SCHEMA tournament; GRANT USAGE, CREATE ON SCHEMA tournament TO <app_role>;`).
Public read paths (`/api/tournament/{bracket,team,lookup}`) go through
`lib/oltpReadDb.ts`.

`MOTHERDUCK_RW_TOKEN` — now used only to build the derived `app_cache` rollups
(`lib/appCache.ts`, reading `nba_box_scores_v2`); it no longer touches the
transactional tables.

`TOURNAMENT_SECRET` — **required in production.** It's the HMAC key for signed roll
receipts and daily share tokens. It is intentionally NOT derived from a database
token (signing must not be backed by a DB credential). In production the app throws
if it's unset; dev/test fall back to a fixed placeholder. Rotating it invalidates
outstanding roll receipts and daily share links.

`DATABASE_URL_RO` (optional) — a dedicated **SELECT-only** PlanetScale role for the
public read paths, so a leak of the public read connection stays away from the
`users` PIN auth table (smaller blast radius). If unset, those reads fall back to
`DATABASE_URL`. Point it at the pooled (6432) endpoint of a role granted only
`USAGE` on the `tournament` schema + `SELECT` on its tables.

> The tournament tables previously lived in a MotherDuck `nba_tournament` database;
> that database is now a stale backup (no longer written) and can be retired once
> the PlanetScale cutover has proven out.

Tokens for these scripts load from `.env.local` (the same file `next dev` uses) —
don't paste them inline on the command line, where they leak into shell history.

Before the first tournament can run, seed the "ghost" filler field (~60 teams sampled
from the player index) so brackets fill even with few real submissions:

```bash
npx tsx scripts/seedGhosts.ts
```

Tune the matchup factors (`TOURNAMENT_CONFIG` in `lib/tournament.ts`) with the
per-game modifier-log harness (seed ghosts first):

```bash
npx tsx scripts/tuneTournament.ts [N] [seedKey]
```

## Scripts

- `npm run dev` — dev server
- `npm run build` / `npm start` — production
- `npm test` — scoring model + tournament engine unit tests (vitest)
- `npx tsx scripts/seedGhosts.ts` — seed the tournament ghost field (needs RW token)
- `npx tsx scripts/tuneTournament.ts` — per-game modifier tuning harness

## Architecture

- `lib/motherduck.ts` — `query()` helper backed by a cached `pg` Pool against
  MotherDuck's PostgreSQL endpoint. Pool cache entries are keyed by
  `session_hint`; `MOTHERDUCK_PG_POOL_MAX` and `MOTHERDUCK_PG_POOL_CACHE_MAX`
  tune local Node connection reuse, not the MotherDuck read-scaling pool size.
- `lib/queries.ts` — decades, season-weighted team pool, peak-season player list,
  player-card season history. Hot reads are served from the self-managed
  `app_cache` database (see `lib/appCache.ts`), each falling back to a live query
  if the cache isn't built yet.
- `lib/appCache.ts` — self-managed derived-data cache. The `game_quality` VIEW does
  a within-week round-robin self-join over ~1.46M box-score rows, so recomputing it
  per request was the app's dominant latency (the player card alone ran it ~39k
  times/month at ~265ms). `app_cache` (owned by `MOTHERDUCK_RW_TOKEN`) materializes
  it once and builds the downstream rollups — `player_season_stats` (the card),
  `player_index` (+ a `debut` column that retires the per-submit debut query) and
  `team_decade_weights` (the slot-machine weights). Self-refreshing: a lazy
  stale-while-revalidate check (gated to once/hour per instance, fired in the
  background via `after()` on a cache miss) rebuilds when the source changed;
  `cache_meta` tracks a cheap source fingerprint so an unchanged source skips the
  multi-second rebuild. The source NBA tables stay read-only. (`npx tsx
  scripts/buildCache.ts` builds it by hand.)
- `lib/scoring.ts` — the roster→record model (GQ talent + construction
  adjustments → net rating → wins)
- `app/api/{decades,slot,players,simulate,daily,team-decades,og}/route.ts` —
  Node.js route handlers (`/api/og` renders the dynamic share image)
- `app/page.tsx` + `components/*` — the game UI (SLAM Editorial design system;
  `--md-*` token names are kept in `app/globals.css`, only the values changed —
  see `docs/themes/05-slam-editorial.md`)

## Deploying to Vercel

Set `MOTHERDUCK_TOKEN` in the project's environment variables using a Read
Scaling token whose account can access `nba_box_scores_v2`. The data layer is
the pure-JS `pg` driver, so there are no native binaries to bundle —
`next.config.ts` is intentionally empty (no `serverExternalPackages`, no
`outputFileTracingIncludes`). Routes run on the Node.js runtime.

### CI deploys (GitHub Actions)

`.github/workflows/vercel-deploy.yml` deploys through the Vercel CLI:

- **Pull request → Preview** deploy; the preview URL is posted back as a PR comment.
- **Push to `main` → Production** deploy (daily82.com).

It needs three repo secrets (Settings → Secrets and variables → Actions):
`VERCEL_TOKEN` (create at vercel.com/account/tokens), plus `VERCEL_ORG_ID` and
`VERCEL_PROJECT_ID` (both in `.vercel/project.json`). Sensitive runtime vars like
`DATABASE_URL` are injected by Vercel at runtime, so the CI **build** step doesn't
need them.

---

An independent project, not affiliated with or endorsed by the NBA or 82-0.com.
