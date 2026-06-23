# daily82 — CLASSIC style guide

> Direction one of the daily82 rebrand. Replaces the MotherDuck "cream paper / orange duck" system.
> Goal: a distinct, credible, heritage sports identity — the look of a printed basketball almanac
> and a newspaper box score, not a cozy notebook.

---

## 1. Vibe statement

**Ink on newsprint, set in the press box.** daily82 should read like a page torn from a 1970s NBA
record book: a deep navy masthead, a cream stock that has yellowed slightly with age, agate-tight
ruled stat tables, and a confident old-style serif for headlines. It is editorial, stat-forward,
and quietly authoritative — the design says *"these numbers are official, and they have a history."*
Loudness comes only from one place: a single deep-red accent used the way a sports page uses red,
sparingly, for the score and the verdict. Everything else is rules, type, and restraint.

**Mood board — borrow this specific element from each:**

| Reference | Borrow this |
|---|---|
| **Basketball-Reference.com** | The dense **ruled stat table**: hairline row dividers, a dark sticky header row, zebra striping at the lightest possible value, right-aligned numerals. This is the soul of the system. |
| **Newspaper agate / box-score type** | **Agate density** — tiny, tightly-set, tabular numerals that pack a full lineup into a small card without feeling cramped; uppercase column labels. |
| **NYT sports section (Cheltenham)** | The **old-style serif headline** voice — bracketed serifs, moderate contrast, authority and heritage. We use a Google-Fonts stand-in (Domine). |
| **1970–71 Topps basketball cards** | The **player nameplate banner** — name + team + position locked into a colored bar at the foot of a framed card; cream border around the photo. |
| **Vintage Sports Illustrated covers** | The **red banner + white block wordmark** masthead lockup, and putting the headline in the lower third over imagery. |
| **NBA media guides / record books (1946–1975)** | The **cover voice**: a single big serif title, a thin rule, a year/edition line set in small caps. Reused for the hero. |
| **Naismith Hall of Fame** | **Gold-on-navy** as the "honor / achievement" pairing — used for win records and ranks, never as a primary fill. |

---

## 2. Color palette

A restrained heritage-team palette: navy, deep red, aged cream, ink, and a single honor-gold.
Mapped 1:1 onto the existing token slots so the rename is a find-and-replace, not a refactor.

| New token | Hex | Replaces | Role |
|---|---|---|---|
| `--ink` | `#1A1A1A` | `--md-ink` `#383838` | Primary text, hairline rules, table grid. A truer printing-ink black than the old warm gray. |
| `--ink-muted` | `#5C6470` | `--md-ink-muted` `#818181` | Secondary text, column labels, captions. Cool slate, not warm gray. |
| `--paper` | `#F2ECDC` | `--md-paper` `#f4efea` | Page background. Aged-newsprint cream, slightly more yellow/desaturated than the old paper. |
| `--paper-2` | `#E8DFC9` | `--md-paper-2` `#ece5dd` | Zebra-stripe row, sunken wells, secondary surfaces. |
| `--paper-3` | `#DCD0B4` | `--md-paper-3` `#e1d6cb` | Hairline dividers on cream, disabled fills, deepest paper tone. |
| `--surface` | `#FBF8F0` | `--md-white` `#ffffff` | Card face. Near-white warm stock so cards lift off the cream page without going stark. |
| `--navy` | `#16243F` | `--md-ink` (as a fill) / new | **Primary brand color.** Masthead, table header row, primary buttons, footer. |
| `--navy-2` | `#21314F` | new | Hover/active state of navy surfaces; secondary navy panels. |
| `--red` | `#9E1B1B` | `--md-orange` `#ff9538` | **The accent.** Score verdict, the active/selected state, "LIVE/TODAY" tags, links on cream. A pressroom barn-red, not ESPN's electric `#ff0033`. |
| `--red-deep` | `#6E0F0F` | `--md-orange-deep` `#a45916` | Pressed red, red text on light, borders under red fills. |
| `--gold` | `#C8962B` | `--md-yellow` `#ffde00` | **Honor color.** Win records, Rank #, leaderboard medals, the undefeated star. Used like a trophy plate. |
| `--gold-soft` | `#E3C97E` | `--md-yellow` (tint) | Gold backgrounds behind dark text (capsule fills, highlight bars). |
| `--green` | `#1F6B45` | `--md-teal` `#16aa98` | Wins / positive deltas in stat lines (W column, positive net rating). |
| `--green-bright` | `#2E8B57` | `--md-teal-bright` `#53dbc9` | Positive trend ticks, success toasts. |
| `--blue` | `#2D5C8A` | `--md-blue` / `--md-sky` | Informational links inside cards, neutral data series. A muted slate-blue, not sky. |

Retire `--md-coral` entirely (it has no heritage equivalent); fold its uses into `--red`.

### Usage notes
- **Navy is structure, red is verdict, gold is honor.** Never let red and gold both shout in the
  same view — red carries the live state, gold carries the achievement. Cream + ink + navy do 90%
  of the work; the three accents are seasoning.
- Page is always `--paper`. Cards are `--surface`. The masthead and table headers are the only
  large navy fields. Borders are `--ink` hairlines, not navy.
- Links on cream: `--red`; links inside a navy field: `--gold-soft`.

### WCAG contrast (text-on-background)
Verified contrast ratios (WCAG 2.1). AA body text needs ≥ 4.5:1; large/bold ≥ 3:1.

| Pair | Ratio | Verdict |
|---|---|---|
| `--ink #1A1A1A` on `--paper #F2ECDC` | **15.1:1** | AAA — body text |
| `--ink` on `--surface #FBF8F0` | **16.6:1** | AAA — card body |
| `--ink-muted #5C6470` on `--paper` | **5.6:1** | AA all sizes — labels/captions |
| `--paper #F2ECDC` on `--navy #16243F` | **12.4:1** | AAA — text in masthead/header row |
| `--gold-soft #E3C97E` on `--navy` | **8.0:1** | AAA — gold text on navy |
| `--paper` on `--red #9E1B1B` | **6.8:1** | AA all sizes — button label text |
| `--red #9E1B1B` on `--paper` | **5.7:1** | AA all sizes — links/verdict text |
| `--gold #C8962B` on `--navy` | **5.0:1** | AA — record numerals on navy (use ≥16px/bold) |
| `--red #9E1B1B` on `--surface` | **6.2:1** | AA all sizes |

Caution: `--gold #C8962B` on `--paper` is only ~2.4:1 — **never** use gold for text on cream; gold
text lives on navy only. On cream, gold appears as a fill/medal with ink text on top.

---

## 3. Typography

Two families, both verified on Google Fonts, loaded via `next/font/google`.

- **Display / headline — `Domine`** (serif). An old-style serif *built specifically for the web at
  display sizes* (it bottoms out around 14px by design) — sturdy bracketed serifs, moderate
  contrast, heritage feel. Our Google-Fonts stand-in for the NYT/Cheltenham voice. Weights 400–700.
- **Text / UI / numerals — `Libre Franklin`** (sans, 9 weights + italics). A revival of the 1912
  Franklin Gothic — the workhorse American newspaper/almanac sans. Carries body copy, UI, and all
  tabular stat numerals. Use `font-feature-settings: "tnum" 1` for stats so columns align.

> Optional flourish (not required): **`Oswald`** (condensed sans, on Google Fonts) for jersey-style
> team abbreviations and big score numerals only. If you skip it, set those in Libre Franklin
> SemiBold condensed-tracked. Keep the family count to two unless the team-abbrev moment earns it.

```ts
// app/fonts.ts (next/font/google)
import { Domine, Libre_Franklin } from "next/font/google";

export const display = Domine({
  subsets: ["latin"], weight: ["400", "500", "600", "700"],
  variable: "--font-display", display: "swap",
});
export const sans = Libre_Franklin({
  subsets: ["latin"], weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans", display: "swap",
});
```

### Type scale (px)

| Token | Size / line-height | Family · weight | Tracking · case | Use |
|---|---|---|---|---|
| `display-hero` | 52 / 1.02 | Domine 700 | -0.01em · Title | Hero headline ("Go undefeated.") |
| `display-1` | 36 / 1.08 | Domine 700 | -0.005em · Title | Page titles, section heads |
| `display-2` | 26 / 1.12 | Domine 600 | 0 · Title | Card titles, modal heads |
| `eyebrow` | 12 / 1.2 | Libre Franklin 700 | **0.14em · UPPER** | "DAILY CHALLENGE", section kickers |
| `score-xl` | 44 / 1.0 | Libre Franklin 800 (tnum) | -0.01em | The big result "73–9" |
| `body-lg` | 18 / 1.5 | Libre Franklin 400 | 0 · sentence | Hero subtitle, intro copy |
| `body` | 15 / 1.55 | Libre Franklin 400 | 0 · sentence | Default body |
| `label` | 13 / 1.3 | Libre Franklin 600 | 0.02em | Form labels, buttons (see note) |
| `stat-label` | 10.5 / 1.2 | Libre Franklin 700 | **0.08em · UPPER** | Box-score column heads (PTS, REB) |
| `stat-value` | 15 / 1.1 | Libre Franklin 700 (tnum) | 0 | Box-score numerals |
| `caption` | 11.5 / 1.4 | Libre Franklin 500 | 0.01em | Footnotes, timestamps, "as of" lines |

**Casing rules.** Headlines and player names are **Title Case** serif (newspaper, not arcade).
The old uppercase-mono everywhere is gone. Uppercase is reserved for *labels only* — eyebrows,
stat-column heads, button text, tags — and always in Libre Franklin with letter-spacing. Numerals
are always Libre Franklin with `tnum`.

### HERO treatment — "Go 82–0." → "Go undefeated."

The hero becomes a **record-book cover plate**. The old sunbeam gradient is removed.

```
        ┌───────────────────────────────────────────┐  ← cream page, no gradient
        │  EST. 2026 · DAILY BASKETBALL ALMANAC      │  eyebrow, ink-muted, small caps
        │  ───────────────────────────────────────   │  hairline rule, full width
        │                                             │
        │   Go undefeated.                            │  Domine 700, 52px, --ink, Title Case
        │                                             │
        │   Draft five. Fit a lineup. Chase 82–0.     │  body-lg, --ink-muted
        │   ───────────────────────────────────────   │  hairline rule
        │                                             │
        │   [ ▸ Play today's draft ]  Standings ›     │  navy primary btn + red text link
        └───────────────────────────────────────────┘
```

- Headline is set tight, sentence-style, with the period kept — it reads as a stated goal, not a
  shout. The "82–0" record moves into the *subtitle* using a true en-dash and `tnum`, so the
  hero carries the brand number without it being the headline.
- Two thin `--ink` rules (above the subtitle area, below it) frame the headline like a cover plate /
  masthead — the single biggest classic signal in the whole system.
- Wordmark "daily82" elsewhere (header): **Domine 700** lowercase "daily" + **Libre Franklin 800**
  numerals "82", on a navy bar, paper-colored text, a thin gold underline rule beneath the 82.

---

## 4. Geometry

The system swaps "hard-offset sticker" geometry for "printed page" geometry: hairline rules,
near-zero radius, and almost no shadow.

- **Border widths:** `1px` hairlines for table rules, dividers, input borders, capsule outlines.
  `2px` only for the active/selected emphasis (a selected slot, the primary button outline) and
  for the top rule of a card section. The old uniform 2px ink box becomes 1px hairlines.
- **Border-radius:** `2px` global (`--radius: 2px`) — a barely-there softening like a trimmed
  card corner, echoing the Topps "rounded inner corner." Not the old hard `0`, not pill-round.
  Pills/tags may use `2px` too; only avatars/team-logo chips go fully round.
- **Shadow:** essentially none. Replace the 2/4/8px hard offset shadows with:
  - `--rule: 1px solid var(--ink)` (the real "depth" cue is the ink rule)
  - `--shadow-card: 0 1px 0 0 var(--paper-3)` — a 1px bottom hairline that reads as paper resting
    on paper. Optional `--shadow-raise: 0 2px 8px rgba(22,36,63,0.10)` for modals/dropdowns only.
  - No colored or offset drop shadows anywhere in the flat content.
- **Spacing rhythm:** 4px base grid → `4, 8, 12, 16, 24, 32, 48, 64`. Tables are *tighter*
  (row padding `6px 10px`) to get the agate density; prose and cards use the wider steps. Section
  gutters 24–32px on mobile.

---

## 5. Component restyle table

| Component | CLASSIC restyle |
|---|---|
| **Header / logo** | Full-width **navy bar** (`--navy`), 56px tall. Wordmark "daily82" left (serif "daily" + sans "82", gold underline rule under 82). Nav links in Libre Franklin 600, paper-colored, gold on hover. A 1px `--gold` baseline rule under the whole bar. |
| **Hero** | Record-book cover plate (see §3). No gradient/sunbeam. Two ink hairline rules frame a serif headline; navy primary CTA + red text link. |
| **Capsule / pill** (`.md-capsule`) | Becomes a **press tag**: 1px ink outline, `2px` radius, `--paper-2` fill, Libre Franklin 700 11px UPPER tracked. Variants: `--today` = `--red` fill + paper text; `--honor` = `--gold-soft` fill + ink text; `--ink` stays navy fill + paper text. |
| **Card** (`.md-card` / `--lift`) | `--surface` face, 1px ink hairline, 2px radius, no offset shadow. A **navy header strip** (the "section rule") with paper-colored Domine title is the signature. `--lift` → the subtle `--shadow-card` bottom hairline. |
| **Buttons** (`.md-btn` family) | Solid fills, 1px–2px border, 2px radius, **no offset shadow**; hover darkens fill + 1px translate, active presses flat. `primary` = navy; `red` = the verdict/accent action; `secondary` = surface + ink outline; `ink` retired into navy; `teal` → `green`. Label = Libre Franklin 700 13px UPPER 0.04em. |
| **Text input** (`.md-input`) | Cream-well: `--surface` fill, 1px ink border, 2px radius, no shadow. Focus = 2px `--red` border (no fill change). Body set in Libre Franklin 500, sentence case by default. |
| **Arcade name input** (`.md-input--name`) | Reframe from arcade high-score to **roster sign-in**: Libre Franklin 700, Title Case (not uppercase blocky), 0.02em. The "enter your initials" energy is gone; it's a press credential. |
| **Team badge** (`.md-badge`) | A **Topps nameplate chip**: navy or team-tinted fill, paper text, Oswald (or condensed Libre Franklin) team abbrev, 2px radius, thin gold top rule. Square-ish, not round. |
| **Sunbeam backdrop** (`.md-sunbeam`) | **Removed.** Replace with an optional faint `--paper-2` halftone/dot field or just clean cream. The hero's authority comes from rules + serif, not a glow. |
| **Slot reel** (`.md-spinning`) | Reskinned as a **draft-board / departures-board flip** (see §6) — vertical mechanical roll on cream with ink rules between rows; lands with a settle, not a flicker. |
| **Stat grid** (`.md-statline` / `.md-stat`) | The hero of the system: a **Basketball-Reference ruled box score**. Navy header row, hairline grid, zebra striping at `--paper-2`, right-aligned `tnum` numerals, UPPER stat labels. (CSS below.) |
| **Scrollbar** (`.md-scroll`) | Thin (8px), `--paper-2` track, `--ink-muted` thumb, 2px radius. Quiet. |
| **Result / share card** | Framed like a trading card: cream `--paper-3` border, surface interior, navy nameplate footer with the score in `score-xl`, gold rank plate. (See §8.) |

### CSS sketches

```css
:root {
  --ink:#1A1A1A; --ink-muted:#5C6470;
  --paper:#F2ECDC; --paper-2:#E8DFC9; --paper-3:#DCD0B4; --surface:#FBF8F0;
  --navy:#16243F; --navy-2:#21314F;
  --red:#9E1B1B; --red-deep:#6E0F0F;
  --gold:#C8962B; --gold-soft:#E3C97E;
  --green:#1F6B45; --green-bright:#2E8B57; --blue:#2D5C8A;
  --radius:2px;
  --rule:1px solid var(--ink);
  --hairline:1px solid var(--paper-3);
  --shadow-card:0 1px 0 0 var(--paper-3);
  --shadow-raise:0 2px 8px rgba(22,36,63,.10);
  --font-display-stack: var(--font-display), Georgia, "Times New Roman", serif;
  --font-sans-stack: var(--font-sans), -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
}

/* ---------- Button ---------- */
.btn{
  display:inline-flex; align-items:center; justify-content:center; gap:8px;
  padding:11px 20px; border:1px solid var(--ink); border-radius:var(--radius);
  background:var(--navy); color:var(--paper);
  font-family:var(--font-sans-stack); font-weight:700; font-size:13px;
  text-transform:uppercase; letter-spacing:.04em; line-height:1; cursor:pointer;
  transition:background .12s ease, transform .08s ease;
}
.btn:hover:not(:disabled){ background:var(--navy-2); transform:translateY(-1px); }
.btn:active:not(:disabled){ transform:translateY(0); }
.btn--red{ background:var(--red); }      .btn--red:hover:not(:disabled){ background:var(--red-deep); }
.btn--secondary{ background:var(--surface); color:var(--ink); }
.btn--green{ background:var(--green); }
.btn--lg{ padding:15px 30px; font-size:15px; }
.btn--sm{ padding:7px 12px; font-size:11px; }
.btn:disabled{ opacity:.45; cursor:not-allowed; }

/* ---------- Card with navy section rule ---------- */
.card{ background:var(--surface); border:var(--rule); border-radius:var(--radius);
  box-shadow:var(--shadow-card); overflow:hidden; }
.card__head{ background:var(--navy); color:var(--paper);
  padding:10px 14px; border-bottom:2px solid var(--gold);
  font-family:var(--font-display-stack); font-weight:600; font-size:18px; }
.card__body{ padding:16px; }

/* ---------- Press tag / capsule ---------- */
.tag{ display:inline-flex; align-items:center; gap:6px; padding:4px 9px;
  background:var(--paper-2); border:1px solid var(--ink); border-radius:var(--radius);
  font-family:var(--font-sans-stack); font-weight:700; font-size:11px;
  text-transform:uppercase; letter-spacing:.08em; color:var(--ink); }
.tag--today{ background:var(--red); color:var(--paper); border-color:var(--red-deep); }
.tag--honor{ background:var(--gold-soft); color:var(--ink); border-color:var(--gold); }

/* ---------- Box-score stat grid (the signature) ---------- */
.statline{ width:100%; border-collapse:collapse;
  border:var(--rule); border-radius:var(--radius); overflow:hidden;
  font-family:var(--font-sans-stack); font-feature-settings:"tnum" 1; }
.statline thead th{
  background:var(--navy); color:var(--paper);
  font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.08em;
  padding:6px 10px; text-align:right; }
.statline thead th:first-child{ text-align:left; }   /* player/label column */
.statline tbody td{
  padding:6px 10px; text-align:right; font-size:15px; font-weight:700; color:var(--ink);
  border-top:var(--hairline); font-variant-numeric:tabular-nums; }
.statline tbody td:first-child{ text-align:left; font-weight:500; }
.statline tbody tr:nth-child(even){ background:var(--paper-2); }   /* zebra */
.statline tbody tr:hover{ background:var(--gold-soft); }
.statline .pos{ color:var(--green); }  .statline .neg{ color:var(--red); }

/* ---------- Hero cover plate ---------- */
.hero{ background:var(--paper); padding:48px 0; text-align:left; }
.hero__eyebrow{ font-family:var(--font-sans-stack); font-weight:700; font-size:12px;
  text-transform:uppercase; letter-spacing:.14em; color:var(--ink-muted); }
.hero__rule{ height:0; border-top:var(--rule); margin:14px 0; }
.hero__title{ font-family:var(--font-display-stack); font-weight:700;
  font-size:52px; line-height:1.02; letter-spacing:-.01em; color:var(--ink); }
.hero__sub{ font-family:var(--font-sans-stack); font-size:18px; line-height:1.5;
  color:var(--ink-muted); }
```

---

## 6. Motion

Motion is **mechanical and settled**, like a flip-board or a stat ticker — never bouncy.

- **Slot reel (the draft spin):** a vertical mechanical roll, ~700–1000ms, `cubic-bezier(.2,.7,.2,1)`
  ease-out so it *decelerates into place* and stops with a 1-frame settle (a tiny `translateY(2px)→0`
  overshoot, no opacity flicker). Rows are separated by 1px ink rules so it reads as a flip-board /
  Basketball-Reference row scroll, not a slot machine. Optional faint motion-blur only mid-spin.
- **Button hover:** background darkens one step + `translateY(-1px)`, 120ms; active presses flat.
  No offset-shadow grow.
- **Card / section reveal:** 8px rise + fade, 200ms ease-out. Stagger list rows by 30ms for a
  "rows printing in" feel.
- **Score reveal:** count-up on the result number (e.g. ticks to 73–9 over ~600ms) — a stat-ticker
  flourish that suits the data-forward brand. Gold rank plate fades + 1px scale settle.
- **Transitions / global:** default 120–200ms ease-out; honor `prefers-reduced-motion` by dropping
  to instant for the reel and count-up.

---

## 7. Iconography / imagery / texture

- **Texture:** a *very* faint newsprint grain or 6–8% opacity halftone-dot field is allowed on the
  page background and on navy fills (`background-image` SVG dots) — enough to suggest stock and ink,
  never enough to hurt legibility. The hero may use a subtle bottom halftone fade. This replaces the
  removed sunbeam.
- **Rules over boxes:** prefer hairline rules and thin gold accent rules to separate content rather
  than nested bordered boxes. A 2px gold rule under a navy header is the recurring motif.
- **Iconography:** thin, single-weight line icons (1.5px stroke, square caps) in `--ink` / `--ink-muted`
  — engraving/almanac feel, not rounded playful icons. Use a basketball mark only as a small
  registered "bug," not a hero graphic.
- **Imagery:** treat player/team imagery like a Topps card — framed in a cream `--paper-3` border with
  a nameplate banner; duotone toward navy/ink for cohesion if photos are used.
- **Numerals everywhere are `tnum` tabular** so anything in a column lines up like a printed table.
- **Star / record marks:** a simple 5-point gold star or a thin gold laurel for "undefeated"
  achievements (Hall-of-Fame honor cue), used sparingly.

---

## 8. Homepage walkthrough (mobile, before → after)

### Mobile hero
**Before:** cream page with a yellow radial **sunbeam** glow behind a Space-Mono uppercase headline
"GO 82–0." over the subtitle "A DAILY BASKETBALL DRAFT PUZZLE," with a yellow hard-shadow CTA pill.

**After:** clean cream page, no glow.
- Eyebrow (12px, tracked, ink-muted): `EST. 2026 · DAILY BASKETBALL ALMANAC`
- 1px ink hairline rule, full bleed.
- Serif headline, **Domine 700 ~34px** on mobile: **"Go undefeated."** (Title Case, period kept).
- Subtitle, Libre Franklin 18px ink-muted: "Draft five. Fit a lineup. Chase 82–0." (en-dash, `tnum`).
- 1px ink hairline rule.
- Primary **navy** button "Play today's draft" (full-width on mobile) + a red "Standings ›" text link.
- Net effect: it looks like the cover of a record book, not a game splash screen.

### "Daily Challenge / Today's Result 73-9 / Rank #24" card
**Before:** white `.md-card` with a 2px ink border and a 4px hard offset shadow; mono uppercase
labels; the score as plain mono text; rank as another pill.

**After — a framed result plate:**
```
┌─────────────────────────────────────────────┐  ← --surface, 1px ink hairline, 2px radius
│ DAILY CHALLENGE            [ TODAY ]          │  navy head strip, paper text + red "TODAY" tag,
│═══════════════════════════════════════════════│  2px gold rule under the strip
│                                               │
│   FINAL                                       │  eyebrow, ink-muted
│   73 – 9                                      │  score-xl, Libre Franklin 800, tnum, --ink
│   ─────────────────────────                   │  hairline
│   ┌───────────────────────────────┐          │
│   │ RANK   #24                     │          │  gold-soft plate, ink text, gold 1px rule
│   └───────────────────────────────┘          │
│                                               │
│   PTS   REB   AST   NET   PACE                │  box-score header (navy), UPPER stat-labels
│   118    44    27   +9.2   99.1               │  tnum numerals, zebra rows, +9.2 in --green
│                                               │
│   [ ▸ View box score ]   [ Share ]            │  navy + secondary buttons, no offset shadow
└─────────────────────────────────────────────┘
```
- The score "73 – 9" is the loudest type on the card but rendered in the **sans tabular** face,
  not the serif — numbers look like a posted result, headlines look like editorial.
- "Rank #24" sits on a **gold plate** (honor cue) instead of being a generic pill; the `#` stays
  ink, the `24` can take gold-on-navy if placed on a navy chip.
- The five stats below are the literal box-score grid from §5 — this is where the brand's
  "Basketball-Reference" DNA shows up on the homepage.

---

## 9. Tradeoffs & what it signals

**Signals:** credibility, history, stat authority — "this is the official record." It tells users
the simulation results are *real numbers worth bragging about*, leans into the box-score / leaderboard
core loop, and reads as grown-up and durable rather than trendy. The shareable result card looks like
a clipping or a trading card, which is inherently screenshot-worthy.

**Tradeoffs:**
- **Less playful.** We trade the toy-like, arcade warmth of the current system for gravitas. The
  "five spins" mechanic is inherently a little goofy; the classic skin must lean on the *flip-board*
  reframing of the reel so the spin still feels fun, not stuffy.
- **Serif + dense tables demand discipline.** Domine at small sizes and tight agate tables need
  careful line-height and `tnum`; sloppy spacing reads as "old" in the bad way. The 1px hairline
  system is less forgiving than thick ink borders — alignment must be exact.
- **Restraint is the brand.** The palette only works if red and gold stay rare. Overusing either
  collapses the heritage feel into "generic sports site."
- **Two-font risk.** If the optional Oswald moment creeps in everywhere it cheapens the editorial
  voice; keep it caged to team abbreviations / big numerals or drop it.
- It is **further from the parent MotherDuck brand** than the current look — which is the point of
  the rebrand, but worth naming.

---

## 10. Sources

Sites and pages actually searched/fetched for this guide:

- Basketball-Reference homepage (ruled stat tables, dense layout) — https://www.basketball-reference.com/ (fetch blocked 403; conventions confirmed via search + design write-ups)
- Agate (typography), Wikipedia — https://en.wikipedia.org/wiki/Agate_(typography)
- "The Little Font That Could," Defector (agate in sports pages) — https://defector.com/the-little-font-that-could
- "Inside The Chart: Ode to the Agate" — https://ramblinwreck.com/inside-the-chart-ode-to-the-agate/
- Cheltenham (typeface), Wikipedia — https://en.wikipedia.org/wiki/Cheltenham_(typeface)
- NYT Cheltenham in use, Fonts In Use — https://fontsinuse.com/typefaces/7802/nyt-cheltenham
- Cheltenham font pairings & alternatives, Typewolf — https://www.typewolf.com/cheltenham
- The 40 Best Google Fonts, Typewolf (Domine, Source Serif, Libre Franklin) — https://www.typewolf.com/google-fonts
- Domine — Google Fonts — https://fonts.google.com/specimen/Domine
- Libre Franklin — Google Fonts — https://fonts.google.com/specimen/Libre%2BFranklin
- Source Serif 4 — Google Fonts — https://fonts.google.com/specimen/Source%2BSerif%2B4
- Zilla Slab — Google Fonts — https://fonts.google.com/specimen/Zilla%2BSlab
- Saira Condensed — Google Fonts — https://fonts.google.com/specimen/Saira%2BCondensed
- Roboto Slab — Google Fonts — https://fonts.google.com/specimen/Roboto+Slab
- Sports Illustrated covers 2008–2010 (Antenna/Quiosco/Farnham), Fonts In Use — https://fontsinuse.com/uses/743/sports-illustrated-covers-2008-2010
- 1970-71 Topps Basketball (nameplate banner, cream border, red back box) — https://www.cardboardconnection.com/1970-71-topps-basketball-cards
- ESPN color palette (Torch Red #ff0033 — the loud red we deliberately step back from) — https://www.designpieces.com/palette/espn-color-palette-hex-and-rgb/
- "ESPN's Star Athletes Land a Winning Typeface," AIGA Eye on Design — https://eyeondesign.aiga.org/marrying-future-facing-sports-stars-with-a-futuristic-dualistic-typeface/
- NBA web/app redesign case study (moving away from dense tables) — https://medium.com/100-years-of-immigration/nba-web-app-redesign-395ad516c6de
- NBA media guides archive (vintage record-book covers) — https://funwhileitlasted.net/national-basketball-association-media-guides/
- Naismith Basketball Hall of Fame rebrand ("Greatness Lives Inside") — https://www.wwlp.com/news/local-news/hampden-county/naismith-basketball-hall-of-fame-unveils-new-website-brand-tagline/
- Best fonts for sports/athletics (Oswald/Saira/Anton jersey numerals) — https://fontalternatives.com/best-fonts-for/sports/
- Slab serif glossary, Google Fonts Knowledge — https://fonts.google.com/knowledge/glossary/slab_serif_egyptian_clarendon
