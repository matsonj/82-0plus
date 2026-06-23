# daily82 — Theme 05: SLAM EDITORIAL (90s Hoops-Mag)

> An alternative sibling to the approved **POST-MODERN** sheet (`docs/themes/03-postmodern.md`). It keeps that sheet's spine — **"LOUD CHROME, QUIET DATA,"** the same daily82 component set, the bleed/sticker/oversized-type energy, and the SACRED data-legibility guardrail — but re-informs the energy with the real editorial language of **1990s SLAM Magazine** and its urban/hip-hop peers. Where post-modern is *streetwear / SNKRS / scoreboard glow*, this is *newsstand / printed page / Rucker Park*. Implementable on the same stack: Next.js App Router, Tailwind v4 (`@import "tailwindcss"`), `--*` custom-property tokens in `app/globals.css`, fonts via `next/font/google`.

Status: design spec only. No app code changes implied. Tokens are proposed as `--sl-*` so they can coexist with legacy `--md-*` and the proposed `--pm-*` set during evaluation.

---

## 1. Vibe statement + mood board

**Vibe.** Open a SLAM from 1997. Ink rubs off on your thumb. A cut-out Iverson floats on a flat blood-red field, his name screaming in a compressed gothic so tight the letters touch, a marker-scrawled kicker over the top, a halftone dot pattern bleeding off the gutter, the folio reading **ISSUE No. 32**. That's the feeling: **basketball as printed culture** — not the glossy NBA press kit, but the magazine that "operated in opposition to what the NBA was doing" (Tony Gervino, SLAM EIC). It is loud the way a newsstand is loud: stacked cover lines fighting for your eye, one spot color doing all the shouting against newsprint and ink, photography cut out and slammed onto color. daily82 becomes the issue you can't stop reading — every result is a cover story, every box score a stat sidebar set clean enough to actually read on the train.

**How it riffs on POST-MODERN (explicit keep / swap):**

| | POST-MODERN (approved) | SLAM EDITORIAL (this sheet) |
|---|---|---|
| **Keeps** | "Loud chrome, quiet data"; black + ink spine; one screaming accent; oversized compressed type; stickers, bleed, rotation, overlap; zero-radius hard edges; hard offset shadows; the SACRED clean box score & leaderboard; mono for data. | All of it. Same philosophy, same guardrail, same component set, same daily82 DNA. |
| **Swaps** | *Streetwear / gaming / SNKRS* surface. Acid lime `#C6FF00` scoreboard glow on near-black as home base. Druk/Futura-condensed substitute (Archivo). Halftone as "noise." Digital, neon, screen-native. | *Newsstand / print* surface. **Newsprint off-white is the home base**, ink-black type, **two screaming spot colors (flame-red + a printer's yellow)** like a 2-color press run. Champion/Knockout-condensed cover-line voice. Halftone + **misregistration + newsprint grit** as *print artifacts*, not noise. Adds a **marker/graffiti accent** (hand-lettering), a **typewriter byline**, and **editorial page furniture** (folios, kickers, decks, pull-quotes, jump lines). |

In one line: **post-modern is the scoreboard at midnight; this is the magazine cover on the rack.** Same swagger, printed instead of pixel-lit.

**Mood board — named references and the one device to steal from each:**

| Reference | What I actually studied | The one move to steal |
|---|---|---|
| **SLAM masthead / logo** (Don Morris, 1996, based on **Neville Brody's FF Harlem**) | The wordmark is the brand: heavy, tightly-set, screen-printable, instantly "SLAM." It anchors a cover where everything else is chaos. | The **box-logo masthead** instinct — a tight, heavy, monolithic daily82 wordmark that anchors the page no matter how loud the rest gets. |
| **SLAM #32 — Iverson "Soul on Ice"** (Mar '99, photo Clay Patrick McBride, concept Tony Gervino) | **Color photo of a cut-out figure on a flat spot-color field** (one red, one white backdrop); cover line a conceptual phrase, not a stat; "juxtapose against the classic NBA image." McBride: wished he'd lit the background "harder and punchier." | **Cut-out subject on a flat spot-color block**, with a conceptual cover line. This is the hero composition for result cards. |
| **SLAM cover typography roster** (Fonts In Use, '97–'00) | Feb '97: **Impact, FF Blur, Franklin Gothic**. '98–'00: **House Gothic 23, Garage Gothic** (caps), with alternate straight-leg R / bearded G. Later: **Tungsten, Gotham Ultra**. | The **compressed-gothic-caps cover line** as the dominant type voice + a **distressed/grunge layer** (FF Blur) for grit. |
| **Champion Gothic** (Hoefler & Co., **designed 1990 for Sports Illustrated**; six widths, late-19th-c. **wood-type** roots) → **Knockout** (SI redesign, '94–'98) | The actual DNA of American sports cover-line type: condensed, wood-type-flavored gothic in many widths. Commercial, but the *ancestor* (Alternate Gothic) has a free Google revival. | The **multi-width condensed gothic** look. Free path: **League Gothic** (revival of Alternate Gothic, the Champion/Knockout ancestor) + Anton/Oswald widths. |
| **The Source / Vibe / XXL** (Complex "50 Greatest Hip-Hop Covers") | All-caps cover lines **treated as design elements equal to the photo**; **spot color isolating the subject**; masthead as constant anchor; text **integrated into**, not floated above, the image. | **Cover line ↔ photo integration**: type that overlaps and wraps the cut-out figure, spot color behind it for separation. |
| **David Carson / Ray Gun + Neville Brody / The Face** (grunge-typography era) | Distressed textures, **compressed/layered type**, abrupt hierarchy, asymmetry, "visual abrasion," FF Blur. The grandparents of SLAM's look. | A **controlled dose of grunge**: rough edges, overlap, abrupt jumps in type size — energy, never illegibility. The discipline that keeps it from being Ray Gun (unreadable) is *our* data guardrail. |
| **AND1 Mixtape / streetball** (founded '93; "No Blood, No Foul," "You Reach, I Teach") | Raw, direct, confident **slogan voice**; hand-marker attitude; Rucker/blacktop authenticity. | The **trash-talk slogan voice** for marker accents and microcopy (the human, hand-lettered layer). |
| **Eastbay catalog / Hoop / Inside Stuff** (90s hoops print) | Dense product/stat grids living *next to* loud editorial; tabular, scannable, utilitarian. | Proof the era already paired **loud editorial with clean data grids** — exactly our guardrail, historically grounded. |
| **Risograph / 2-color newsprint** (riso guides, Spectrolite) | 1–2 ink runs, **halftone** shading, **overprint** (multiply) third hues, **misregistration**, fluorescent ink on uncoated stock. | The **texture system**: newsprint grit, CMYK halftone dots, a hair of registration offset, overprint where colors cross. |
| **Basketball-Reference / Hoop stat sidebars** (baseline) | Conservative tabular numerals, zebra rows, left-aligned columns, stable reading order. | What we **respect, never subvert**: the stat sidebar reads clean. We rough up the chrome, never the table. |

---

## 2. Color palette

**Strategy.** Where post-modern lives on black with one acid accent, SLAM-editorial mimics a **two-color newsstand press run on newsprint stock**: an **ink-black + newsprint-off-white spine** carries all type and data, and **two screaming spot colors** — a **flame red** (the SLAM/City-Edition blood-red, the dominant shout) and a **press yellow** (the second ink, kicker/highlight) — do the cover-line work. A tight set of secondary inks (riso/hip-hop-cover energy) decorate stickers and era/team theming. Newsprint is home base; **dark "ink-spread" sections invert** to black for hero drama (the inside-cover-gone-black move).

### Core tokens (proposed `--sl-*`, mapping onto the legacy `--md-*` slots)

| New token | Hex | Replaces (`--md-*`) | Role |
|---|---|---|---|
| `--sl-ink` | `#15110E` | `--md-ink` (#383838) | Near-black **warm** ink (newsprint ink is never pure black). All type, borders, rules, folios. |
| `--sl-ink-2` | `#221C17` | — | Lifted ink for raised surfaces on dark spreads. |
| `--sl-news` | `#EDE7D8` | `--md-paper` (#f4efea) | **Newsprint off-white** — warmer/greyer than post-modern's cool bone. Default page surface. The home base. |
| `--sl-news-2` | `#E1D9C6` | `--md-paper-2` | Stat-cell / zebra fill, recessed wells. |
| `--sl-news-3` | `#CFC5AD` | `--md-paper-3` | Hairlines, muted dividers, registration-mark grey. |
| `--sl-muted` | `#6B635420` → text `#7A7060` | `--md-ink-muted` (#818181) | Captions, jump lines, secondary labels (warm grey). |
| `--sl-stock` | `#FBF8EF` | `--md-white` | Brightest "coated insert" white — the clean data-table field (max contrast for the box score). |

### Spot-color + ink tokens

| New token | Hex | Replaces (nearest `--md-*`) | Role & rules |
|---|---|---|---|
| `--sl-flame` | `#E5261F` | `--md-coral` (#ff7169) | **THE signature.** Newsstand blood-red. Primary CTA fills, the cover-line spot field, the "82" highlight, rank stamps, live/hype. (SLAM/City-Edition "Blood Red." Iverson #32's red backdrop.) |
| `--sl-flame-deep` | `#A6160F` | — | Flame pressed/hover shadow, flame text on light at small sizes (passes AA). |
| `--sl-press` | `#FFC400` | `--md-yellow` (#ffde00) | **Second ink.** Press/process yellow — kickers, highlighter swipes behind a word, secondary stamps, the "marker highlight." Use as a *fill behind ink type*, never as type itself. |
| `--sl-ink-blue` | `#1A2EAE` | `--md-blue` (#2ba5ff) | Process-blue editorial ink — links in data contexts (respects sports-site link convention), info capsules, "cool" team theming. |
| `--sl-court` | `#127A4F` | `--md-teal` (#16aa98) | Hardwood-green / "W" win ink — wins, positive net rating, secondary CTA on light. |
| `--sl-violet` | `#5B23C9` | `--md-sky` | Era/decade theming, "Flex" slot, tournament flair (riso-purple overprint partner). |
| `--sl-mag` | `#E0218A` | — | Riso fluorescent magenta — overprint layer, sticker double-shadow, secondary tag. |

### Two-mode system: NEWSPRINT (home) ↔ INK-SPREAD (dark)

- **Newsprint (default).** `--sl-news` page; cards are `--sl-stock` (clean insert) or `--sl-news`; ink type; flame/press for cover lines and CTAs. This is most of the app — it reads like a magazine page. *(Post-modern's home base was black; here it's the printed page. Biggest single divergence.)*
- **Ink-spread (dark hero / share card).** Sections flip to `--sl-ink` like a black inside-cover spread: newsprint-white type, flame + press spot color, halftone in `--sl-ink-2` dots. Reserved for the hero, the result share card, and tournament splash — the "money spreads."

### WCAG / contrast notes — where the spot color must yield

The discipline is identical to post-modern: maximalism everywhere **except numbers you must read.**

- **`--sl-ink #15110E` on `--sl-news #EDE7D8`** ≈ 14.8:1 — body/data on newsprint is safe (the default reading combo).
- **`--sl-ink` on `--sl-stock #FBF8EF`** ≈ 16.9:1 — the box-score field: ink on bright stock. Max legibility.
- **`--sl-news` on `--sl-ink`** ≈ 13.5:1 — ink-spread sections: cream-on-ink for score tables.
- **`--sl-news` (or `--sl-stock`) on `--sl-flame #E5261F`** ≈ 4.6:1 — **cream type on a flame CTA passes AA** for ≥16px/bold. This is the correct way to put text on flame.
- **`--sl-ink` on `--sl-press #FFC400`** ≈ 13.2:1 — **ink on press-yellow is the only correct yellow combo** (yellow is a *background/highlight* ink, never type). Never cream-on-yellow (~1.3:1, fails).
- **Flame as small text:** `--sl-flame` on newsprint ≈ 4.6:1 — OK for ≥16px bold W/L type and labels, **borderline for <16px**; below 16px use `--sl-flame-deep #A6160F` (≈ 6.8:1).
- **Spot colors are decoration, not data.** `--sl-press`, `--sl-violet`, `--sl-mag`, `--sl-ink-blue` are for stickers, kickers, capsules, fills, era theming — **not** for setting numeric values or table cells. The two semantic data pairs are **W = `--sl-court #127A4F`** (passes ≥4.5:1 on both news and stock) and **L = `--sl-flame-deep #A6160F`** (passes on light). Both must *also* be reinforced by shape (pip squares, +/− sign) — never hue alone.
- **Rule for tables:** cell background is always `--sl-stock` (or `--sl-ink` on spreads); color enters only as a left **status bar**, a dot, or one bold figure — never as a cell fill behind small digits.

---

## 3. Typography

Five voices — the editorial-page stack — all on **Google Fonts (verified live: each returns 200 on the `css2` API at the weights specced below)**. The real SLAM faces (FF Harlem, Champion Gothic, Knockout, Tungsten, Gotham, House Gothic) are commercial; the free substitutes below are picked to hit the same notes.

### Families (all Google Fonts, verified)

| Voice | Family | Why it's the free stand-in | `next/font/google` |
|---|---|---|---|
| **Cover-line / display** | **Anton** (400, single ultra-heavy condensed) | The closest free face to **Impact / Tungsten / Gotham Ultra** — the SLAM cover shout. One massive weight, jersey/newsstand energy, letters that nearly touch at tight tracking. The hero voice. | `Anton({ subsets:["latin"], weight:"400" })` |
| **Headline / sub-display (width-flexible)** | **Archivo** (variable `wght 100–900` × `wdth 62–125`) | *Kept from post-modern* — the free **Champion Gothic / Knockout multi-width** substitute. Push `wdth` to 70–85 for condensed cover lines, 100 for decks, expand for the wordmark. One family covers the whole condensed-gothic range. (Width + weight axes both verified.) | `Archivo({ subsets:["latin"], axes:["wdth"], weight:"variable" })` |
| **Alt condensed (workhorse headlines)** | **Oswald** (variable `wght 200–700`) | Free **Alternate-Gothic / Franklin-Gothic-Condensed** flavor — for House-Gothic-style sub-heads, kickers, capsule text when Anton is too heavy. (Verified 200–700.) Optional swap-in: **Saira Condensed** or **Barlow Condensed** (both full 100–900, verified) if a softer or rounder condensed is wanted. | `Oswald({ subsets:["latin"], weight:["400","500","600","700"] })` |
| **Marker / graffiti accent** | **Permanent Marker** (400) | The hand-lettered AND1 / blacktop / scrawled-cover-annotation voice. Kickers like "PUNKS JUMP UP," win stamps, the period on the hero, microcopy attitude. Use *sparingly* — one or two marks per screen. | `Permanent_Marker({ subsets:["latin"], weight:"400" })` |
| **Byline / typewriter** | **Special Elite** (400) | The editorial **byline / credit / dateline** voice — "WORDS BY…", "ISSUE No.", caption credits. The typewriter texture says *masthead / contents page* without a custom face. | `Special_Elite({ subsets:["latin"], weight:"400" })` |
| **Mono / data** | **Space Mono** (400/700, italics) | **Kept** — already in the app. The box-score voice: stat labels, tabular figures, the "82" reads, jump lines. Tabular, sports-data legible. The thread back to daily82's DNA. | already loaded |
| **Sans / body** | **Space Grotesk** (400/500/700) | *Kept from post-modern* — replaces Inter. Proportional cousin of Space Mono, so body + data feel like one system. Paragraphs, form fields, table values, names. | `Space_Grotesk({ subsets:["latin"], weight:["400","500","700"] })` |

> Optional poster faces, all verified on Google Fonts if a second display flavor is wanted: **Bebas Neue** (tall narrow caps — very Tungsten), **Fjalla One** (sturdier condensed), **Teko** (compressed sport numerals). **Sedgwick Ave** is the alternate marker face (looser graffiti). Anton + Archivo are the spec; these are sanctioned substitutes.

### Type scale (px) — oversized cover line → caption

Mobile-first; the cover line is intentionally enormous and allowed to bleed off the right edge like a masthead.

| Token | Size / line-height | Family + weight + width | Use |
|---|---|---|---|
| `--ts-cover` | **104 / 0.84** (desktop 156) | **Anton** 400, tracking −0.02em, UPPERCASE | Hero cover line "UNDEFEATED." — bleeds off-canvas |
| `--ts-h1` | 60 / 0.88 | **Archivo** 800, `wdth` 78, −0.02em, UPPERCASE | Section shouts, result score "73–9" |
| `--ts-h2` | 38 / 0.94 | **Archivo** 800, `wdth` 88, −0.01em | Card titles, player-name headline |
| `--ts-h3` | 26 / 1.0 | **Oswald** 600, UPPERCASE | Sub-heads, House-Gothic-flavor labels |
| `--ts-display-num` | **78 / 0.84** | **Space Mono** 700, tabular | The single hero number ("82", rank "#24") |
| `--ts-kicker` | 13 / 1.2, tracking **0.20em** | **Oswald** 600 UPPERCASE *or* **Permanent Marker** 18px | Kickers above headlines: "DAILY CHALLENGE", "TODAY'S COVER STORY" |
| `--ts-byline` | 12 / 1.4, tracking 0.06em | **Special Elite** 400 | Bylines, datelines, "ISSUE No. 217", credits |
| `--ts-body` | 16 / 1.5 | **Space Grotesk** 400 | Paragraphs, descriptions |
| `--ts-body-strong` | 16 / 1.5 | **Space Grotesk** 700 | Emphasis |
| `--ts-pullquote` | 24 / 1.2 | **Archivo** 700 italic, `wdth` 95 | Pull-quotes between sections |
| `--ts-stat-value` | 18 / 1.1 | **Space Mono** 700, tabular | Box-score numbers |
| `--ts-stat-label` | 10 / 1.2, tracking 0.08em | **Space Mono** 400 UPPERCASE | Box-score labels (PTS, REB) |
| `--ts-caption` | 12 / 1.35 | **Space Grotesk** 400 | Captions, footnotes |

### Mixing & casing rules

- **Cover line = Anton, UPPERCASE, tight, big.** Negative tracking, line-height < 0.9. This is the masthead-scale shout; one per view.
- **Headlines/sub-heads = Archivo at low `wdth` (compressed) or Oswald.** Always push the width down — the condensed cover-line look *is* the brand. Never set headlines at default Archivo width.
- **Mono = the data + the label voice.** Every number and every stat label lives in Space Mono — the discipline anchor and the daily82 thread (identical rule to post-modern).
- **Marker = the human attitude, rationed.** One scrawled kicker or stamp per screen, never body copy, never numbers.
- **Typewriter = page furniture only.** Folios, bylines, "ISSUE No.", credits, jump lines — the editorial connective tissue that *signals magazine* without shouting.
- **Sans = the human reading voice.** Sentences, names, instructions in Space Grotesk, sentence case.
- **Editorial hierarchy = kicker → headline → deck → byline.** Set them as a *tight stack* (no comfortable gaps): a marker/Oswald kicker, slammed onto an Anton headline, a Space Grotesk deck, a Special Elite byline. The collision is the SLAM move.

### The HERO treatment (replaces "Go 82–0." → "Go undefeated." as a SLAM cover line)

A magazine cover, not a centered hero. Newsprint or ink-spread field, cut-out energy, cover lines stacked and bleeding:

```
ISSUE No. 217 · DAILY · NBA          ← Special Elite, 12px, --sl-ink, top folio bar
─────────────────────────────────       on a thin ink rule (the masthead line)

"Punks jump up"                       ← Permanent Marker kicker, --sl-flame, rotated −3°,
                                         overlapping the headline's top-left

GO                                    ← Anton, UPPERCASE, --ts-cover, --sl-ink on --sl-news
UNDE                                     stacked 3 lines, last line bleeds off the right edge.
FEATED.                                  "FEATED" sits on a --sl-flame spot block (the
                                         cover-line-on-color move). The period is marker-drawn.

FIVE SPINS. FIVE PLAYERS.             ← deck: Space Grotesk 700, 16px, --sl-ink
ONE PERFECT SEASON.                      (last clause boxed in --sl-press highlight)

WORDS BY YOU · PHOTOS BY THE SIM      ← Special Elite byline, 12px, --sl-muted

[ ▶ READ TODAY'S ISSUE ]              ← flame CTA, cream text (see §5)
```

- "UNDEFEATED" broken across lines is intentional newsstand line-breaking; the third line sits half-on a flame spot-color block, type knocked out to `--sl-news` (cover-line-on-spot, the Iverson-backdrop move).
- Behind it: a faint **halftone dot field** (`--sl-ink` dots on `--sl-news`) and one **cut-out "82" stamp** with a hair of magenta misregistration. Replaces post-modern's halftone-on-black with halftone-on-newsprint. The energy is identical; the stock changed.

---

## 4. Geometry

Post-modern's instincts (zero radius, hard offset shadows, visible strokes, overlap, rotation, bleed) are **kept whole** — we add the specific *print-page* furniture and a slightly looser, hand-trimmed feel.

- **Borders.** `2px` default ink (keep), `3–4px` on hero cards / primary CTAs. Always `--sl-ink`. On ink-spread surfaces, borders become `--sl-news` or `--sl-flame` (knockout-cut look).
- **Radius.** **Zero** on cards, buttons, inputs, tables (kept). *Exceptions:* circular stamps/badges (`border-radius:50%`) and pill capsules (`border-radius:999px`). Hard rectangles and full circles/pills only — nothing soft in between.
- **Rules & folios (new editorial layer).** The magazine's connective tissue:
  - **Top/bottom rules:** thin `1px --sl-ink` rules frame sections; a **double rule** (1px / gap / 3px) under the masthead.
  - **Folios:** every section carries a corner folio in Special Elite — `ISSUE No. 217`, `daily82.com`, page-number-style tags. Pure furniture, low contrast, signals "magazine page."
  - **Jump lines:** "CONTINUED →" / "STATS, p.2" in Space Mono as section transitions.
- **Shadows → "print offset."** Keep hard offset (no blur), tuned to ink:
  - `--sl-shadow-sm: 3px 3px 0 0 var(--sl-ink)`
  - `--sl-shadow-md: 5px 5px 0 0 var(--sl-ink)`
  - `--sl-shadow-pop: 6px 6px 0 0 var(--sl-flame)` (flame offset for hero CTA / cover cards)
  - **Misregistration double-shadow** for stamps: `3px 3px 0 var(--sl-mag), 6px 6px 0 var(--sl-ink)` (the 2-color-press-slightly-off look).
- **Grid-breaking (kept from post-modern, framed as layout).**
  - 12-col base, **violated on purpose**: cover line and one feature card bleed past the right margin; kickers hang into the left gutter like a magazine's hanging caps.
  - **Rotation:** stamps/kickers/capsules rotate `−4°` to `+5°`. Cards and tables never rotate.
  - **Overlap:** the result stamp overlaps the card edge ~24px; the team badge overlaps the player-card corner; the marker kicker overlaps the headline.
  - **Exposed registration marks:** show faint crop/registration marks (`+` corners, `--sl-news-3`) at section edges — the printed-page tell, replacing post-modern's exposed gridlines.
- **Spacing rhythm.** 4px base; `4 · 8 · 12 · 16 · 24 · 40 · 64 · 96`. Sections get generous air (64–96) so cover lines breathe; *inside* data sidebars, tighten to 8–12 (the dense Eastbay/Hoop stat-grid convention).

---

## 5. Component restyle table

For each component in the current inventory, the SLAM-editorial version. CSS sketches for the load-bearing ones. (Where a component matches post-modern, the only changes are *stock instead of black home base* and *flame/press instead of acid*.)

| Component | Current (`--md-*`) | SLAM-EDITORIAL restyle |
|---|---|---|
| **Header / logo (wordmark)** | Mono wordmark, paper bg | **Masthead lockup**: "DAILY" + flame "82" in a tight Archivo-expanded cut (the FF-Harlem-heavy instinct), UPPERCASE, ink on newsprint, sitting on a **double rule** with a Special Elite folio (`ISSUE No. 217 · daily82.com`). Streetprint, screenprintable. Alerts bell → a flame dot. |
| **Hero** | Centered headline + sunbeam | Cover composition: stacked Anton cover line, marker kicker, deck, byline, cut-out "82" stamp on newsprint + halftone (see §3, §8). |
| **Capsule / pill** (`.md-capsule`) | Yellow, square, mono, 2px ink | Pill (`border-radius:999px`), `--sl-flame` fill, **cream** text + 2px ink border, Oswald UPPERCASE. Variants recolor to press/violet/ink-blue for tags/era/tournament. (Press variant = ink text.) |
| **Card** (`.md-card` / `--lift`) | White, 2px ink, hard md shadow | Two species: **stat-sheet card** = `--sl-stock` clean field, 2px ink border, `--sl-shadow-md` (the legible "insert"); **cover card** = `--sl-ink` dark spread, flame/cream border, `--sl-shadow-pop`, halftone backdrop (the hero/result/tournament money spreads). |
| **Buttons** (`.md-btn` + variants/sizes) | Yellow primary, hard shadow, translate-on-hover | Primary = `--sl-flame` fill / cream text / ink border / `--sl-shadow-md`; hover lifts to flame-pop shadow; active slams flat. Secondary = `--sl-news`/`--sl-stock`. Ink = ink field / cream text. Replace `--teal` with `--sl-court`. Keep `lg`/`sm`. |
| **Text input** (`.md-input` arcade) | White, mono, uppercase high-score | Stock field, flame caret + focus ring, mono. The `--name` high-score variant stays UPPERCASE tracked — reads like a **fan letter / contents-page byline entry**, perfectly on-brand. |
| **Team badge** (`.md-badge`) | Orange square, mono | Jersey-chip: ink square, team color as top accent bar, abbreviation in compressed Archivo. Overlaps card corners. Position chips (G/W/Big/Flex) = small Oswald caps capsules. |
| **Sunbeam backdrop** (`.md-sunbeam`) | Yellow radial gradient | Replaced by a **halftone dot field** on newsprint (or `--sl-ink` dots on ink-spreads) + optional flame→ink spot-block panels. The radial sunbeam is fully retired. |
| **Slot reel** (`.md-spinning`) | Vertical flicker | Faster, harder mechanical reel + motion-blur streak; **flame flash + 2px shake** on lock-in; lands like a press stamp (see §6). |
| **Stat grid** (`.md-statline` / `.md-stat`) — **SACRED** | 5-col, ink gutters, paper cells, mono | **Keep the 5-col mono grid.** Recolor: `--sl-stock` cells on `--sl-ink` 2px gutters, mono tabular values, **one** flame standout cell. Reads like a clean Hoop/Eastbay stat sidebar. Legibility preserved — no grit, no rotation, no spot fills (see sketch). |
| **Scrollbar** (`.md-scroll`) | Ink thumb on paper | Ink thumb on newsprint track, square; flame on hover. |
| **Leaderboard row** — **SACRED** | — | `--sl-stock` rows, ink tabular figures, **flame rank stamp** on the player's own row; status as left bar (court-green safe / flame-deep cut), never cell fill. Zebra via `--sl-news-2`. |
| **Result share card** (flagship) | — | The export: **ink-spread cover card**, giant mono score, W/L pip strip, rotated "RANK #24" press stamp, marker callout. A SLAM cover you screenshot (see §8). |

### CSS sketches

**Design tokens (drop-in head of `app/globals.css`)**

```css
:root {
  --sl-ink:#15110E; --sl-ink-2:#221C17;
  --sl-news:#EDE7D8; --sl-news-2:#E1D9C6; --sl-news-3:#CFC5AD;
  --sl-muted:#7A7060; --sl-stock:#FBF8EF;

  --sl-flame:#E5261F; --sl-flame-deep:#A6160F;
  --sl-press:#FFC400; --sl-ink-blue:#1A2EAE;
  --sl-court:#127A4F; --sl-violet:#5B23C9; --sl-mag:#E0218A;

  --sl-shadow-sm:3px 3px 0 0 var(--sl-ink);
  --sl-shadow-md:5px 5px 0 0 var(--sl-ink);
  --sl-shadow-pop:6px 6px 0 0 var(--sl-flame);

  --font-cover: var(--font-anton), "Arial Narrow", sans-serif;
  --font-display: var(--font-archivo), "Arial Narrow", sans-serif;
  --font-cond: var(--font-oswald), "Arial Narrow", sans-serif;
  --font-marker: var(--font-permanent-marker), "Comic Sans MS", cursive;
  --font-byline: var(--font-special-elite), "Courier New", monospace;
  --font-mono: var(--font-space-mono), Menlo, ui-monospace, monospace;
  --font-sans: var(--font-space-grotesk), Inter, system-ui, sans-serif;
}
body { background:var(--sl-news); color:var(--sl-ink); font-family:var(--font-sans);
  -webkit-font-smoothing:antialiased; }
```

**Cover line + spot-block knockout**

```css
.sl-cover{ font-family:var(--font-cover); font-weight:400;
  font-size:104px; line-height:0.84; letter-spacing:-0.02em;
  text-transform:uppercase; color:var(--sl-ink); }
/* the last line knocked out of a flame spot block (Iverson-backdrop move) */
.sl-cover__spot{ background:var(--sl-flame); color:var(--sl-news);
  padding:0 .08em; box-decoration-break:clone; }
.sl-cover__dot{ font-family:var(--font-marker); color:var(--sl-flame); } /* marker period */
```

**Button**

```css
.sl-btn{
  display:inline-flex; align-items:center; gap:8px;
  padding:14px 26px; border:2px solid var(--sl-ink);
  background:var(--sl-flame); color:var(--sl-news);
  font-family:var(--font-cond); font-weight:600; font-size:15px;
  text-transform:uppercase; letter-spacing:0.06em; line-height:1;
  box-shadow:var(--sl-shadow-md); cursor:pointer;
  transition:transform .08s ease, box-shadow .08s ease;
}
.sl-btn:hover{ transform:translate(-2px,-2px); box-shadow:var(--sl-shadow-pop); }
.sl-btn:active{ transform:translate(2px,2px); box-shadow:0 0 0 0 var(--sl-ink); }
.sl-btn--secondary{ background:var(--sl-stock); color:var(--sl-ink); }
.sl-btn--ink{ background:var(--sl-ink); color:var(--sl-news); border-color:var(--sl-flame); }
.sl-btn--lg{ padding:18px 36px; font-size:19px; }
.sl-btn--sm{ padding:8px 14px; font-size:12px; box-shadow:var(--sl-shadow-sm); }
```

**Card (clean insert) + cover-spread variant**

```css
.sl-card{ background:var(--sl-stock); color:var(--sl-ink);
  border:2px solid var(--sl-ink); box-shadow:var(--sl-shadow-md); }
.sl-card--cover{ background:var(--sl-ink); color:var(--sl-news);
  border:3px solid var(--sl-flame); box-shadow:var(--sl-shadow-pop);
  /* halftone backdrop */
  background-image:radial-gradient(var(--sl-ink-2) 1.4px, transparent 1.5px);
  background-size:8px 8px; }
```

**Capsule (pill)**

```css
.sl-capsule{ display:inline-flex; align-items:center; gap:6px;
  padding:5px 14px; border-radius:999px; border:2px solid var(--sl-ink);
  background:var(--sl-flame); color:var(--sl-news);
  font-family:var(--font-cond); font-weight:600; font-size:12px;
  text-transform:uppercase; letter-spacing:0.06em; }
.sl-capsule--press{ background:var(--sl-press); color:var(--sl-ink); }
.sl-capsule--violet{ background:var(--sl-violet); color:var(--sl-news); }
.sl-capsule--ink{ background:var(--sl-ink); color:var(--sl-news); }
```

**Stat grid — SACRED, maximalism yields to legibility (the guardrail)**

```css
.sl-statline{ display:grid; grid-template-columns:repeat(5,1fr);
  gap:2px; background:var(--sl-ink); border:2px solid var(--sl-ink); }
.sl-stat{ background:var(--sl-stock); color:var(--sl-ink);
  padding:8px 4px; text-align:center; } /* clean insert cells, NO grit */
.sl-stat__label{ font-family:var(--font-mono); font-size:10px;
  text-transform:uppercase; letter-spacing:0.08em; color:var(--sl-muted); }
.sl-stat__value{ font-family:var(--font-mono); font-weight:700;
  font-size:18px; font-variant-numeric:tabular-nums; }
/* ONE standout cell only — never color every cell, never rotate, never halftone */
.sl-stat--hero{ background:var(--sl-ink); color:var(--sl-press); }
```

**Hero number / score**

```css
.sl-score{ font-family:var(--font-mono); font-weight:700;
  font-size:78px; line-height:0.84; letter-spacing:-0.02em;
  font-variant-numeric:tabular-nums; color:var(--sl-flame); }
.sl-score .loss{ color:var(--sl-ink); } /* on a cover spread, cream */
```

**Leaderboard row — SACRED, legibility-first**

```css
.sl-row{ display:grid; grid-template-columns:48px 1fr auto;
  align-items:center; gap:12px; padding:10px 14px;
  background:var(--sl-stock); color:var(--sl-ink);
  border-bottom:1px solid var(--sl-news-3);
  font-variant-numeric:tabular-nums; }
.sl-row:nth-child(even){ background:var(--sl-news-2); }   /* zebra */
.sl-row__rank{ font-family:var(--font-mono); font-weight:700; }
.sl-row--me{ background:var(--sl-flame); color:var(--sl-news); }   /* your row pops */
.sl-row--cut{ box-shadow:inset 4px 0 0 var(--sl-flame-deep); }     /* status = LEFT BAR */
```

**Folio / byline / pull-quote furniture**

```css
.sl-folio{ font-family:var(--font-byline); font-size:12px;
  letter-spacing:0.06em; color:var(--sl-muted); }
.sl-rule--double{ border-top:1px solid var(--sl-ink);
  box-shadow:0 4px 0 -1px var(--sl-ink); } /* 1px + 3px double rule */
.sl-pullquote{ font-family:var(--font-display); font-weight:700;
  font-style:italic; font-size:24px; line-height:1.2; font-stretch:95%;
  border-left:4px solid var(--sl-flame); padding-left:16px; }
.sl-kicker--marker{ font-family:var(--font-marker); color:var(--sl-flame);
  font-size:18px; transform:rotate(-3deg); display:inline-block; }
```

---

## 6. Motion

Same kinetic, snappy character as post-modern, re-skinned with **editorial/press flavor**. Everything snaps; nothing eases slowly.

- **Slot reel spin.** Upgrade `.md-spinning`: fast vertical scroll (~120ms/cycle) with a `blur(2px)` streak, then a hard **lock-in** — snap, 80ms **flame** flash on the cell border, 2px shake. Lands like a **stamp hitting the page** (slight overshoot + settle).
- **Page-turn transition.** New views **turn in like a magazine page** (a fast `rotateY`/translate wipe with an ink leading edge), or a hard **scoreboard wipe** for data views. Not fades. Respect `prefers-reduced-motion` → instant.
- **Marquee / ticker.** A looping Space Mono ticker under the masthead — "TODAY'S ISSUE · 4,182 READERS · BEST 81–1 · STREAK 12 ·" — flame-on-newsprint, `animation: scroll-x 30s linear infinite`. The ambient newsstand-crawl motion.
- **Stamp pop.** Result/rank stamps enter with a small overshoot (1.0→1.08→1.0) + their rotation, like an **ink stamp pressed onto stock**. On a win, a single flame **flashbulb** radial (no confetti — off-brand, same as post-modern).
- **Halftone shimmer.** A very-low-opacity animated drift on the halftone dot field over hero/cover-spread sections only — a faint "press still wet" shimmer. **Off** on data sidebars.
- **Number roll.** Scores/ranks count up on reveal (tabular mono, ~600ms); the result "rolls" to 73–9 like a press counter.
- **Newsprint grain.** A subtle static grain over newsprint/ink-spread sections (very low opacity). Keep it **off** the box score and leaderboard.
- **Reduced motion.** `prefers-reduced-motion` disables page-turn, marquee, grain/halftone animation, stamp overshoot, number-roll → all static. (Identical guardrail to post-modern.)

---

## 7. Iconography / imagery / texture

- **Halftone (core).** Replace gradients/the sunbeam with **CMYK halftone dot fields** (CSS `radial-gradient` dot pattern, or PNG) — `--sl-ink` dots on newsprint, `--sl-ink-2` dots on ink-spreads. The defining print texture.
- **Misregistration.** The signature print-artifact: stamps and cut-outs carry a **2-color offset** (a flame or magenta "ghost" 2–3px off the ink layer) — the 2-color-press-slightly-off look. Use on stamps, the "82," the wordmark accent — sparingly, it's seasoning.
- **Newsprint grit.** A faint paper-fiber / uncoated-stock texture over newsprint sections (low-opacity tile). Keeps the "this is printed" feel. Never over data.
- **Cut-outs.** Subjects (when imagery appears) and stamps are **cut out** and slammed onto flat spot-color blocks — the Iverson-on-red composition. High-contrast **duotone** (ink + one spot color), grain over it, silhouette bleeding off the card edge.
- **Stamps / die-cuts.** Circular "82" stamp, "RANK #24" stamp, "DAILY" tag — thick ink outline, slight rotation, hard offset, misregistration double-shadow. The press-stamp version of post-modern's stickers.
- **Spot-color blocks.** Flat flame/press rectangles behind cover lines and kickers (cover-line-on-color). Where two overlap, `mix-blend-mode:multiply` for the **overprint** third hue (riso trick).
- **Page furniture.** Folios, double rules, registration crop-marks (`+` corners), jump lines, "ISSUE No." — the editorial connective tissue; low-contrast, always present, the magazine tell.
- **Iconography.** Monoline 2px-stroke ink/flame glyphs (kept from post-modern), square caps — utilitarian. Sport pictograms (ball, net, whistle) as bold filled glyphs. Optionally a marker-drawn arrow/circle annotation as a single human accent.
- **Numbers as graphics.** Jersey numbers and box-score figures set giant, tracked, bleeding off edges — the cover-line treatment applied to data *decoratively* (the real data table stays clean).

---

## 8. Homepage walkthrough — before → after

### Mobile hero

**Before (current):** cream `--md-paper` background, soft yellow radial sunbeam, centered Space-Mono "Go 82–0." + subtitle, a yellow button. Polite, warm, symmetrical.

**After (SLAM editorial — a magazine cover):**
- Background `--sl-news` newsprint with a faint halftone field + newsprint grain.
- **Masthead bar:** "DAILY**82**" wordmark (ink + flame "82") on a **double rule**, with a Special Elite folio top-right: `ISSUE No. 217 · daily82.com`.
- **Marker kicker** "Punks jump up", `--sl-flame`, rotated −3°, overlapping the headline top-left.
- **Cover line** stacked, UPPERCASE Anton: **`GO`** / **`UNDE`** / **`FEATED.`** — the third line knocked out of a `--sl-flame` spot block, type in `--sl-news`, bleeding off the right viewport edge; the period marker-drawn.
- A **cut-out circular "82" stamp** (`−5°`, ink outline, magenta misregistration ghost) overlapping the cover line's top-right.
- **Deck** in Space Grotesk 700: "FIVE SPINS. FIVE PLAYERS. ONE PERFECT SEASON." (last clause on a `--sl-press` highlight).
- **Byline** in Special Elite: `WORDS BY YOU · PHOTOS BY THE SIM`.
- Primary CTA `[ ▶ READ TODAY'S ISSUE ]` — flame fill, cream text, `--sl-shadow-md`.
- A thin flame **ticker** pinned below the masthead.

### The "Daily Challenge / Today's Result 73-9 / Rank #24" card — as a magazine cover story

**Before:** a white `.md-card` with `--lift`, mono labels, a yellow capsule, ink on cream. Tidy and quiet.

**After — an `sl-card--cover` (ink-spread) cover story:**

```
┌───────────────────────────────────────┐  ← --sl-ink spread, 3px flame border,
│  DAILY CHALLENGE          ● LIVE        │     --sl-shadow-pop, halftone backdrop
│  ═══════════════════════════════════    │  ← kicker: Oswald cream + flame LIVE dot,
│                                         │     on a double rule
│   TODAY'S COVER STORY                   │  ← Special Elite, 12px, --sl-muted
│                                         │
│   73–9                                  │  ← --sl-score: 78px mono, "73" --sl-flame,
│   ███████████████████░░  W-L PIPS       │     "9" cream; pip strip below
│                                         │     (81 tiny squares, flame=W, ink-outline=L)
│   "Soul on ice."                        │  ← marker pull-quote, --sl-press underline
│                          ╔═══════════╗  │
│   BEAT 96% OF THE FIELD  ║ RANK  #24 ║  │  ← rank STAMP: rotated +4°, flame fill,
│                          ╚═══════════╝  │     cream text, misregistration shadow,
│                                         │     overlaps the card's bottom-right edge
│  WORDS BY YOU · ISSUE No. 217           │  ← Special Elite byline/folio
│  [ SHARE ▶ ]   [ READ LEADERBOARD ]     │  ← flame primary + secondary
└───────────────────────────────────────┘
```

- The score is the hero number (Space Mono, tabular); rank is a die-cut **stamp** overlapping the bottom-right (the grid-break move).
- The **W/L pip strip** (81 squares) is the data-dense, legible element — flame for the 73 wins, ink-outlined for the 9 losses — reads instantly at thumbnail/share scale, reinforced by shape not just hue (colorblind-safe).
- The marker pull-quote ("Soul on ice.") and the `ISSUE No.` folio sell the *magazine cover* — this card **is** the share asset, a SLAM cover screenshotted into a group chat.

---

## 9. Tradeoffs & what it signals + the data-legibility guardrail

**What it signals.** Heritage, authenticity, basketball-as-*printed*-culture, "made by people who grew up reading SLAM at the barbershop." It's warmer and more nostalgic than post-modern's gaming/SNKRS edge — it reads as *editorial credibility* and *crate-digger cool* rather than *next-drop hype*. Like post-modern, it's distinctive in a sports-app field that is overwhelmingly conservative blue/grey or table-plain. It moves daily82 from *cozy puzzle* to *the daily issue you collect and post.*

**Tradeoffs.**
- Newsprint-warm + flame-red is friendlier and less polarizing than post-modern's black + acid, but it is **further from a "tech product" look** — it leans editorial/retro, which may read as less "premium app" to some.
- Five type voices (Anton / Archivo / Oswald / Permanent Marker / Special Elite + mono + sans) is a **richer font payload and more authoring discipline** than post-modern's three-tier system. Permanent Marker and Special Elite especially must be rationed or the page tips into kitsch.
- Newsprint texture, grain, halftone, and misregistration can hurt performance/accessibility if overdone or layered behind text.
- Two spot colors (flame + press) instead of one accent means **more chances to mis-color data** — the guardrail below is doing more work here than in post-modern.
- It is the more *retro* of the two siblings; that's the bet — heritage over futurism.

**The data-legibility guardrail (SACRED — restated, identical in spirit to post-modern §9):**
1. **The box score is sacred.** Stat grids, leaderboards, and any numeric tables use only `--sl-ink` on `--sl-stock` (or cream-on-ink on spreads), Space Mono with `font-variant-numeric:tabular-nums`, conventional left-to-right reading order, zebra via `--sl-news-2`. **No grit, no halftone, no grain, no rotation, no overlap, no spot-color cell fills inside data.** The grit lives *around* the data, never *in* it.
2. **Color carries decoration, not meaning, inside data** — except the two semantic pairs **W = `--sl-court`** and **L = `--sl-flame-deep`**, verified ≥4.5:1 on their surface *and* reinforced by shape (pip squares, +/− sign) for colorblind users. Never hue alone.
3. **Type on flame is always cream; type on press-yellow is always ink.** Never cream-on-yellow. (The two most common failures — enforced.)
4. **Only stamps, kickers, and capsules rotate/overlap.** Cards, tables, and the masthead stay upright and on-grid.
5. **Respect `prefers-reduced-motion`** — disable page-turn, marquee, grain/halftone animation, stamp pop, number-roll.
6. **Contrast floor 4.5:1** for text under 24px; the cover line (≥40px) may use the 3:1 large-text floor, but the ink/newsprint spine clears ~15:1 anyway. Flame small text (<16px) drops to `--sl-flame-deep`.
7. **Flame is the beacon; press-yellow is the second ink; everything else is rationed.** If everything shouts, nothing does. Secondary inks (violet/magenta/ink-blue) appear in small doses (tags, era theming), never as competing primaries.

---

## 10. Sources (fetched / searched)

- SLAM (magazine) — Wikipedia — https://en.wikipedia.org/wiki/Slam_(magazine)
- SLAM (magazine) — Grokipedia — https://grokipedia.com/page/Slam_(magazine)
- Slam magazine covers (1997–2019) — Fonts In Use — https://fontsinuse.com/uses/30724/slam-magazine-covers-1997-2019
- Slam magazine — Fonts In Use tag — https://fontsinuse.com/tags/22438/slam-magazine
- An Oral History of the Iconic Allen Iverson SLAM Cover — SLAM — https://slamonline.com/nba/an-oral-history-of-the-iconic-allen-iverson-slam-cover/
- Allen Iverson's iconic 'Slam' cover, 20 years later — Andscape — https://andscape.com/features/allen-iverson-slam-magazine-cover-soul-on-ice-20-years-later/
- SLAM Cover Gallery — https://covers.slamonline.com/
- The Source (magazine) — Wikipedia — https://en.wikipedia.org/wiki/The_Source_(magazine)
- How James Bernard and 'The Source' defined 1990s hip-hop — Andscape — https://andscape.com/features/james-bernard-source-magazine-1990s-hip-hop-rap-xxl-vibe-founders/
- The 50 Greatest Hip-Hop Magazine Covers — Complex — https://www.complex.com/music/2011/12/the-50-greatest-hip-hop-magazine-covers/
- Champion Gothic — Typewolf — https://www.typewolf.com/champion-gothic
- Champion Gothic in use — Fonts In Use — https://fontsinuse.com/typefaces/7483/champion-gothic
- Champion Gothic — Font Review Journal — https://fontreviewjournal.com/champion-gothic/
- Champion Gothic — Hoefler&Co. (Typography.com) — https://www.typography.com/fonts/champion-gothic/overview
- Knockout — Typewolf — https://www.typewolf.com/knockout
- Knockout in use — Fonts In Use — https://fontsinuse.com/typefaces/7238/knockout
- Trade Gothic — Typewolf — https://www.typewolf.com/trade-gothic
- League Gothic — Google Fonts — https://fonts.google.com/specimen/League+Gothic
- Ray Gun (magazine) — Wikipedia — https://en.wikipedia.org/wiki/Ray_Gun_(magazine)
- David Carson and the Rise of Grunge Typography — Hue & Eye — https://www.hueandeye.org/david-carson/
- Neville Brody — Hue & Eye — https://www.hueandeye.org/neville-brody/
- Inspired Design Decisions With Neville Brody — Smashing Magazine — https://www.smashingmagazine.com/2020/03/inspired-design-decisions-neville-brody/
- The Rise and Fall of AND1 — KHALHON — https://khalhon.com/blogs/community/sample-story
- Streetball's Future and Legacy: AND1 Celebrates 30 Years — https://and1.com/blogs/life/streetball-future-legacy
- Google Fonts CSS2 API (live availability + weight/width axis verification for Anton, Oswald, Archivo, Saira Condensed, Barlow Condensed, Bebas Neue, Fjalla One, Teko, Permanent Marker, Special Elite, Sedgwick Ave, Space Mono, Space Grotesk) — https://fonts.googleapis.com/css2
