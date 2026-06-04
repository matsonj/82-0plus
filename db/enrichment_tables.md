# Enrichment tables (MotherDuck `nba_box_scores_v2.main`)

Two external datasets were scraped from basketball-reference and loaded into
MotherDuck as a one-off, then enriched to our `entity_id` (the NBA player id used
throughout `box_scores`). They feed the scoring model via `player_index`.

These tables live in MotherDuck (like `player_index`), not in the repo. This file
documents their provenance and rebuild recipe.

## `all_defense_raw` → `all_defense`
- **Source:** https://www.basketball-reference.com/awards/all_defense.html (one
  table, All-Defensive 1st/2nd teams, NBA+ABA, 1968–2025). Tie cells (`A, B (T)`)
  split into separate rows; `season_year` is the season START year (1995 = 1995-96).
- **`all_defense_raw`** (614 rows): `player_name, season_year, all_team (1|2), lg`.
- **`all_defense`** (592 rows): `entity_id, season_year, all_team`. Built by
  normalizing names (strip accents/punctuation/`*`) and joining to box-score names
  by name+season, with an alias fix:
  `Fat Lever→Lafayette Lever`, `Michael Ray→Micheal Ray Richardson`,
  `Robert Williams→Robert Williams III`, `Jaren Jackson→Jaren Jackson Jr.`
  (Tom Sanders 1968 predates our coverage — the only unmatched row.)

## `player_bio_raw` → `player_bio`
- **Source:** basketball-reference player index pages `/players/{a..z}/`
  (5,416 players). Each lists **height** (`6-11` → 83 in) and **position**
  (`G`, `F`, `C`, `G-F`, `F-C`, …). Loaded via the DuckDB CLI (`duckdb md: -c
  "CREATE TABLE … AS SELECT … FROM read_csv('bref_bio.csv')"`) using a read-write
  MotherDuck token (the app's `.env.local` token is read-only).
- **`player_bio_raw`** (5,416 rows): `player_name, height_in, pos, year_min, year_max`.
- **`player_bio`**: `entity_id, height_in, pos`. Name match (strip accents/punct
  /HoF `*`) with career-span (`year_min..year_max`, b-ref END-year) disambiguation
  for duplicate names. Covers ~96.6% of `player_index` players; missing height
  defaults to 79″ in the index build so no one is wrongly penalized.

## Consumption
`player_index` LEFT JOINs both on `(entity_id[, best_season])` to add
`height_in`, `pos`, and `all_def` (1/2/0). `lib/positions.ts` prefers real `pos`
(falls back to the box-derived heuristic); `lib/scoring.ts` uses height for the
size penalty (All-Def adds effective inches) and All-Def for the defensive margin
buff. Rebuild `player_index` after refreshing either table (mirror of
`computePlayerIndexLive()` in `lib/queries.ts`).
