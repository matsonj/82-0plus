# Testing plan — issues #14–#21

Covers the 8 changes on branch `feat/planning-batch-14-20`. Legend:
**[Auto]** = covered by `npm test` (vitest). **[Manual]** = run the app and click.
**[DB]** = needs a live MotherDuck/Postgres connection (can't be verified offline).

## 0. Setup / smoke
- `npm test` → expect **129 passing** (was 119 before this branch; +10 new).
- `npm run build` → compiles clean (no TS errors; `/api/player` route present).
- `npm run dev`, open the app. Sanity: menu loads, you can play a Classic season end-to-end and reach the results card.

---

## #16 — Talent-scaled penalty floor + "Team fit"
**[Auto]** `lib/scoring.test.ts`:
- elite-talent + maximally-penalized roster lands **60–79 wins** (not 0), `perfect === false`.
- clean elite roster still reaches **82-0** (floor doesn't bind).
- weak-talent iso team still loses to the passing version (floor doesn't rescue sub-60 talent).
- `teamFit === netRating − baseNet − defBuff`.

**[Manual]** Rebuild the screenshot roster (DET '84 Isiah, DEN '09 Melo, NYK '77 McAdoo, ORL '11 Howard, GSW '63 Wilt):
- Result should now be ~**A−/B tier (≈60–73 wins)**, NOT 0-82.
- Score breakdown shows exactly three lines: **Talent**, **Team fit** (one negative number), **Defense** — no separate Usage/Outside/Ball-movement/Synergy lines.
- `pf − pa` equals the displayed net rating (rounding reconciled).

**Edge cases:** a perfectly clean elite team still goes 82-0; a no-guard / all-bigs team is still bad (floor is talent-gated).

---

## #21 — Era-adjusted usage penalty (pace)
**[Auto]** `lib/pace.test.ts`: `paceAdj(2010) ≈ 1.0`, `paceAdj(1962) < 0.85`, modern ≈ 1.0, clamps for out-of-range/NaN.

**[Manual]** Build a team with **Wilt (GSW '63 / any '60s big)** plus other high-usage stars:
- Wilt's usage no longer single-handedly maxes the penalty; the team's **Team fit** is far less punishing than before.
- Compare a modern high-usage roster (e.g. '00s–'10s stars) — its usage behavior should be **unchanged** vs `main` (2010 is the reference pace).

**Regression:** all existing usage tests still pass (the test fixture is pinned to season 2010 so `paceAdj = 1.0`).

**[DB] note:** `lib/pace.ts` is a baked-in table (no rebuild needed). If you ever re-pull pace, re-run the query in the issue and confirm modern ≈ reference.

---

## #15 — Mobile draft indicators
**[Manual]** On a narrow viewport (~390px; use devtools device mode):
- The team/era `SlotMachine` reel is **noticeably smaller** than before; the roster list is the dominant element.
- At `sm:` (≥640px) the reel returns to full size — desktop looks ~unchanged.
- Reel still spins/lands correctly on team-skip / decade-skip / full roll.

---

## #20 — HoopIQ → Ranked
**[Manual]** Verify the word **"Ranked"** (never "HoopIQ") in:
- main menu mode button + the in-play mode label,
- How-to-play and Tournament how-to copy,
- Tournament entry/results/lookup mode labels and the share-card mode label,
- README.
**[Auto-ish]** `grep -ri hoopiq app components lib README.md` → only the internal enum value `"hoopiq"` + code comments remain (no display strings).
**[DB] regression:** an existing `mode='hoopiq'` tournament team still loads and matches correctly (the stored value is unchanged on purpose).

---

## #17 — Daily is "Open" (no tiers)
**[Manual / DB]** Play a Daily, enter the Daily Tournament:
- The results "Enter tournament" button shows **no tier badge** (Classic/Ranked still do).
- Daily tournament result shows an **"Open · #K of N"** capsule instead of a tier; Classic/Ranked still show the tier capsule.
- `TournamentLookup`: daily teams show **no** tier badge; classic/ranked unchanged.

**[DB]** Matchmaking: a Daily team is drawn against that date's **whole field across all tiers** (not tier-segmented). Hard to assert from the UI alone — confirm via DB that the bracket field mixes tiers, or by inspecting `drawOpponents` behavior (the `sameTier` bypass for daily).

**Regression:** Classic/Ranked tournaments are **still tier-segmented** (you face your own tier).

---

## #18 — Daily share cards hide players
**[Manual]** Daily **challenge** result → "Share result":
- The PNG shows record + net + a **3×3 grid of the 9 team category stats** (PTS/REB/AST/STL/BLK/3PM/FG%/FT%/TOV). **No player names.**
- The copied **link** and **share text** contain no player names/picks.
- Paste the link in Slack/Discord → OG unfurl shows record/net only, **no roster**.

Daily **tournament** result → "Share result":
- Roster rows show **"TEAM 'YY · hidden"** (team/era visible, names redacted), sixth man hidden, **no tier**.

**Regression:** Classic/Ranked share cards are **unchanged** — full roster + tier still shown.

---

## #19 — Replay past 30 daily challenges
**[Auto]** `lib/dailyDate.test.ts`: `recentDailyDates` count/order/boundaries; `isPlayableDailyDate` accepts in-window, rejects future/too-old/malformed.

**[Manual]** On the menu, "Previous challenges":
- Lists prior days (today excluded — it has its own CTA).
- A day you've **played** shows its record + "played" (no Play button); an **unplayed** day has a **Play** button.
- Tap Play → loads **that day's** board (deterministic; same as everyone else for that date), playable end-to-end.
- After finishing an archived day, it becomes locked (its own localStorage key); **today's** banner is NOT overwritten.

**[DB]** Enter an **archived** Daily Tournament:
- Submit carries the right `dailyDate`; provenance validates against that date's board; that date's ghosts generate lazily if absent.
- `/api/daily?date=` and submit **reject** dates >30 days old or in the future (fall back to today).

**Edge cases:** month/year boundary in the date list; a date with no prior human entrants (ghost-only field still runs).

---

## #14 — Classic player cards
**[DB]** New query `getPlayerSeasonHistory` (validated live for Carmelo: GQ .566→peak .814→decline). Spot-check a few players via `/api/player?id=<entity_id>`.

**[Manual]** In **Classic** draft, tap the **▦** button on a roster row:
- A baseball-card modal opens: header (name / team / drafted year), **median-GQ-by-season SVG chart** (peak dot highlighted, 50 reference line), and a **per-season table of the 9 categories** (+ GQ, GP), horizontally scrollable on mobile.
- In Classic **results**, tapping a roster row opens the same card.
- **Ranked & Daily**: the ▦ button and the tappable results rows are **absent** (stats stay hidden — no spoilers).

**Edge cases:** a one-season player (chart degrades gracefully); a player with sparse/old-era seasons (untracked STL/BLK/TOV/3PM show as recorded, often 0); the modal closes on ✕ and on backdrop click.

---

## Cross-cutting regression
- Full Classic and Ranked flows still play through to results + tournament unchanged.
- Share links from **before** this branch still decode/render (the share payload shape is unchanged; daily just sends an empty roster now).
- `npm test` + `npm run build` both green.
