# daily82 — SLAM Redesign · Implementation Handoff

Self-contained brief for implementing the **82-0+ → daily82** rebrand in the **SLAM Editorial** theme. All mockups exist as Paper artboards; this doc maps them to routes, gives the tokens, and lists the locked conventions so a fresh session can build from it without the design conversation.

---

## 1. Where everything lives

- **Paper file:** "Scratchpad", id `01KQG6VP36N95G7JRPDSTDM7ZM`, page **`5-0`** ("Re-theme — Design Systems").
- **Open an artboard:** `https://app.paper.design/file/01KQG6VP36N95G7JRPDSTDM7ZM/5-0/<artboardId>`
- **SLAM system sheet:** artboard `62V-0` (the canonical token/component reference — color, type, components, foundations, conventions).
- **Written style guides:** `docs/themes/05-slam-editorial.md` (SLAM, the chosen one) + `01`–`04` (Classic / Modern / Post-modern / Retro explorations) + `docs/themes/README.md`.
- **Export exact values from Paper** with `get_jsx` / `get_computed_styles` per artboard — do not eyeball from screenshots.

---

## 2. Theme = SLAM Editorial (90s hoops magazine)

Loud editorial print: screaming compressed cover-lines, two screaming spot inks on newsprint, hard offset shadows, halftone grit, marker scrawl. **"Loud chrome, quiet data"** — maximalism decorates the chrome; box scores/tables stay impeccably clean.

### Color tokens → map onto `app/globals.css` `--md-*` slots
| Role | SLAM hex | Replaces `--md-*` |
|---|---|---|
| Ground / paper | `#EDE7D8` (newsprint) | `--md-paper` |
| Card inset / lighter cream | `#F7F2E6` / `#FBF8F1` | `--md-paper-2` / `--md-white` |
| Ink / primary text | `#15110E` | `--md-ink` |
| Muted text | `#5C564B`, `#7A7060` | `--md-ink-muted` |
| Hairline / rules | `#D8CFBE` / `#2A231C` (on dark) | borders |
| **Flame-red** — primary accent, verdict, CTA | `#E5261F` (halftone `#A6160F`) | `--md-orange`/accent |
| **Press-yellow** — highlight, champion gold, badges | `#FFC400` | `--md-yellow` |
| Cobalt — Private Tournament accent | `#2B4BFF` | (new) |
| Positive net rating | `#1E8E5A` (green) | `--md-teal` |
| Riso clash (magenta/process-blue/court-green/violet) | theming & stickers **only — never data cells** | secondary |

**Dark "ink-spread" panel** (the result/Daily "money card", brackets, OG cards): `background:#15110E` (radial to `#221C17`), `border:3px solid #E5261F`, hard offset shadow `6px 6px 0 #E5261F` (no blur).

### Type (all Google Fonts, via `next/font/google` in `app/layout.tsx`)
- **Anton** — cover-lines / headlines (display)
- **Oswald** — uppercase tracked labels, buttons, nav, badges, tabs
- **Space Mono** — ALL data/numbers (`tabular-nums`), small labels, inputs
- **Space Grotesk** — body copy
- **Special Elite** — typewriter meta / folios / captions
- **Permanent Marker** — marker scrawl accents (use sparingly)

(Replaces the current Space Mono + Inter pairing.)

### Geometry
Thick ink borders + **hard offset shadows (no blur)**; zero/near-zero radius; halftone dot texture via `repeating-radial-gradient`; press-yellow highlighter behind a key phrase; rotated flame-red "stamps" for rank/champion/tier.

---

## 3. Locked conventions (apply everywhere)

1. **Hero** = a tight, **one-line** "Go undefeated." band (`GO` ink + `UNDEFEATED.` flame-red). Never a screen-filling stacked block.
2. **Home desktop = bento:** hero + **featured** Daily card on the LEFT; **Private Tournament / Classic / Ranked** tiles on the RIGHT. The Daily is the dominant element; Private Tournament is a first-class tile (cobalt), equal to Classic/Ranked.
3. **Draft is player-first:** a roll gives **team + era** → draft **any** player from it → **then assign to an open slot**. Position is shown as info on each player, not a filter. Draft slots read **GUARD / FLEX / WING / FLEX / BIG** (this order). Free play (Classic/Ranked) has **both** a team reroll and a decade/era reroll; the Daily's rolls are fixed for everyone.
4. **Finished/resulting rosters** (result, share, etc.) are numbered **1–5** — drop the position letters (those are draft-only).
5. **All data tables** use **fixed-width, right-aligned column lanes** (`width` + `flexShrink:0`), never gap-spaced / `max-content`. Trace a vertical line down each column to verify.
6. **Bracket matchups** show **series records**, e.g. `4-3 (W)` / `3-4 (L)` (best-of-7, winner reaches 4). **Desktop = horizontal tree**; **mobile = stacked round-by-round**.
7. **PlayerCard centerpiece = the GQ (Game Quality) chart** (see §5).
8. **Data legibility is sacred:** box scores / leaderboards / brackets stay clean (Space Mono tabular, ink-on-cream or cream-on-dark, hairline rules, no spot-color fills inside data cells).
9. **Branding:** `daily82` everywhere (never `82-0+`). Hero/goal language: "Go undefeated." The number `82` lives in the wordmark. Footer: "Powered by MotherDuck · nba_box_scores_v2" + the NBA disclaimer.

---

## 4. Artboard index (page `5-0`)

### Pages (mobile · desktop)
| Route / screen | State | Mobile | Desktop |
|---|---|---|---|
| **Home** `/` | Entry (logged-out) | `7Q4-0` | `7Q5-0` |
| | Unplayed (logged-in) | `7Q6-0` | `7Q7-0` |
| | Played (logged-in) | `6S7-0` | `7Q8-0` |
| | Sign-in modal | `7Q9-0` | — |
| **Play flow** | Mid-draft | `86Z-0` | `870-0` |
| | Result + share (Classic/Ranked) | `871-0` | `872-0` |
| **Player cards** `/cards` | Landing (franchise decks) | `8TB-0` | `8TC-0` |
| | Player card view (drill-down) | `F3F-0` | `F3G-0` |
| **My Teams** `/tournament` | Logged-out lookup | `8TD-0` | `8TJ-0` |
| | Logged-in teams list | `8TP-0` | `8TU-0` |
| **Daily head-to-head** `/d/[date]` | Both-played comparison | `9Q6-0` | `9Q7-0` |
| **Share preview** `/s` | Static result card | `9Q8-0` | `9Q9-0` |
| **Private tournament** `/p/[id]` | Lobby (open) | `A74-0` | `A7Z-0` |
| | Final (completed) | `A82-0` | `A8H-0` |
| **Public bracket** `/t/[id]` | Champion + tree | `A8I-0` | `A91-0` |
| **Classic drill-down** (player card from a result) | Carousel modal | `F3H-0` | `F3U-0` |

### Social / OG cards (1200×630)
Daily result `A5H-0` · Classic result `A5I-0` · Tournament champion `A5J-0` · Brand/homepage `A5K-0`

### Design-system sheets
SLAM Editorial **`62V-0`** (chosen) · Classic `4E6-0` · Modern `4E7-0` · Post-modern `4E8-0` · Retro `4E9-0` (explorations only)

---

## 5. The PlayerCard / GQ chart (critical)

The defining card element (real component: `components/PlayerCard.tsx`). Reference artboards: `F3G-0` (full, desktop), `F3F-0` (mobile), `F3H-0`/`F3U-0` (Classic drill-down).

- **Header:** player name (Anton) + position pill; subtitle `{team} · best year '{yy} · career card`. SLAM treatment: flame-red "CAREER CARD · No. {jersey}" bar + ghost team code.
- **Median Game Quality by season** — a **line chart**, 0–100, white/cream panel with 1.5px ink border, dashed guides at **25 / 50 / 75** (50 ≈ league average), x = the player's seasons, connecting ink line. Each season is a dot: **drafted/best season = larger flame-red dot**, on-team = ink dots, **off-team season = hollow/greyed dot**. Legend: Drafted · On team · Another team.
- **Per game · by season** table: `YR · PTS · REB · AST · STL · BLK · FG% · FT% · TOV · 3PM · USG`, Space Mono tabular-nums, fixed lanes; **off-team-season rows greyed**.
- **Caption:** "Game Quality is era-aware: each game is scored only on the box categories the NBA tracked that season. 50 ≈ league average. Greyed seasons were played for another team."
- In the **Classic drill-down** the card pairs with a **"FED THE SIM"** callout (the drafted season's per-game line that drove the sim) and a "2 OF 5 · starters" carousel.

GQ source: `gq100(gq)=round(gq*100)`; see `[[game-quality-era-aware]]` memory.

---

## 6. Per-page implementation notes

**Home (`app/page.tsx`)** — `phase` machine (`menu`/`play`/`tournament`); auth = `getSavedUser()` (name+PIN, localStorage, key `md820-session`); daily = `dailyLoaded` + `todayResult`. Logged-out → "Sign in" affordance, no history, must sign in to play (server-gated `/api/daily/start`). Logged-in unplayed → identity chip + Last-7-days with TODAY="PLAY". Played → result card (record, **Rank #N of M** link → leaderboard modal, countdown, Share, Review) + Last-7-days TODAY=record. Three ways-to-play tiles (Private/Classic/Ranked) on every state. Desktop = bento (§3.2).

**Mid-draft** — `SlotMachine` (the roll: team+era) + `LineupDraftBoard` (roster slots G/F/W/F/B, player list from the rolled team/era across mixed positions, assign-to-slot with eligibility) + reroll team/decade + "Simulate Season" when 5 drafted.

**Result + share** — `ResultsPanel`: record, net rating, the 5-man lineup numbered 1–5 (clean box score), one "Team fit" adjustment line, Share, **Enter Tournament** (≥40 wins) + Play again. Classic shows the per-game career-card carousel (the drill-down, §5).

**Player cards (`/cards`)** — teams grid → era → roster → the GQ card view (§5). Read-only, no auth. Search by team/player/year.

**My Teams (`/tournament`)** — logged-out = `TournamentLookup` (name+PIN, tabs All/Daily/Ranked/Classic/Private); logged-in = teams list, each row a story: **champion crown** + team name + **`[c]` captain** + the **season → tournament journey** (REG record → BRACKET record → outcome/CHAMPION/RUNNER-UP) + tier stamp. Aligned columns.

**Daily head-to-head (`/d/[date]`)** — sharer's result vs yours (server-signed `?s=` token); roster comparison with shared picks marked "BOTH"; verdict ("X took it by 1").

**Share preview (`/s`)** — static Classic/Ranked result card (encoded `?r=`), roster numbered 1–5, "Build your own season" CTA. Daily shares use `/d/[date]` instead.

**Private tournament (`/p/[id]`)** — lobby (open): entrants table + invite link; final (completed): champion + bracket. **Public bracket (`/t/[id]`)** — read-only champion + bracket tree.

---

## 7. Implementation guidance

- **Tokens:** redefine the `--md-*` CSS custom properties in `app/globals.css` to the SLAM values (§2) — reusing the existing token names keeps all `.md-*` class consumers working. Add a `--md-cobalt` for Private Tournament. Restyle the shared classes: `.md-btn`, `.md-card`, `.md-input`, `.md-badge`, `.md-capsule`, `.md-statline`/`.md-stat`, the slot-reel animation.
- **Fonts:** swap the `next/font/google` imports in `app/layout.tsx` to Anton / Oswald / Space Mono / Space Grotesk / Special Elite / Permanent Marker; expose as `--font-display` / `--font-sans` / etc.
- **Components to restyle:** `GlobalHeader` (masthead), the home hero + bento + mode tiles, `SlotMachine`/`LineupDraftBoard` (player-first + G/F/W/F/B + rerolls), `ResultsPanel` (1–5 lineup), `PlayerCard` (keep the GQ chart — it's already the centerpiece; just reskin), `DailyLeaderboard`, `BracketView` (series records, responsive horizontal/stacked), `TournamentResults`, `DailyArchive` (Last-7-days), `DailyShareLanding`, share-image generators (`app/api/og/route.tsx`, `lib/shareImage.ts`).
- **Rebrand text pass:** see the original scope — header logo, `app/layout.tsx` metadata/OG, `app/api/og/route.tsx`, `lib/shareImage.ts`, share-text prefixes, page-title metadata. Replace `82-0+` → `daily82`; hero `Go 82–0.` → `Go undefeated.`
- **DO NOT TOUCH** `lib/daily.ts:42` seed `'82-0+:${date}'` — load-bearing; changing it re-rolls every daily board and breaks share links. Same for `lib/secret.ts` dev fallback and `lib/site.ts` utm_source (internal, no UI impact).
- **Workflow:** build in a **git worktree** (Codex shares the main folder); stack PRs on in-flight branches as needed.

---

*Generated from the design session. The Paper artboards are the source of truth for exact values (`get_jsx`/`get_computed_styles`). See the `slam-redesign` memory for the high-level state.*
