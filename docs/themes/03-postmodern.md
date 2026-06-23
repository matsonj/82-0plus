# daily82 — Theme 03: POST-MODERN

> A bold, irreverent, culture-forward rebrand direction for **daily82** (daily82.com), the daily basketball draft puzzle. This replaces the current MotherDuck "cream paper / thick ink / orange duck" arcade look. It is implementable on the existing stack: Next.js App Router, Tailwind v4 (`@import "tailwindcss"`), CSS custom-property tokens in `app/globals.css`, fonts via `next/font/google`.

---

## 1. Vibe statement + mood board

**Vibe.** Basketball as culture, not just stats. This is the look of a midnight SNKRS drop, a Bleacher Report graphic in your group chat, and a City Edition jersey reveal — loud, confident, a little confrontational. Black-on-acid-green, compressed type cranked to poster scale, a grid that's been deliberately knocked off its axis, sticker and tape energy laid over halftone noise. It says *we know the box score cold, and we look this good doing it.* The maximalism is the brand; the legibility of the box score is the discipline that keeps it from being a poster you can't read.

**Mood board — named references and the specific element to borrow:**

| Reference | What I actually studied | The one move to steal |
|---|---|---|
| **Bleacher Report rebrand** (design.bleacherreport.com / Ishaan Mishra case study) | Druk (compressed display) + Effra body; black/white + **electric green** accent described as "the glow of scoreboards, the pulse of gaming interfaces, the neon undercurrent of streetwear." Card modules built for fast-scroll. | The whole spine: compressed display + neutral body + one electric accent, used as a "navigational beacon" amid visual noise. This is our north star. |
| **Nike "So Win" (Wieden+Kennedy, 2025)** | Custom Futura Extra **Bold Condensed** slogan, stacked/justified; quotes in tight Palatino; athlete names in neutral Helvetica Now. "Boldness itself as the aesthetic." | Three-tier type system (giant condensed shout / neutral data / optional editorial serif) and the **stacked, left-justified slab** of slogan type. |
| **NBA City Edition 2024–26** (nba.com reveals, SportsLogos.net) | Heat "Blood Red" + Heat Culture wordmark; Bulls arena-signage fonts + crossed-spotlight side panels; Lakers purple→black gradient "for a new generation." "Remix" = revive + reimagine local culture. | Team-as-graphic: a jersey-style **wordmark lockup**, gradient panels, and the idea that each team/era spin can recolor the UI. |
| **Hypebeast / streetwear lockups** (Supreme=Futura Bold Italic, Nike=Futura Cond. Extra Bold, Fear of God=Bebas) | Brand identity = one grotesk/condensed face, total confidence, no ornament. | The **box logo** instinct: tight, all-caps, monolithic wordmark you could screenprint. |
| **Risograph / zine** (riso guides, Spectrolite palettes) | 1–4 ink limited palette, semi-transparent **overprint** mixing, **halftone** dot shading, fluorescent pink/orange/green on uncoated stock, registration "errors." | Texture: halftone dots, overprint multiply layers, a hair of misregistration on stickers. Cheap, loud, handmade-but-digital. |
| **Brutalist / maximalist web** (Awwwards Brutalism collection, brutalistwebsites.com, neobrutalism roundups) | Type-as-hero, broken grids, clashing hyper-saturated color, exposed structure, hard borders + hard shadows, intentional "jarring." | **Break the grid**: oversized type that bleeds off-canvas, rotated stickers, overlap, exposed gridlines as decoration. |
| **Basketball-Reference / ESPN / NBA.com / Yahoo Sports** (baseline study) | Conservative: dense sortable tables, tabular numerals, zebra rows, blue links, neutral sans, conventional left-aligned stat columns, red/blue team accents. | What to **respect** (not subvert): tabular-figure alignment, scannable rows, a stable reading order for scores. We break the chrome, never the data table.|

---

## 2. Color palette

Strategy borrowed from B/R: a **near-black + off-white spine** carries all the type and data, **one electric accent** ("ACID") does the shouting, and a small set of **hyper-saturated clash colors** (riso/City-Edition energy) decorate stickers, capsules, and team/era theming. The current warm cream/orange world is retired entirely.

### Core tokens (replace the `--md-*` set)

| New token | Hex | Replaces | Role |
|---|---|---|---|
| `--pm-black` | `#0A0A0B` | `--md-ink` (#383838) | Near-black. All borders, default text, default page bg in dark mode, sticker outlines. Truer black than the old warm ink. |
| `--pm-ink` | `#16161A` | — | Slightly lifted black for raised surfaces on black bg. |
| `--pm-paper` | `#F2F0EB` | `--md-paper` (#f4efea) | Bone/newsprint off-white — cooler, less cozy than the old cream. Default light surface. |
| `--pm-paper-2` | `#E6E3DA` | `--md-paper-2` | Subtle stat-cell / zebra fill. |
| `--pm-paper-3` | `#D7D3C7` | `--md-paper-3` | Hairlines, muted dividers on paper. |
| `--pm-muted` | `#6E6E78` | `--md-ink-muted` (#818181) | Captions, labels, secondary text. |
| `--pm-white` | `#FFFFFF` | `--md-white` | Pure white card field for data tables (max contrast). |

### Accent + clash tokens

| New token | Hex | Replaces (nearest) | Role & rules |
|---|---|---|---|
| `--pm-acid` | `#C6FF00` | `--md-yellow` (#ffde00) | **THE signature.** Electric lime-green — scoreboard glow. Primary CTA fills, live/active states, the "82" highlight, rank badges. Use on black. |
| `--pm-acid-deep` | `#8FBF00` | — | Acid pressed/hover shadow color, focus rings on paper. |
| `--pm-flame` | `#FF3B1D` | `--md-coral` (#ff7169) | Hot red-orange — losses, alerts, "L" markers, destructive, hype callouts. (City Edition "Blood Red" energy.) |
| `--pm-magenta` | `#FF2E88` | — | Riso fluorescent pink — secondary stickers, tournament flair, overprint layer. |
| `--pm-cobalt` | `#2A2EE6` | `--md-blue` (#2ba5ff) | Deep electric blue — links inside data contexts (respects the sports-site link convention), info capsules. |
| `--pm-cyan` | `#21E6C1` | `--md-teal-bright` (#53dbc9) | Riso cyan/aqua — wins glow, positive net-rating, secondary CTA. |
| `--pm-violet` | `#7A3CFF` | `--md-sky` | Era/decade theming, "Flex" slot, premium/tournament. |
| `--pm-amber` | `#FF9E00` | `--md-orange` (#ff9538) | Warning/streak, kept only as a clash accent, never as brand primary (that was the duck). |

### Dark mode is the home base

Unlike the old paper-first look, **post-modern lives on black**. Default app background `--pm-black`; cards are either `--pm-ink` (dark surface) or `--pm-white` (data-table surface that "cuts out" of the black like a sticker). Acid green on black is the hero combination.

### WCAG / contrast notes — where the clash must yield

This is the discipline. Maximalism is allowed everywhere *except numbers you have to read*.

- **`--pm-acid #C6FF00` on `--pm-black`** ≈ 16.5:1 — excellent. Acid text/numbers on black is safe and is the recommended "hero number" combo.
- **`--pm-black` on `--pm-acid`** ≈ 16.5:1 — the inverse (black type on an acid CTA) is the **only correct way to put text on acid**. Never white-on-acid (fails badly, ~1.3:1).
- **`--pm-black` on `--pm-paper #F2F0EB`** ≈ 15.8:1 — body/data on paper is safe.
- **`--pm-white` on `--pm-black`** ≈ 19:1 — score tables: white-on-black or black-on-white only.
- **Clash colors are decoration, not data.** `--pm-magenta`, `--pm-violet`, `--pm-flame`, `--pm-cyan` are for stickers, capsules, fills, and accent bars — **not** for setting numeric values, table cells, or long text. If a value must be colored (W green / L red), use it on a black or white field and verify ≥ 4.5:1: `--pm-cyan #21E6C1` and `--pm-flame #FF3B1D` both pass on `--pm-black`; neither passes on `--pm-paper` for small text, so on light surfaces use `--pm-acid-deep`/a darkened flame `#C42008` for small W/L type.
- **Rule of thumb for tables:** the cell background is always `--pm-white` or `--pm-black`; color enters only as a left **status bar**, a dot, or a single bold figure — never as the cell fill behind small digits.

---

## 3. Typography

Three tiers, all on Google Fonts (verified), echoing the B/R (Druk+Effra) and Nike (Futura Cond. Bold + Helvetica) systems while keeping a **monospace** to honor daily82's box-score/data DNA.

### Families (all Google Fonts, verified)

| Tier | Family | Why | `next/font/google` |
|---|---|---|---|
| **Display** | **Archivo** (variable: weight Thin→Black, **width ExtraCondensed→Expanded**) | Free Druk/Futura-Condensed substitute. The width axis is the killer feature: compress to ~75–85% for jersey-shout headlines, run Black weight for poster type, expand for wordmarks. One family covers the whole "compressed bold" need. | `Archivo({ subsets:["latin"], axes:["wdth"], weight:"variable" })` |
| **Display alt** | **Anton** (single heavy condensed weight) | Optional poster face for the very biggest one-word shouts ("UNDEFEATED", "L"). 90s-tabloid/arena energy, single weight, ultra-cheap. Use sparingly. | `Anton({ subsets:["latin"], weight:"400" })` |
| **Mono / data** | **Space Mono** (700/400, italics) | **Keep it** — already in the app. It is the box-score voice: stat labels, tabular figures, kicker/eyebrow labels, the "82" reads. Tabular by nature; sports-data legible. | already loaded |
| **Sans / body** | **Space Grotesk** (300–700) | Replaces Inter. Shares Space Mono's DNA (it *is* the proportional cousin) so mono+sans feel like one system; more character than Inter, still UI-legible. Body copy, form fields, table values, names. | `Space_Grotesk({ subsets:["latin"], weight:["400","500","700"] })` |

> If you ever want the more neutral B/R-"Effra" feel for dense data instead of Space Grotesk's quirk, **Inter** remains a safe Google-Fonts fallback for table values only. Non-Google note: the *true* references (Druk, Futura Condensed, Effra) are commercial; Archivo + Anton + Space Grotesk are the open substitutes and what this guide specs.

### Type scale (px) — oversized hero → caption

Mobile-first; the hero is intentionally enormous and allowed to bleed off the right edge.

| Token | Size / line-height | Family + weight + width | Use |
|---|---|---|---|
| `--t-mega` | **112 / 0.86** (desktop 168) | Archivo Black, `wdth` 80, tracking −0.03em, UPPERCASE | Hero "UNDEFEATED." — bleeds off-canvas |
| `--t-h1` | 64 / 0.90 | Archivo 800, `wdth` 85, −0.02em, UPPERCASE | Section shouts, result score "73–9" |
| `--t-h2` | 40 / 0.95 | Archivo 800, `wdth` 90, −0.01em | Card titles, player names headline |
| `--t-h3` | 28 / 1.0 | Archivo 700, `wdth` 100 | Sub-headers |
| `--t-display-num` | **80 / 0.85** | Space Mono 700, tabular | The single hero number ("82", rank "#24") |
| `--t-eyebrow` | 12 / 1.2, tracking **0.22em** | Space Mono 700 UPPERCASE | Kickers: "DAILY CHALLENGE", "TODAY'S RESULT" |
| `--t-body` | 16 / 1.45 | Space Grotesk 400 | Paragraphs, descriptions |
| `--t-body-strong` | 16 / 1.45 | Space Grotesk 700 | Emphasis |
| `--t-stat-value` | 18 / 1.1 | Space Mono 700, tabular | Box-score numbers |
| `--t-stat-label` | 10 / 1.2, tracking 0.08em | Space Mono 400 UPPERCASE | Box-score labels (PTS, REB) |
| `--t-caption` | 12 / 1.3 | Space Grotesk 400 | Captions, footnotes |

### Mixing & casing rules

- **Display = always UPPERCASE, always tight** (negative tracking, line-height < 1). Compressed width is the signature; never set Archivo headlines at default width — push `wdth` down.
- **Mono = the data + the label voice.** All eyebrows/kickers and every number live in Space Mono. This is the thread back to the box-score identity and the discipline anchor.
- **Sans = the human voice.** Sentences, names, instructions in Space Grotesk, sentence case.
- **Never** set long body copy in the display face; never set numeric tables in the display face (use mono so digits align).
- Deliberate clash is encouraged in *headline lockups*: a giant Archivo word stacked directly on a tiny Space Mono eyebrow, no comfortable gap.

### The HERO treatment (replaces "Go 82–0." → "Go undefeated.")

The old hero was a polite centered headline + subtitle. The new hero is a **left-justified, off-grid type slab** that bleeds:

```
DAILY · NBA · ERA-SPIN          ← Space Mono 700, 12px, 0.22em, --pm-acid
                                   (eyebrow, sits on a thin acid rule)

GO                              ← Archivo Black, wdth 80, UPPERCASE,
UNDE                               --t-mega, --pm-paper on --pm-black,
FEATED.                            stacked 3 lines, last line bleeds
                                   off the right edge of the viewport.
                                   The period is set in --pm-acid.

FIVE SPINS. FIVE PLAYERS.       ← Space Grotesk 700, 16px, --pm-muted
ONE PERFECT SEASON.                Optional second line --pm-acid.

[ ▶ PLAY TODAY'S PUZZLE ]       ← acid CTA, black text (see §5)
```

- Word "UNDEFEATED" broken across lines is intentional brutalist line-breaking; on desktop set as two lines `GO UNDE / FEATED.` with the second line scaled to `--t-mega` desktop (168px) and clipped at the viewport edge.
- Behind it: a faint **halftone dot field** (`--pm-ink` dots on `--pm-black`) and one rotated **sticker** ("82" in a circle, see §7). Replaces the old radial sunbeam entirely.

---

## 4. Geometry

The current system's instincts (zero radius, hard offset shadows, visible strokes) are *kept and pushed harder* — neobrutalism is adjacent to post-modern — but we add overlap, rotation, and bleed.

- **Borders.** `2px` default (keep), `3–4px` on hero cards and primary CTAs. Always `--pm-black`. On black surfaces, borders become `--pm-paper` or `--pm-acid` outlines (sticker cut-out look).
- **Radius.** Still **zero** on cards, buttons, inputs, tables. *Exception:* circular stickers/badges (`border-radius: 50%`) and pill capsules (`border-radius: 999px`) — the post-modern world allows hard rectangles **and** full circles/pills, nothing in between. No soft 8px corners ever.
- **Shadows → "sticker shadow."** Keep hard offset (no blur) but make them louder and colored:
  - `--pm-shadow-sm: 3px 3px 0 0 var(--pm-black)`
  - `--pm-shadow-md: 5px 5px 0 0 var(--pm-black)`
  - `--pm-shadow-pop: 6px 6px 0 0 var(--pm-acid)` (acid drop-shadow for hero CTA / active cards)
  - Stickers can carry a *double* shadow: `4px 4px 0 var(--pm-magenta), 8px 8px 0 var(--pm-black)`.
- **Grid-breaking rules (the core move).**
  - Use a 12-col base grid, then **violate it on purpose**: hero type and one feature card bleed past the right margin; section eyebrows hang into the left gutter.
  - **Rotation:** stickers/capsules rotate `−4°` to `+6°`. Cards never rotate (keeps content readable); only decorative stickers do.
  - **Overlap:** the result-score sticker overlaps the card edge by ~24px; the team badge overlaps the player card corner.
  - **Exposed grid:** show 1px `--pm-paper-3` gridlines behind some sections as decoration (zine "registration marks" energy).
- **Spacing rhythm.** 4px base; scale `4 · 8 · 12 · 16 · 24 · 40 · 64 · 96`. Sections get generous vertical air (64–96) so the loud type has room; *inside* data cards, tighten to 8–12 for density (sports-table convention).

---

## 5. Component restyle table

For each component in the current inventory, the post-modern version. CSS sketches for the load-bearing ones.

| Component | Current | POST-MODERN restyle |
|---|---|---|
| **Header / logo** | Mono wordmark, paper bg | Black bar, full-bleed. Logo = **box-logo lockup**: "DAILY" + acid "82" in a tight Archivo-condensed cut, UPPERCASE, on black. Sticker-style, screenprintable. Streak/alerts bell becomes an acid dot. |
| **Hero** | Centered headline + subtitle, sunbeam | Off-grid bleeding type slab on black + halftone field + rotated "82" sticker (see §3, §8). |
| **Capsule / pill** (`.md-capsule`) | Yellow, square, mono, 2px ink | Pill (`border-radius:999px`), `--pm-acid` fill, black text + 2px black border, mono UPPERCASE. Variants recolor to clash tokens (magenta/cyan/violet) for tags/era/tournament. |
| **Card** (`.md-card` / `--lift`) | White, 2px ink, hard md shadow | Two species: **data card** = `--pm-white` field, 2–3px black border, `--pm-shadow-md` ("cut-out sticker" on black bg); **hype card** = `--pm-ink` dark field, acid border, `--pm-shadow-pop`. |
| **Buttons** (`.md-btn` + variants/sizes) | Yellow primary, hard shadow, translate-on-hover | Primary = acid fill / black text / black border / `--pm-shadow-md`; hover lifts to acid pop shadow; active slams flat. Secondary = paper/white. Ink = black field/acid text. Replace `--teal` with `--cyan`. Keep `lg`/`sm`. |
| **Text input** (`.md-input` arcade) | White, mono, uppercase high-score | Black field, acid caret + focus ring, mono. The `--name` high-score variant stays UPPERCASE tracked — it's *perfectly* on-brand (arcade leaderboard = streetwear receipt). |
| **Team badge** (`.md-badge`) | Orange square, mono | Jersey-chip: black square, team color as a top accent bar, abbreviation in compressed Archivo. Overlaps card corners. |
| **Sunbeam backdrop** (`.md-sunbeam`) | Yellow radial gradient | Replaced by **halftone dot field** + optional acid→black linear "court-light" gradient panel (City-Edition gradient nod). |
| **Slot reel** (`.md-spinning`) | Vertical flicker | Faster, harder mechanical reel with motion-blur streak + acid flash on lock-in + tiny shake (see §6). |
| **Stat grid** (`.md-statline` / `.md-stat`) | 5-col, ink gutters, paper cells, mono | Keep the 5-col mono grid (it works). Recolor: white cells on black gutters, mono tabular values, acid for the standout stat. **Legibility preserved** (see sketch). |
| **Scrollbar** (`.md-scroll`) | Ink thumb on paper | Acid thumb on black track, square. |
| **Leaderboard row** (new emphasis) | — | Black rows, white tabular figures, **acid rank chip** for the player's own row; flame for relegation/cut line. Status as left bar, never cell fill. |
| **Result share card** (new emphasis) | — | The flagship export: dark card, giant mono score, W/L pip strip, rotated "RANK #24" sticker. Designed to look like a screenshotted jersey tag in a group chat (see §8). |

### CSS sketches

**Design tokens (drop-in head of `app/globals.css`)**

```css
:root {
  --pm-black:#0A0A0B; --pm-ink:#16161A;
  --pm-paper:#F2F0EB; --pm-paper-2:#E6E3DA; --pm-paper-3:#D7D3C7;
  --pm-muted:#6E6E78; --pm-white:#FFFFFF;
  --pm-acid:#C6FF00; --pm-acid-deep:#8FBF00;
  --pm-flame:#FF3B1D; --pm-magenta:#FF2E88; --pm-cobalt:#2A2EE6;
  --pm-cyan:#21E6C1; --pm-violet:#7A3CFF; --pm-amber:#FF9E00;

  --pm-shadow-sm:3px 3px 0 0 var(--pm-black);
  --pm-shadow-md:5px 5px 0 0 var(--pm-black);
  --pm-shadow-pop:6px 6px 0 0 var(--pm-acid);

  --font-display: var(--font-archivo), "Arial Narrow", sans-serif;
  --font-mono: var(--font-space-mono), Menlo, ui-monospace, monospace;
  --font-sans: var(--font-space-grotesk), Inter, system-ui, sans-serif;
}
body { background:var(--pm-black); color:var(--pm-paper); font-family:var(--font-sans); }
```

**Button**

```css
.pm-btn{
  display:inline-flex; align-items:center; gap:8px;
  padding:14px 26px; border:2px solid var(--pm-black);
  background:var(--pm-acid); color:var(--pm-black);
  font-family:var(--font-mono); font-weight:700; font-size:14px;
  text-transform:uppercase; letter-spacing:0.06em; line-height:1;
  box-shadow:var(--pm-shadow-md); cursor:pointer;
  transition:transform .08s ease, box-shadow .08s ease;
}
.pm-btn:hover{ transform:translate(-2px,-2px); box-shadow:var(--pm-shadow-pop); }
.pm-btn:active{ transform:translate(2px,2px); box-shadow:0 0 0 0 var(--pm-black); }
.pm-btn--secondary{ background:var(--pm-paper); }
.pm-btn--ink{ background:var(--pm-black); color:var(--pm-acid); border-color:var(--pm-acid); }
.pm-btn--lg{ padding:18px 36px; font-size:18px; }
.pm-btn--sm{ padding:8px 14px; font-size:12px; box-shadow:var(--pm-shadow-sm); }
```

**Card (cut-out sticker on black) + hype variant**

```css
.pm-card{ background:var(--pm-white); color:var(--pm-black);
  border:3px solid var(--pm-black); box-shadow:var(--pm-shadow-md); }
.pm-card--hype{ background:var(--pm-ink); color:var(--pm-paper);
  border-color:var(--pm-acid); box-shadow:var(--pm-shadow-pop); }
```

**Capsule (pill)**

```css
.pm-capsule{ display:inline-flex; align-items:center; gap:6px;
  padding:5px 14px; border-radius:999px; border:2px solid var(--pm-black);
  background:var(--pm-acid); color:var(--pm-black);
  font-family:var(--font-mono); font-weight:700; font-size:12px;
  text-transform:uppercase; letter-spacing:0.06em; }
.pm-capsule--magenta{ background:var(--pm-magenta); color:var(--pm-white); }
.pm-capsule--cyan{ background:var(--pm-cyan); }
.pm-capsule--violet{ background:var(--pm-violet); color:var(--pm-white); }
```

**Stat grid — maximalism yields to legibility here**

```css
.pm-statline{ display:grid; grid-template-columns:repeat(5,1fr);
  gap:2px; background:var(--pm-black); border:2px solid var(--pm-black); }
.pm-stat{ background:var(--pm-white); color:var(--pm-black);
  padding:8px 4px; text-align:center; }
.pm-stat__label{ font-family:var(--font-mono); font-size:10px;
  text-transform:uppercase; letter-spacing:0.08em; color:var(--pm-muted); }
.pm-stat__value{ font-family:var(--font-mono); font-weight:700;
  font-size:18px; font-variant-numeric:tabular-nums; }
/* ONE standout cell only — never color every cell */
.pm-stat--hero{ background:var(--pm-black); color:var(--pm-acid); }
```

**Hero number / score**

```css
.pm-score{ font-family:var(--font-mono); font-weight:700;
  font-size:80px; line-height:0.85; letter-spacing:-0.02em;
  font-variant-numeric:tabular-nums; color:var(--pm-acid); }
.pm-score .loss{ color:var(--pm-flame); }
```

**Leaderboard row (legibility-first)**

```css
.pm-row{ display:grid; grid-template-columns:48px 1fr auto;
  align-items:center; gap:12px; padding:10px 14px;
  background:var(--pm-black); color:var(--pm-paper);
  border-bottom:1px solid var(--pm-ink);
  font-variant-numeric:tabular-nums; }
.pm-row__rank{ font-family:var(--font-mono); font-weight:700; }
.pm-row--me{ background:var(--pm-acid); color:var(--pm-black); } /* your row pops */
.pm-row--cut{ box-shadow:inset 4px 0 0 var(--pm-flame); }       /* status as LEFT BAR */
```

---

## 6. Motion

Fast, mechanical, kinetic — "meme speed without losing integrity" (B/R). Everything snaps; nothing eases slowly.

- **Slot reel spin.** Upgrade `.md-spinning`: a fast vertical scroll (≈120ms/cycle) with a `blur(2px)` motion streak while spinning, then a hard **lock-in**: snap to position, 80ms acid flash on the cell border, and a 2px shake (`translateX` ±2px, 2 cycles). The lock should feel like a buzzer.
- **Button hover.** Keep the translate(−2,−2) lift but change the shadow to acid pop on hover; active "slams" to translate(2,2) flat (already in §5 sketch). Snappy 80ms, no smooth easing.
- **Transitions / page.** Hard cuts and **wipes**, not fades. New views wipe in from the left with an acid leading edge (scoreboard-ticker feel). Respect `prefers-reduced-motion` — fall back to instant.
- **Marquee.** A looping **ticker** under the header for live/daily context ("TODAY'S PUZZLE · 4,182 PLAYERS · BEST 81–1 · ...") in Space Mono, acid on black, `animation: scroll-x 30s linear infinite`. The signature ambient motion.
- **Number roll.** Scores/ranks count up on reveal (tabular mono, ≈600ms). The final result score "rolls" to 73–9 like a scoreboard.
- **Sticker pop.** Result/rank stickers enter with a small overshoot scale (1.0→1.08→1.0) + their rotation. Confetti is off-brand; use a single acid radial "flashbulb" on a win instead.
- **Noise/grain.** A subtle animated film-grain overlay (very low opacity) over hero/dark sections only — keep it off data tables.

---

## 7. Iconography / imagery / texture

- **Stickers / cut-outs.** Core device. Circular "82" stamp, rank chips, "DAILY" tags — all look die-cut: thick outline, slight rotation, hard offset shadow, occasional `--pm-magenta`/`--pm-black` double shadow for the misregistered-print look.
- **Halftone.** Replace gradients/the sunbeam with **halftone dot fields** (CSS `radial-gradient` dot pattern, or a PNG) behind hero and dark sections. Riso energy, cheap to ship.
- **Overprint.** Where two colored shapes overlap (sticker on capsule), use `mix-blend-mode: multiply` so they create a third hue — the riso overprint trick. Great for the era/team color collisions.
- **Tape.** Section dividers and "pinned" callouts can use a semi-transparent **tape strip** graphic (rotated, torn edges) — zine pinboard feel.
- **Iconography.** Monoline, 2px stroke, square caps, black/acid — utilitarian, matching the borders. No rounded friendly icons (that was the duck era). Sport pictograms (ball, net, whistle) as bold filled glyphs.
- **Imagery.** If/when player imagery appears: high-contrast **duotone** (black + one accent), grain over it, cut-out silhouettes that bleed off cards — Bleacher Report / SNKRS treatment. Avoid soft photographic gradients.
- **Numbers as graphics.** Jersey numbers and box-score figures are themselves decoration — set giant, tracked, bleeding off edges.

---

## 8. Homepage walkthrough — before → after

### Mobile hero

**Before (current):** cream `--md-paper` background, soft yellow radial sunbeam, centered Space-Mono headline "Go 82–0." with subtitle "A DAILY BASKETBALL DRAFT PUZZLE," a yellow primary button. Polite, warm, symmetrical.

**After (post-modern):**
- Background `--pm-black` with a faint halftone dot field and a single film-grain layer.
- Eyebrow top-left: `DAILY · NBA · ERA-SPIN` in acid Space Mono, 12px, 0.22em, sitting on a 2px acid rule.
- Headline left-justified, stacked, UPPERCASE Archivo Black at `wdth:80`:
  **`GO`** / **`UNDE`** / **`FEATED.`** — the last line scaled up and clipped at the right viewport edge; the period in `--pm-acid`.
- A rotated circular **"82" sticker** (`−6°`, acid fill, black outline, double shadow) overlapping the headline's top-right.
- Sub-line in Space Grotesk 700: "FIVE SPINS. FIVE PLAYERS. **ONE PERFECT SEASON.**" (last clause acid).
- Primary CTA: `[ ▶ PLAY TODAY'S PUZZLE ]` — acid fill, black text, `--pm-shadow-md`.
- A thin acid ticker marquee pinned below the header.

### The "Daily Challenge / Today's Result 73-9 / Rank #24" card

**Before:** a white `.md-card` with `--lift` shadow, mono labels, a yellow capsule, ink text on cream. Tidy and quiet.

**After — a `pm-card--hype` (dark) with cut-out energy:**

```
┌───────────────────────────────────────┐  ← --pm-ink field, 3px acid border,
│  DAILY CHALLENGE            ● LIVE      │     --pm-shadow-pop
│  ───────────────────────────────────   │  ← eyebrow: Space Mono acid + acid LIVE dot
│                                         │
│   TODAY'S RESULT                        │  ← Space Mono 10px, --pm-muted
│                                         │
│   73–9                                  │  ← --pm-score: 80px mono, "73" acid,
│   ████████░  W-L PIPS                   │     "9" in --pm-flame; pip strip below
│                                         │     (81 tiny squares, acid=W flame=L)
│                          ╔═══════════╗  │
│   BEAT 96% OF THE FIELD  ║ RANK  #24 ║  │  ← rank sticker: rotated +4°, acid fill,
│                          ╚═══════════╝  │     black text, hard shadow, overlaps edge
│                                         │
│  [ SHARE ▶ ]   [ SEE LEADERBOARD ]      │  ← acid primary + secondary
└───────────────────────────────────────┘
```

- The score is the hero; rank is a die-cut sticker overlapping the card's bottom-right corner (overlap = the grid-break move).
- W/L **pip strip** (81 squares) is the data-dense, legible element — acid for wins, flame for the 9 losses — reads instantly even at thumbnail/share scale.
- The whole card is sized to be screenshotted and dropped in a group chat (it *is* the share asset) — jersey-tag-in-the-wild.

---

## 9. Tradeoffs & what it signals + usability guardrails

**What it signals.** Confidence, youth, basketball-as-culture, "this is made by people who watch ball and know design." It moves daily82 from *cozy puzzle* to *hype daily ritual you screenshot and post.* It's distinctive in a sports-app field that is overwhelmingly conservative blue/grey (ESPN/Yahoo) or table-plain (Basketball-Reference).

**Tradeoffs.**
- Black-first + acid is polarizing and high-energy; it asks more of the user's eyes than the cozy cream did. Mitigated by keeping data surfaces white/black and reserving clash color for decoration.
- Archivo-condensed UPPERCASE headlines are gorgeous but can't carry long copy — body must stay in Space Grotesk sentence case.
- Maximalist motion (marquee, grain, wipes) can feel busy or hurt performance/accessibility if overdone.
- It's further from the MotherDuck parent brand — intentional (the brief: stop looking "too Claude-themed"), but worth a deliberate decision.

**Guardrails for usability (where maximalism yields to function):**
1. **The box score is sacred.** Stat grids, leaderboards, and any numeric tables use only black-on-white or white/acid-on-black, Space Mono with `font-variant-numeric: tabular-nums`, conventional left-to-right reading order, zebra via `--pm-paper-2`. No rotation, no overlap, no clash-color cell fills inside data.
2. **Color carries decoration, not meaning, inside data** — except the two semantic pairs W=`--pm-cyan`/`--pm-acid` and L=`--pm-flame`, which must be verified ≥4.5:1 on their surface and *also* reinforced by shape (pip squares, +/− sign) for colorblind users. Never rely on hue alone.
3. **Text on acid is always black.** Never white. (Enforced; it's the most common failure.)
4. **Only stickers and capsules rotate/overlap.** Cards and tables stay upright and on-grid.
5. **Respect `prefers-reduced-motion`** — disable marquee, grain animation, wipes, number-roll; fall back to static.
6. **Contrast floor 4.5:1** for any text under 24px; the hero display (≥40px) may use the 3:1 large-text floor but our spine colors clear 15:1 anyway.
7. **One accent does the shouting.** Acid is the beacon; if everything is loud nothing is. Clash colors appear in small doses (tags, era theming), not as competing primaries.

---

## 10. Sources (fetched / searched)

- Basketball-Reference — https://www.basketball-reference.com/ (baseline data conventions; sortable tables, vertical nav)
- Sports-Reference table tips — https://www.sports-reference.com/blog/2017/04/video-sports-reference-table-tips-and-tricks/
- Bleacher Report rebrand case study (Ishaan Mishra) — https://www.ishaanmishra.com/project/bleacher-report-rebrand-2
- Bleacher Report design site — https://design.bleacherreport.com/
- Nike "So Win" / Wieden+Kennedy — https://www.wk.com/work/nike-so-win/
- Nike "So Win" type breakdown (Fonts In Use) — https://fontsinuse.com/uses/66724/nike-so-win-campaign
- Nike "Like a Lioness" typography (Creative Review) — https://www.creativereview.co.uk/nike-london-like-a-lioness-typography/
- W+K Berlin Nike (It's Nice That) — https://www.itsnicethat.com/news/studio-yukiko-wieden-plus-kennedy-nike-graphic-design-061117
- NBA 2025-26 City Edition reveal — https://www.nba.com/news/2025-26-nike-city-edition-uniforms-unveiled
- NBA 2024-25 City Edition explained — https://www.dickssportinggoods.com/protips/sports-and-activities/fan-shop/2024-25-nba-city-edition-jerseys-explained
- SportsLogos.net City Edition breakdowns — https://news.sportslogos.net/2024/11/14/nba-officially-launches-2024-25-city-edition-uniform-program/basketball/ , https://news.sportslogos.net/2025/08/02/breaking-down-the-nbas-2025-26-city-edition-remix-uniforms-teaser/basketball/
- Hypebeast streetwear fonts (Gridfiti) — https://gridfiti.com/hypebeast-fonts/
- Brutalism collection (Awwwards) — https://www.awwwards.com/awwwards/collections/brutalism/
- Brutalist web design guide (Cider House) — https://ciderhouse.media/brutalism-a-guide-to-architecture-web-design/
- Neo-brutalism 2025 (Clover Technology) — https://www.clovertechnology.co/insights/how-neo-brutalism-took-over-digital-design-in-2025
- Fonts for neobrutalist web design (Kristi.Digital) — https://blog.kristi.digital/p/my-favourite-fonts-for-neobrutalist-web-design
- Druk free alternatives (FontAlternatives) — https://fontalternatives.com/alternatives/druk/with/condensed/
- Typewolf — best Google Fonts — https://www.typewolf.com/google-fonts
- Archivo (Google Fonts specimen) — https://fonts.google.com/specimen/Archivo
- Archivo (Wikipedia — variable axes) — https://en.wikipedia.org/wiki/Archivo
- Space Grotesk (Google Fonts) — https://fonts.google.com/specimen/Space%20Grotesk
- Risograph printing guide (Reprographix) — https://reprographix.ink/risograph-printing/guide/
- Riso color best practices (Spectrolite) — https://spectrolite.app/how-to/color/best-practices
- Riso ink explained — https://www.inkchameleon.com/riso-ink-explained-colors-types-differences-html
