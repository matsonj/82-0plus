# 82-0+ 🦆

A MotherDuck-branded clone of [82-0.com](https://82-0.com): draft an NBA roster
across the decades and see if it can go **82-0**. Powered by the
`nba_box_scores_v2` MotherDuck database.

## How it works

- **Draft** — one slot per decade available in the data (today: 2000s / 2010s /
  2020s; expands automatically as older seasons are backfilled). Each slot rolls
  a random franchise, weighted by how many seasons it appears in that decade — so
  long-lived teams come up more, but the SuperSonics still show up for the 2000s.
- **Player value = Game Quality (GQ).** Players are valued by their **highest
  single-season median GQ** on that team in that decade — GQ is the share of
  weekly head-to-head matchups a player wins across 9 box-score categories
  (defined in the `game_quality` view). The displayed PTS/REB/AST/STL/BLK come
  from that same peak season.
- **Scoring** — the roster is simulated as a team into an 82-game record:
  - **Quality = Game Quality**, which is era-neutral (each player is scored only
    against his contemporaries), so cross-era picks are fair. Team quality →
    a base **net rating**.
  - **Fit penalties** subtract net-rating points: **usage** (five ball-dominant
    stars can't all eat), **spacing** (too few 3s), **playmaking** (too few
    assists), **defense** (too few steals + blocks), and **balance** (derived
    positions — no rim protector, no creator, or a redundant lineup).
  - **Wins = 41 + 2.7 × net rating** (the canonical NBA relationship), so an
    82-0 season needs ≈ **+15.2 net** — a high but reachable apex.

  Positions are **derived** from the box line (`lib/positions.ts`) — the database
  has no position column. The full model lives in `lib/scoring.ts` (unit-tested,
  tunable via `SCORING_CONFIG`).

Two modes: **Classic** (stats visible) and **HoopIQ** (draft blind).

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
- `lib/scoring.ts` — bespoke usage/penalty/Pythagorean model
- `app/api/{decades,slot,players,simulate}/route.ts` — Node.js route handlers
- `app/page.tsx` + `components/*` — the game UI (MotherDuck design system)

## Deploying to Vercel

Set `MOTHERDUCK_TOKEN` in the project's environment variables using a Read
Scaling token whose account can access `nba_box_scores_v2`. The data layer is
the pure-JS `pg` driver, so there are no native binaries to bundle —
`next.config.ts` is intentionally empty (no `serverExternalPackages`, no
`outputFileTracingIncludes`). Routes run on the Node.js runtime.

---

An independent project, not affiliated with or endorsed by the NBA or 82-0.com.
