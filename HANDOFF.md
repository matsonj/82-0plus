# Handoff — bundle: count-based oversize + era-aware spacing lever

**Branch:** `spacing-lever-wip` (base: `main` @ `cf52fde`). **Status:** WIP, not shipped.
**Owner action wanted:** finish the spacing lever, recalibrate size + spacing **together** on real hoopiq replays, ship **one** combined deploy, regenerate ghosts.

---

## TL;DR

- **Prod (`main`)** runs the shipped *height-aware retune* with the **sum-based** oversize penalty (PR #90/#91).
- **This branch** has two bundled changes that are **NOT shipped**:
  1. **Count-based oversize** — ✅ done + calibrated (`OVERSIZE_PER_TALL: 1`). Replaces the sum-based version.
  2. **Era-aware spacing lever** — 🟡 prototype scaffolding only, **default OFF**. Needs candidates, recalibration, tests, and the superteam watch-fixture.
- Everything here is **default-off / byte-identical** to prod until the new knobs are turned on by a candidate (and ultimately the live defaults). `npx tsc --noEmit` + `npx vitest run` are green.

---

## Why (background)

Tall stacks over-won ranked; we shipped the height-aware retune. Two follow-up findings drove this branch:

1. **GOON bug (size):** the shipped *sum-based* oversize missed the "3 bigs + 2 short guards" barbell — a 3-center lineup sums to ~400" (< the 405 floor) and paid nothing. ~25% of real 3-tall teams escaped. **Fix = count-based:** tax each starter ≥83" beyond 2.
2. **SOHA gap (spacing):** our `isNonShooter` uses **FT% touch**, so modern non-shooting bigs slip through (Malone 0.2 3PA/.77 FT, Walton 0 3PA/.71 FT → *not* flagged). better-82-0 scores that exact lineup **71 wins / Grade A** (4 of 5 sub-45 shootingGravity); our engine gives it **82-0**. → era-aware spacing lever.

(See memory: `ranked-tall-stack-regression.md`, `engine-tuning-phase1.md`, `better-82-0-competitor-model.md`.)

---

## DONE in this branch

### 1. Count-based oversize — `lib/scoring.ts`
- `SCORING_CONFIG`: removed `OVERSIZE_FLOOR_TOTAL`/`OVERSIZE_CAP_TOTAL`; added `OVERSIZE_TALL_IN: 83`, `OVERSIZE_FREE: 2`, `OVERSIZE_PER_TALL: 1`, `OVERSIZE_MAX_PEN: 3`.
- `simulateRoster`: `oversizePen = min(MAX_PEN, PER_TALL × max(0, count(starters ≥ TALL_IN") − FREE))`.
- **Calibrated** on real hoopiq (sample 150): per-tall **1 → real 3+-tall champ lift ≈ 0.92×** (neutral), unicorn ≈5%, one-big-balanced control ≈15–17%. (per-tall 2 → 0.76×; 5 → 0.59× over-corrected.)
- Tests updated: `lib/engineLevers.test.ts` (count math + barbell). Candidates added in `configs.ts`: `oversize-off`, `oversize-count-1/2/soft/hard`.

### 2. Era-aware spacing lever — `lib/scoring.ts` (PROTOTYPE, default OFF)
- `SCORING_CONFIG`: `SPACING_REQUIRE_VOLUME: false` (master switch), `SPACING_ERA_SEASON: 1980`, `SPACING_MIN_FG3A: 1.0`, `SPACING_MIN_FG3PCT: 0.32`, `SPACING_FT_TOUCH: 0.78`, `SPACING_FT_ELITE: 0.85`.
- `isNonShooter`: when on, a **3pt-era** player must shoot ≥`MIN_FG3A` at ≥`MIN_FG3PCT` to count as a floor-spacer (knockdown FT ≥`FT_ELITE` always spaces). **Pre-1980 players keep the FT-touch proxy** (FT ≥ `FT_TOUCH`) — era-neutral by construction (no penalty for a shot that didn't exist). Default off = legacy.

---

## TODO (to finish + ship)

1. **Candidates** (`lib/calibration/configs.ts`, + names in `configs.test.ts` `allCandidateNames()`):
   - `spacing-era-aware`: `{ SPACING_REQUIRE_VOLUME: true }` (+ likely retuned `OUTSIDE_PEN_*`, see #2).
   - `size-and-spacing` (**the ship candidate**): live count-based oversize + `SPACING_REQUIRE_VOLUME: true`.
2. **⚠ Recalibrate `OUTSIDE_PEN` — important.** Turning on era-aware spacing *broadens* the non-shooter count, but `OUTSIDE_PEN_2` (9) / `OUTSIDE_PEN_3PLUS` (26) were tuned for the **lenient** count. Many legit lineups will now have 2–3 non-spacers → over-penalty. Expect to lower these (e.g. `2 → ~4`, `3+ → ~8`) and re-check. Recalibrate on real hoopiq (sample ≤150) watching: field win distribution not tanked, `one-big-balanced` stays excellent, and the superteam watch-set drops from 82-0 toward ~A.
3. **Superteam watch-fixture** (the user-requested "test set"):
   - New `lib/calibration/superteams.ts`: export `REAL_82_0_HOOPIQ` (rosters below) + `buildSuperteamFields(pool, count, seed)` that hydrates them via `buildPlayerMap`/`buildDebutMap`/`hydrateTeamFromPool` (from `./hydrate`), tags each `archetype: "real-82-0"`, and packs into 16-team fields (simplest: call `buildSyntheticFields` and replace the first 8 teams per field with the superteams; ids like `super:<NAME>`).
   - Wire into `scripts/calibrateTournament.ts`: concat into `syntheticFields` so `archetypeConversion` / `archetypeDeltas` report **real-82-0** projected wins + champ rate per candidate. Add `"real-82-0"` to the CLI scoreboard label loop.
   - **These are NOT "keep-perfect" guards** — they're spacing-flawed teams our engine over-rates (better-82-0 grades SOHA ~71w/A). Target: the spacing lever pulls their projected wins **down** off 82-0.
4. **Era-neutrality check:** confirm the spacing lever does not broadly tank pre-1980 teams (they should keep the FT-touch path). The harness has no per-decade cut — spot-check a few old-era rosters, or add one.
5. **Lock final values** (spacing strength + `OUTSIDE_PEN`), set live defaults, update tests, full `npx vitest run` green.
6. **Ship (one combined deploy):** branch → PR → merge `main` → `vercel --prod --yes` → **regenerate ghosts** (`npx tsx scripts/seedGhosts.ts` — oversize + spacing both shift `seed_net`). Consider updating the `GlobalHeader.tsx` `CHANGELOG` (currently the big-stack note, `expires` 2026-07-03) to also mention the spacing change.

### The 8 real 82-0 hoopiq rosters (for `superteams.ts`)
`entity_id|team|decade|slot` for the five starters, then the sixth man. (Pulled from `nba_tournament.main.teams`, last 24h, projecting 82-0.)

```jsonc
// SOHA (Kidd, Walton, Malone, Barkley, Jokić | 6th Kawhi) — the spacing poster child
{ "name":"SOHA",      "picks":[["467","NJN",2000,0],["78450","POR",1970,1],["252","UTA",1980,2],["787","PHI",1990,3],["203999","DEN",2020,4]], "sixth":["202695","SAS",2010] }
{ "name":"HERETOWIN", "picks":[["893","CHI",1980,0],["201939","GSW",2010,1],["787","PHI",1990,2],["708","BOS",2000,3],["1631096","OKC",2020,4]], "sixth":["76003","MIL",1970] }
{ "name":"JOKCP",     "picks":[["101108","LAC",2010,0],["76750","NYK",1960,1],["252","UTA",1990,2],["203999","DEN",2020,3],["77449","HOU",1980,4]], "sixth":["302","ATL",1990] }
{ "name":"PEEN",      "picks":[["101108","LAC",2010,0],["893","CHI",1990,1],["2222","CHA",2000,2],["76003","MIL",1970,3],["77449","HOU",1970,4]], "sixth":["2544","LAL",2020] }
{ "name":"SAVOY",     "picks":[["77142","LAL",1980,0],["23","DET",1990,1],["252","UTA",2000,2],["78450","POR",1970,3],["76003","MIL",1960,4]], "sixth":["76979","SDR",1970] }
{ "name":"JOKINAROUND","picks":[["76750","NYK",1970,0],["1630567","TOR",2020,1],["1905","UTA",2000,2],["203999","DEN",2010,3],["78049","BOS",1960,4]], "sixth":["78149","SEA",1980] }
{ "name":"FAVS",      "picks":[["76750","NYK",1970,0],["893","CHI",1980,1],["202695","TOR",2010,2],["201142","BKN",2020,3],["165","HOU",1990,4]], "sixth":["78497","LAL",1960] }
{ "name":"J",         "picks":[["76750","NYK",1960,0],["201566","WAS",2020,1],["77142","LAL",1980,2],["203076","NOP",2010,3],["708","MIN",1990,4]], "sixth":["2544","CLE",2010] }
```
(Captain not captured — pick highest-`value` starter when hydrating, as `synthetic.ts` does.)

---

## How to run

- **Tests:** `npx vitest run` · **Typecheck:** `npx tsc --noEmit`
- **Calibration** (needs MotherDuck token in `.env.local`; the SLT instance OOMs above ~150 anchors fetching `bracket_json` — keep `--sample ≤ 150`):
  ```
  npx tsx scripts/calibrateTournament.ts --sample=150 --synthetic=60 --modes=hoopiq \
    --configs=current,size-and-spacing,legacy-pre-calibration
  ```
  Read: the console **`real tall lift (3+≥83")`** row + per-archetype champ%, and `report.md` (`realTallChampLift`, guardrail G5, `archetypeDeltas` for `real-82-0`).
- **Token refresh** (the `.env.local` SLT expires ~24h): MotherDuck MCP `get_short_lived_token`, then write it into `MOTHERDUCK_TOKEN` **and** `MOTHERDUCK_RW_TOKEN` (a read-write SLT covers both). `.env.local` is gitignored.
- **Deploy:** `vercel --prod --yes` (project linked, `vercel whoami` = matsonj). **Ghosts:** `npx tsx scripts/seedGhosts.ts` (deletes only standard ghosts, reseeds 60 under the live engine).

## Gotchas
- **Config typing:** non-number knobs need `as boolean` / `as <Union>` in `SCORING_CONFIG`/`TOURNAMENT_CONFIG` — the `ScoringConfig`/`TournamentConfig` mapped types only widen numbers, so a bare `false`/`"x"` literal breaks candidate overrides.
- **Compare candidates within ONE harness run** — historical sampling uses `random()` (unseeded), so cross-run lift numbers aren't comparable. Lift is noisy at sample 150 (±0.3–0.5); judge direction.
- **Only `seed_net`-affecting knobs need a ghost reseed** on deploy (oversize + spacing do; the bracket levers don't).
- Prod/`main` = sum-based oversize; this branch's count-based + spacing are the divergence to land.
