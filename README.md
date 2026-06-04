# 82-0+ 🦆

A MotherDuck-branded clone of [82-0.com](https://82-0.com): draft an NBA roster
across the decades and see if it can go **82-0**. Powered by the
`nba_box_scores_v2` MotherDuck database.

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

Three modes: **Classic** (stats visible), **HoopIQ** (draft blind), and **Daily**
(a date-seeded HoopIQ challenge — the same five rolls for everyone, once per
Pacific day).

## Setup

```bash
npm install
cp .env.example .env.local   # then add your MotherDuck token
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

## Scripts

- `npm run dev` — dev server
- `npm run build` / `npm start` — production
- `npm test` — scoring model unit tests (vitest)

## Architecture

- `lib/motherduck.ts` — `query()` helper backed by a cached `pg` Pool against
  MotherDuck's PostgreSQL endpoint. Pool cache entries are keyed by
  `session_hint`; `MOTHERDUCK_PG_POOL_MAX` and `MOTHERDUCK_PG_POOL_CACHE_MAX`
  tune local Node connection reuse, not the MotherDuck read-scaling pool size.
- `lib/queries.ts` — decades, season-weighted team pool, peak-season player list.
  Reads the materialized `nba_box_scores_v2.main.player_index` table for fast cold
  starts (falls back to live compute if missing) — refresh it after backfilling
  box scores.
- `lib/scoring.ts` — the roster→record model (GQ talent + construction
  adjustments → net rating → wins)
- `app/api/{decades,slot,players,simulate,daily,team-decades,og}/route.ts` —
  Node.js route handlers (`/api/og` renders the dynamic share image)
- `app/page.tsx` + `components/*` — the game UI (MotherDuck design system)

## Deploying to Vercel

Set `MOTHERDUCK_TOKEN` in the project's environment variables using a Read
Scaling token whose account can access `nba_box_scores_v2`. The data layer is
the pure-JS `pg` driver, so there are no native binaries to bundle —
`next.config.ts` is intentionally empty (no `serverExternalPackages`, no
`outputFileTracingIncludes`). Routes run on the Node.js runtime.

---

An independent project, not affiliated with or endorsed by the NBA or 82-0.com.
