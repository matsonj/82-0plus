# daily82 — Theme 02: "MODERN" (Broadcast Dark)

A complete, implementable rebrand style guide. This replaces the MotherDuck "cream paper / thick ink / orange duck" system (`app/globals.css`) with a sleek, dark-first sports-app identity.

Status: design spec only. No app code changes are implied by this file. Token names below are proposed (`--d82-*`) so they can coexist with the legacy `--md-*` tokens during migration.

---

## 1. Vibe statement + mood board

**Vibe.** daily82 should feel like a live broadcast graphics package shrunk into your pocket — a deep near-black court at night, one electric accent that reads as "LIVE," tight condensed numerals that snap like a scoreboard, and clean data that breathes. Premium, fast, confident. Less "cozy puzzle," more "the score bug on the bottom of an NBA League Pass stream." It is dark-first, mobile-first, and unapologetically numbers-forward — every win-loss record, net rating, and rank should look like it belongs on a jumbotron.

**Mood board — what to borrow from each (all studied below):**

- **Apple Sports app** — the single biggest steal: *compressed/bold variable numerals* for scores, plus subtle top-down **gradient atmospheres** (a faint colored glow fading into black under the nav) and dense-but-calm data grids that compress text instead of truncating. Restraint over decoration.
- **The Athletic** — a confident *editorial dark palette anchored by one signature warm accent* (their "Tall Poppy" red). Proof that a sports product can feel premium and journalistic, not gamer-RGB.
- **Linear / Vercel-grade product UI** — *elevation by surface lightening* (not drop shadows) in dark mode, near-invisible 1px hairline borders, generous spacing, and a timeless neutral chrome where color is rationed. Inter / Inter Display as the workhorse UI face.
- **NBA.com / ESPN score cards** — the *horizontal matchup card* convention (team mark, record, big score, status pill) and a sticky condensed nav. The "live ticker" rail.
- **DraftKings / Sleeper / Underdog (DFS)** — *vivid green-on-black* energy and mobile-first, thumb-reachable primary actions; the "build your entry fast" momentum we want for the draft flow.
- **Sofascore** — *visual stat bars* (two-sided comparison bars) and an instant top-bar context switcher; data shown as graphics, not just numbers.
- **FiveThirtyEight data journalism** — *uppercase mono micro-labels* on axes/captions and a disciplined limited-hue chart palette. This is how we keep the box-score and net-rating viz looking authored, not default.

---

## 2. Color palette

Dark-first is the recommendation. Reason: it best matches the broadcast/live reference set, makes the electric accent and team colors pop, photographs well on share cards, and is where the modern sports-app pack (Apple Sports, Sofascore, The Athletic, DFS apps) all live. A light mode is fully specified below as a first-class companion (auto via `prefers-color-scheme`, with a manual toggle later).

### 2.1 Core accent — "Court Green"

One vivid electric accent, rationed to ~5–10% of any screen (the lime-on-black guidance from the research: bright stays a sharp accent; dark does the heavy lifting).

| Token | Hex | Use |
|---|---|---|
| `--d82-accent` | `#00E676` | Primary accent. CTAs, live dot, links, focus rings, "win" state, key data highlights. Electric court-green — energetic, reads as "go / live / W". |
| `--d82-accent-strong` | `#00C853` | Hover/pressed accent, accent text on light surfaces (better contrast). |
| `--d82-accent-dim` | `#0B3D2E` | Accent-tinted fills/chips on dark (e.g. selected slot, subtle success bg). |
| `--d82-accent-glow` | `rgba(0,230,118,0.30)` | Glow/box-shadow color for elevated accent elements and the hero. |

Why green over blue: blue is the most over-used sports default (NBA/ESPN/Yahoo all lean blue), green is what DFS/DraftKings/Sleeper own and it doubles perfectly as the "undefeated / win" semantic — central to this product. It is distinct from the legacy orange duck and the warm "Claude" feel we are leaving behind.

### 2.2 Dark mode (default)

| Token | Hex | Replaces (legacy) | Notes |
|---|---|---|---|
| `--d82-bg` | `#0A0B0D` | `--md-paper` | App background. Near-black, very slightly cool ("court at night"), not pure `#000` so elevation can read. |
| `--d82-bg-2` | `#101216` | `--md-paper-2` | Recessed wells, page gutters. |
| `--d82-surface` | `#15181D` | `--md-white` | Default card surface (elevation 1). |
| `--d82-surface-2` | `#1C2026` | `--md-paper-3` | Raised card / popover / selected (elevation 2). |
| `--d82-surface-3` | `#242931` | — | Modals, dropdown menus (elevation 3). |
| `--d82-line` | `rgba(255,255,255,0.08)` | the 2px ink border | Hairline border, 1px. The single biggest geometry change. |
| `--d82-line-strong` | `rgba(255,255,255,0.16)` | — | Focused/hovered border, dividers that need to read. |
| `--d82-text` | `#F4F6F8` | `--md-ink` | Primary text (off-white, ~AAA on bg). |
| `--d82-text-muted` | `#9BA3AF` | `--md-ink-muted` | Secondary text, stat labels. |
| `--d82-text-faint` | `#5B6470` | — | Tertiary / disabled / axis ticks. |

**Elevation = lighter surface, not darker shadow** (the Linear technique). Each step up the stack gets a lighter `--d82-surface-*`; shadows are used only for *float* (modals, dragged chips), never to fake a panel.

### 2.3 Light mode (companion)

A confident, crisp light mode — cool paperless white, not cream. Keeps the same green accent.

| Token | Hex | Notes |
|---|---|---|
| `--d82-bg` | `#FBFCFD` | Near-white, faint cool tint. |
| `--d82-bg-2` | `#F1F4F7` | Wells. |
| `--d82-surface` | `#FFFFFF` | Cards. |
| `--d82-surface-2` | `#F6F8FA` | Raised/selected. |
| `--d82-line` | `rgba(10,12,16,0.10)` | Hairline. |
| `--d82-line-strong` | `rgba(10,12,16,0.20)` | — |
| `--d82-text` | `#0D1117` | Primary. |
| `--d82-text-muted` | `#5B6470` | Secondary. |
| `--d82-text-faint` | `#8A94A1` | Tertiary. |
| accent on light | use `--d82-accent-strong` `#00C853` for text/icons; keep `#00E676` for fills with dark text on top. |

### 2.4 Secondary / data palette

For charts, semantic states, and team-color accents. Limited hue set (FiveThirtyEight discipline).

| Token | Hex | Use |
|---|---|---|
| `--d82-win` | `#00E676` | Wins, positive net rating, success. (= accent) |
| `--d82-loss` | `#FF4D5E` | Losses, negative net rating, errors, destructive. |
| `--d82-info` | `#3D9CFF` | Neutral info, secondary data series, links in body copy. |
| `--d82-warn` | `#FFB020` | Cautions, "almost" states (e.g. 80–81 wins). |
| `--d82-gold` | `#FFC53D` | Rank #1 / champion / podium / streak flair (use sparingly). |
| `--d82-purple` | `#A77BFF` | Optional 3rd data series / "era" tag accent. |

Team-color badges: pull the real franchise primary as a per-element CSS var (`--team`) and render it as a left **accent bar / ring**, never as a full card fill — keeps the system coherent while letting the Lakers read purple-gold and the Celtics green.

### 2.5 WCAG contrast notes

Dark mode (against `--d82-surface #15181D`):
- `--d82-text #F4F6F8` ≈ **15.3:1** — AAA.
- `--d82-text-muted #9BA3AF` ≈ **6.7:1** — AA for normal text, AAA for large.
- `--d82-accent #00E676` on `#0A0B0D` ≈ **11:1** — AAA for large text/icons; excellent for the live dot and big numerals. For accent *text at body size*, prefer it on dark only; do not put green text on a green-dim chip.
- Accent as a **button fill** uses **dark text** (`#06140D`) on `#00E676` ≈ **9.5:1** — AAA. Never white text on green (fails).
- `--d82-loss #FF4D5E` on dark ≈ 6:1 (AA); `--d82-text-faint #5B6470` is decorative only (axis ticks), not for essential text.

Light mode: `--d82-text #0D1117` on `#FFFFFF` ≈ 18:1 (AAA); muted `#5B6470` ≈ 6.1:1 (AA). Accent for text uses `#00C853` (≈ 3.4:1 — large text/icons only; pair with an icon or weight ≥600).

Rule: **interactive state is never carried by color alone** — pair win/loss greens/reds with a glyph or +/− sign, pair focus-green with a 2px ring.

---

## 3. Typography

Two Google families, both verified available and both variable.

- **Display / numerals — `Archivo` (variable).** A grotesque built for headlines with **variable weight + width axes** and a full set of OpenType numerals incl. **tabular figures** and slashed zero (confirmed on Google Fonts). This is our scoreboard face: push weight to 700–900 and tighten the width axis for big records and the wordmark. It gives the Apple-Sports "bold weight + compact width" numeral effect without a custom font. *(If a more aggressive condensed look is wanted later, `Saira Condensed` / `Saira` is the Google-Fonts alternate — 9 weights × 4 widths, also variable, also tabular figures. Anton/Bebas are uppercase-only — avoid as the primary face.)*
- **UI / body — `Inter` (variable), with `Inter Display` for large headings.** Already in the stack; keep it. Inter is the Linear/Vercel-grade neutral workhorse and pairs cleanly with Archivo. Use `Inter Display` optical size (via `next/font` `Inter` covers it; or load `Inter Display` separately) for anything ≥ 28px.

> **Replaces:** Space Mono (display) → **Archivo**. Inter (sans) → **Inter** (kept). The mono character of the old "arcade" identity moves to a *small, optional* monospace micro-label role only (see below), not the headline face.

Optional micro-label mono: **`Geist Mono`** or **`Space Mono`** (Space Mono already loadable) reserved strictly for uppercase data captions / "LIVE" / timestamps, à la FiveThirtyEight axis labels. Keep it tiny and rare.

### 3.1 Type scale (px)

Mobile-first values; the two largest steps scale up ~1.25× at `md`.

| Role | Family | Size / line-height | Weight | Tracking | Case |
|---|---|---|---|---|---|
| Display / Hero | Archivo | 44 / 0.95 (→ 64 desktop) | 800 | −0.02em | Sentence or UPPER for wordmark |
| Score numeral (XL) | Archivo (tabular) | 56 / 1.0 | 800, width ~85% | −0.01em | — |
| H1 | Inter Display | 30 / 1.1 | 700 | −0.01em | Sentence |
| H2 / section | Archivo | 22 / 1.15 | 700 | −0.005em | Sentence |
| H3 / card title | Inter | 17 / 1.2 | 600 | 0 | Sentence |
| Body | Inter | 16 / 1.5 | 400 | 0 | Sentence |
| Body-sm | Inter | 14 / 1.45 | 400 | 0 | Sentence |
| Stat value | Archivo (tabular) | 18 / 1.1 | 700 | 0 | — |
| Label / eyebrow | Inter or Mono | 12 / 1.3 | 600 | **+0.10em** | **UPPERCASE** |
| Caption / meta | Inter | 12 / 1.4 | 500 | +0.02em | Sentence |
| Micro-mono tag | Space/Geist Mono | 11 / 1.2 | 500 | +0.06em | UPPERCASE |

**Casing rules:** Headlines and titles are **sentence case** (modern, calmer than the old all-caps). Reserve **UPPERCASE + wide tracking** for small eyebrow labels, stat-grid headers, and status pills only — that is where the "broadcast lower-third" energy lives. This inverts the legacy system (which shouted in uppercase mono everywhere).

**Numerals:** always `font-feature-settings: "tnum" 1, "ss01" 1;` on Archivo for records/scores so digits align in columns and the scoreboard doesn't jitter.

### 3.2 New HERO treatment

Replaces `Go 82–0.` → **`Go undefeated.`**

```
            ●  DAILY CHALLENGE · JUN 22          ← eyebrow: 12px Inter 600, UPPER, +0.10em,
                                                    accent dot = live green, color text-muted

            Go undefeated.                       ← hero: Archivo 800, 44→64px, −0.02em,
                                                    color text; "undefeated" can take an accent
                                                    underline or accent-green word color

   Five spins. Five eras. One lineup.            ← subtitle: Inter 400, 16→18px, text-muted
   Draft a roster that runs the table.

   [  Play today's puzzle  →  ]                  ← primary CTA, accent fill, dark text
```

- The wordmark "daily82" itself: Archivo 800, with **`82`** set in tabular figures and tinted `--d82-accent`; `daily` in `--d82-text`. Lockup reads as one token, the number is the hero.
- Backdrop: replace the yellow `--md-sunbeam` radial with a top-down **accent-green-into-black gradient glow** (Apple Sports move) — see §7.

---

## 4. Geometry

The biggest single visual move overall: **kill the 2px ink borders, zero-radius, and hard offset shadows. Everything becomes rounded, hairline-bordered, and softly elevated.**

**Borders.** 1px hairline using `--d82-line` (≈8% white on dark). Borders define cards and inputs; they get *brighter* (`--d82-line-strong`) on hover/focus rather than thicker. No more 2px solid ink.

**Radius scale.**

| Token | px | Use |
|---|---|---|
| `--d82-r-xs` | 6 | chips, pills inner, small buttons |
| `--d82-r-sm` | 10 | inputs, stat cells, badges |
| `--d82-r-md` | 14 | buttons, default cards |
| `--d82-r-lg` | 20 | hero card, feature cards, modals |
| `--d82-r-pill` | 999 | capsules, status pills, avatar |

**Elevation / shadow / glow.**

```css
--d82-e1: 0 1px 2px rgba(0,0,0,0.40);                       /* resting card */
--d82-e2: 0 4px 16px rgba(0,0,0,0.45);                      /* raised / popover */
--d82-e3: 0 12px 40px rgba(0,0,0,0.55);                     /* modal / dragged */
--d82-glow-accent: 0 0 0 1px rgba(0,230,118,0.40),
                   0 8px 28px rgba(0,230,118,0.28);          /* primary CTA / win moment */
--d82-focus: 0 0 0 2px var(--d82-bg), 0 0 0 4px var(--d82-accent); /* keyboard focus ring */
```

Soft, blurred, low-opacity shadows (the opposite of the legacy hard `4px 4px 0` offset). In dark mode lean on **surface lightening for hierarchy** and reserve shadows + glow for things that genuinely float or celebrate (CTA, drag, "undefeated" win state).

**Spacing rhythm.** 4px base. Scale: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 48 / 64. Cards use 16–20px internal padding on mobile, 24px desktop. Generous gutters; let the data breathe. Section vertical rhythm 48–64px.

---

## 5. Component restyle table

| Component (legacy class) | Modern restyle |
|---|---|
| **Header / logo** | Sticky, `--d82-bg` with a `backdrop-filter: blur(12px)` + 70% bg alpha glass when scrolled; 1px bottom hairline. Logo = `daily82` Archivo lockup with green `82`. Right side: streak chip + alerts bell + avatar. Condensed, broadcast-nav feel. |
| **Hero** | See §3.2 + §7. Rounded `--d82-r-lg` glass-ish card on a green→black gradient field; sentence-case Archivo headline; accent CTA. |
| **Capsule / pill (`.md-capsule`)** | Pill radius, no border by default; `--d82-surface-2` bg, `--d82-text-muted` text, 12px UPPER label. Variants tint bg + text (accent / loss / info). "LIVE/TODAY" variant: green dot + accent text. |
| **Card (`.md-card` / `--lift`)** | `--d82-surface`, 1px `--d82-line`, `--d82-r-lg`, `--d82-e1`. `--lift` → raise to `--d82-surface-2` + `--d82-e2` on hover, not a hard offset. |
| **Buttons (`.md-btn` + variants)** | Primary = accent fill, dark text, `--d82-r-md`, glow on hover. Secondary = `--d82-surface-2` + hairline. Ghost/ink = transparent + hairline, text only. Sizes lg/sm keep. No skeuomorphic press-offset — use a subtle scale + glow. |
| **Text input (`.md-input`)** | `--d82-surface-2`, 1px hairline, `--d82-r-sm`, Inter (not mono) 16px. Focus: border→accent + focus ring, no bg flip. The arcade `--name` high-score variant keeps **mono + wide tracking** as an intentional retro nod *only* on the leaderboard initials field. |
| **Team badge (`.md-badge`)** | Circular/`--d82-r-sm` chip on `--d82-surface-2`, **team color as ring/left-bar** via `--team`, Archivo abbreviation. Era shown as a small mono tag beneath. |
| **Sunbeam backdrop** | Replaced by accent gradient glow + faint radial (see §7). |
| **Slot reel (`.md-spinning`)** | Smooth vertical reel with motion-blur + ease-out snap and a green flash on lock (see §6), replacing the flicker-jump. |
| **Stat grid (`.md-statline`/`.md-stat`)** | Borderless cells separated by 1px hairlines on `--d82-surface`; UPPER mono labels (`text-faint`), Archivo tabular values; positive deltas green, negative red. Optional inline mini-bar (Sofascore) for net-rating. |
| **Scrollbar** | Thin overlay scrollbar: 8px, transparent track, `--d82-line-strong` thumb, `--d82-r-pill`. |
| **NEW: matchup/score card** | Horizontal NBA/ESPN-style row: team mark + record left, **big Archivo score** center, status pill right. Used for "Today's Result". |
| **NEW: live ticker rail** | Optional thin horizontal scroll of recent results/streak — broadcast bottom-bar energy. |

### CSS sketches

```css
/* ---------- Tokens (dark default) ---------- */
:root {
  --d82-bg:#0A0B0D; --d82-bg-2:#101216;
  --d82-surface:#15181D; --d82-surface-2:#1C2026; --d82-surface-3:#242931;
  --d82-line:rgba(255,255,255,.08); --d82-line-strong:rgba(255,255,255,.16);
  --d82-text:#F4F6F8; --d82-text-muted:#9BA3AF; --d82-text-faint:#5B6470;
  --d82-accent:#00E676; --d82-accent-strong:#00C853; --d82-accent-dim:#0B3D2E;
  --d82-win:#00E676; --d82-loss:#FF4D5E; --d82-info:#3D9CFF; --d82-gold:#FFC53D;
  --d82-r-sm:10px; --d82-r-md:14px; --d82-r-lg:20px; --d82-r-pill:999px;
  --d82-e1:0 1px 2px rgba(0,0,0,.40);
  --d82-e2:0 4px 16px rgba(0,0,0,.45);
  --d82-glow-accent:0 0 0 1px rgba(0,230,118,.40),0 8px 28px rgba(0,230,118,.28);
  --d82-focus:0 0 0 2px var(--d82-bg),0 0 0 4px var(--d82-accent);
}

/* ---------- Button ---------- */
.d82-btn{
  display:inline-flex; align-items:center; justify-content:center; gap:8px;
  padding:12px 20px; border-radius:var(--d82-r-md);
  font-family:Inter,sans-serif; font-weight:600; font-size:15px; line-height:1;
  background:var(--d82-accent); color:#06140D; border:0; cursor:pointer;
  transition:transform .12s ease, box-shadow .15s ease, background .15s ease;
}
.d82-btn:hover{ background:var(--d82-accent-strong); box-shadow:var(--d82-glow-accent); transform:translateY(-1px); }
.d82-btn:active{ transform:translateY(0); }
.d82-btn:focus-visible{ outline:0; box-shadow:var(--d82-focus); }
.d82-btn--secondary{ background:var(--d82-surface-2); color:var(--d82-text); box-shadow:inset 0 0 0 1px var(--d82-line); }
.d82-btn--ghost{ background:transparent; color:var(--d82-text); box-shadow:inset 0 0 0 1px var(--d82-line); }
.d82-btn:disabled{ opacity:.4; cursor:not-allowed; box-shadow:none; transform:none; }

/* ---------- Card ---------- */
.d82-card{
  background:var(--d82-surface); border:1px solid var(--d82-line);
  border-radius:var(--d82-r-lg); box-shadow:var(--d82-e1); padding:20px;
  transition:background .15s ease, border-color .15s ease, box-shadow .15s ease, transform .15s ease;
}
.d82-card--lift:hover{ background:var(--d82-surface-2); border-color:var(--d82-line-strong); box-shadow:var(--d82-e2); transform:translateY(-2px); }

/* ---------- Capsule / status pill ---------- */
.d82-pill{
  display:inline-flex; align-items:center; gap:6px;
  padding:4px 10px; border-radius:var(--d82-r-pill);
  background:var(--d82-surface-2); color:var(--d82-text-muted);
  font-family:Inter,sans-serif; font-size:12px; font-weight:600;
  letter-spacing:.10em; text-transform:uppercase;
}
.d82-pill--live{ background:var(--d82-accent-dim); color:var(--d82-accent); }
.d82-pill--live::before{ content:""; width:6px; height:6px; border-radius:999px; background:var(--d82-accent); box-shadow:0 0 8px var(--d82-accent); animation:d82-pulse 1.6s ease-in-out infinite; }

/* ---------- Stat grid (5-col box score) ---------- */
.d82-statline{ display:grid; grid-template-columns:repeat(5,1fr);
  background:var(--d82-surface); border:1px solid var(--d82-line);
  border-radius:var(--d82-r-md); overflow:hidden; }
.d82-stat{ padding:10px 6px; text-align:center; }
.d82-stat + .d82-stat{ box-shadow:inset 1px 0 0 var(--d82-line); }
.d82-stat__label{ font-family:"Space Mono",monospace; font-size:10px; letter-spacing:.08em;
  text-transform:uppercase; color:var(--d82-text-faint); }
.d82-stat__value{ font-family:Archivo,sans-serif; font-weight:700; font-size:18px;
  color:var(--d82-text); font-feature-settings:"tnum" 1; }
.d82-stat__value--pos{ color:var(--d82-win); }
.d82-stat__value--neg{ color:var(--d82-loss); }

/* ---------- Hero backdrop ---------- */
.d82-hero{ position:relative; border-radius:var(--d82-r-lg); overflow:hidden; }
.d82-hero::before{ content:""; position:absolute; inset:0; z-index:0; pointer-events:none;
  background:
    radial-gradient(120% 80% at 50% -20%, rgba(0,230,118,.22), transparent 60%),
    linear-gradient(180deg, #0E1512 0%, var(--d82-bg) 55%); }
.d82-hero__headline{ font-family:Archivo,sans-serif; font-weight:800; font-size:clamp(44px,9vw,64px);
  letter-spacing:-.02em; line-height:.95; color:var(--d82-text); }
.d82-hero__headline em{ color:var(--d82-accent); font-style:normal; }
```

---

## 6. Motion

Fast, eased, intentional. Everything `cubic-bezier(.2,.8,.2,1)` ("ease-out-quint" feel), durations 120–280ms. Respect `prefers-reduced-motion` (disable reel blur + pulses, keep instant state changes).

- **Slot-reel spin.** Replace the 0.16s flicker-jump with a real reel: contents translate upward continuously with a slight `filter: blur(2px)` motion-blur while spinning, then **ease-out snap** to the locked team and fire a one-shot **green ring flash + scale 1.0→1.04→1.0** on lock. Stagger the five reels ~120ms apart so they lock left-to-right like a scoreboard settling. Lock = short haptic on mobile.
- **Button hover.** `translateY(-1px)` + accent glow fade-in (150ms). Active: settle to 0. No layout shift.
- **Card hover.** Surface lightens + 2px rise (150ms). Drag (slotting players): card lifts to `--d82-e3`, slight rotate(1deg), target slot shows an accent dashed inset.
- **Transitions / route changes.** Content fades + 8px rise-in (200ms), staggered for lists (40ms/item). Numbers (records, rank) **count up** on first paint (e.g. 0→73 wins over 600ms, ease-out) — the broadcast "score updating" feel.
- **Live dot.** Soft opacity/scale pulse, 1.6s loop (see `d82-pulse` below).
- **Win celebration (undefeated / great record).** Accent glow bloom behind the score + brief confetti-free shimmer sweep across the result card. Keep it classy, single-shot.

```css
@keyframes d82-pulse{ 0%,100%{ opacity:1; transform:scale(1);} 50%{ opacity:.5; transform:scale(.85);} }
@keyframes d82-reel-lock{ 0%{ transform:scale(1);} 40%{ transform:scale(1.04);} 100%{ transform:scale(1);} }
@keyframes d82-rise{ from{ opacity:0; transform:translateY(8px);} to{ opacity:1; transform:translateY(0);} }
@media (prefers-reduced-motion:reduce){ *{ animation:none!important; transition-duration:.01ms!important; } }
```

---

## 7. Iconography / imagery / texture

- **Icons.** Crisp 1.5–2px stroke line icons, rounded joins — **Lucide** (already common in the Next/Tailwind world) at 20/24px. Monochrome `--d82-text-muted`, accent only when active/selected. Avoid filled cartoon icons.
- **Gradients.** Signature is the **top-down accent-green→black hero glow** plus optional faint **radial vignette** corners on dark surfaces. Per-section glows can borrow a team color at very low alpha. Never rainbow; one hue per surface.
- **Glow.** Reserved for the live dot, the primary CTA, focus rings, and win moments. It is the "live signal" of the system — overuse kills it.
- **Texture.** Mostly none (clean broadcast). Optional very subtle 2–4% noise/grain overlay on the hero gradient to avoid banding on dark gradients (a known dark-mode pitfall). No paper texture, no skeuomorphism.
- **Team / player imagery.** Team color as accent ring/bar + abbreviation mark; era as a mono tag. If player headshots are used, frame them in a `--d82-r-pill` avatar with a 1px hairline.
- **Share cards.** Dark `#0A0B0D` field, green glow behind a huge Archivo record (`73–9`), rank chip, `daily82` lockup bottom-right. Designed to look like a broadcast final-score graphic in a social feed.

---

## 8. Homepage walkthrough (before → after, mobile)

**Hero — before:** Cream `#f4efea` page, yellow radial sunbeam, all-caps Space Mono `GO 82–0.`, uppercase subtitle `A DAILY BASKETBALL DRAFT PUZZLE`, yellow 2px-ink CTA with hard offset shadow.

**Hero — after:**
- Background flips to near-black `#0A0B0D` with a soft green glow blooming from the top center, faint grain.
- Eyebrow: green live dot + `DAILY CHALLENGE · JUN 22` (12px Inter, UPPER, wide tracking, muted).
- Headline: `Go undefeated.` in Archivo 800, ~44px, sentence case, with `undefeated` in accent green; tight −0.02em tracking.
- Subtitle: `Five spins. Five eras. One lineup.` in Inter, `--d82-text-muted`.
- CTA: `Play today's puzzle →` — green pill button, dark text, glow on hover, full-width on mobile, thumb-reachable.

**"Daily Challenge — Today's Result 73–9 — Rank #24" card — before:** White card, 2px ink border, hard `4px 4px 0` shadow, uppercase mono labels, orange/yellow accents.

**"Today's Result" card — after** (this is the showcase component):

```
┌─────────────────────────────────────────┐   d82-card, --d82-surface, 1px hairline,
│  ● TODAY'S RESULT            JUN 22 '26   │   r-lg, e1. Eyebrow row: green live dot +
│                                           │   UPPER muted label, date right (mono).
│        7 3  –  9                           │   Archivo 800 tabular, ~56px. "73" in
│        ▔▔▔▔▔▔▔▔▔  net rtg +8.4 ▲          │   --d82-text, win-green underline; net
│                                           │   rating in green with ▲. Counts up on load.
│  ┌───────┐                 ┌───────────┐  │
│  │ RANK  │                 │  ↗ Share   │  │   Left: rank chip — "#24" big Archivo +
│  │  #24  │  top 3% today   │            │  │   "top 3% today" muted caption. Right:
│  └───────┘                 └───────────┘  │   secondary "Share" button (surface-2 + glow).
└─────────────────────────────────────────┘
   ● ● ● ● ●   ← five team badges (color rings) of today's locked roster, below the card
```

- The record `73–9` is the hero of the card — huge, tabular, with the win count tinted green and a thin green baseline bar whose fill maps to wins/82.
- `Rank #24` becomes a compact stat chip with `top 3% today` context (Sofascore-style "where you stand" framing) instead of a bare number.
- Hover/tap lifts the card (surface lightens + soft shadow). On a great result the green glow blooms behind the score.

---

## 9. Tradeoffs & what it signals

- **Signals:** premium, live, current, "this is a real sports product." Aligns with where fans already spend time (Apple Sports, The Athletic, DFS apps). The green-on-black says *go / win / undefeated* without a word.
- **Cost / risks:**
  - **Loses the playful, ownable warmth** of the duck/arcade identity. The product becomes more serious — intentional, but it sheds personality. Mitigation: keep two retro nods (the mono high-score initials field; an optional "arcade" sound on reel-lock).
  - **Dark gradients band** on cheap displays — hence the grain overlay; test on real devices.
  - **One-accent discipline is mandatory.** Green everywhere reads "gamer RGB," the opposite of premium. Ration it to ~5–10%.
  - **Generic-sports risk:** dark + green + condensed is a known recipe. Our differentiators are the *wordmark with green `82`*, the *count-up records*, the *staggered reel-lock*, and *team-color rings* — keep those distinctive.
  - **Migration effort:** every `--md-*` token, 2px border, zero-radius, and hard-shadow rule must be replaced; not a reskin of a few classes. Run dark + light in parallel via `prefers-color-scheme` and a manual toggle.
- **Accessibility win:** higher contrast, focus rings, and non-color state cues are baked in — better than the legacy system.

---

## 10. Sources (fetched / searched)

- Apple Sports data-vis design — Creative Boom: https://www.creativeboom.com/inspiration/this-new-app-from-apple-has-something-important-to-teach-us-about-designing-data/
- Apple Sports design critique (gradients, compact bold numerals, dense data grids) — Lickability: https://lickability.com/blog/apple-sports/
- Apple Sports v3 redesign / home screen — TechCrunch: https://techcrunch.com/2025/06/25/apple-sports-app-adds-live-tennis-scores-and-a-redesigned-home-screen/
- Apple design system & SF Pro typography — Superdesign: https://www.superdesign.dev/blog/apple-design-system
- Apple Typography / Dynamic Type — Apple HIG: https://developer.apple.com/design/human-interface-guidelines/typography
- Linear UI redesign (LCH, elevation by surface, contrast, Inter Display) — Linear: https://linear.app/now/how-we-redesigned-the-linear-ui
- Linear brand / Inter on dark — search + Linear brand: https://linear.app/brand
- The Athletic palette (Tall Poppy red, dark/dramatic) — search of Mobbin brand colors: https://mobbin.com/colors/brand/the-athletic
- Sleeper redesign (eye-friendly palette, night theme, bottom tabs) — Sleeper blog: https://sleeper.com/blog/upcoming-redesign/
- DraftKings brand colors (#9AC434 green, #000) — Code of Colors: https://www.codeofcolors.com/draftkings-colors.html
- DFS app UX (clean mobile, fast entry) — CBS Sports best DFS apps: https://www.cbssports.com/betting/news/best-dfs-apps/
- Sofascore new home screen / visual match stats / top-bar switcher — Sofascore: https://www.sofascore.com/news/sofascores-new-home-screen-a-smarter-faster-way-to-follow-sports
- FiveThirtyEight chart style (uppercase labels, limited hues, light bg) — Towards Data Science: https://towardsdatascience.com/data-visualization-hack-lessons-from-fivethirtyeight-graphs-e121080725a6/
- Datawrapper colors for data-vis style guides — https://www.datawrapper.de/blog/colors-for-data-vis-style-guides
- Oswald / condensed sports type guide — FontFyi: https://fontfyi.com/blog/oswald-font-guide/
- Condensed/athletic Google Fonts (Saira, Anton) — FontAlternatives sports: https://fontalternatives.com/best-fonts-for/sports/
- Archivo on Google Fonts (variable, tabular figures, width axis) — https://fonts.google.com/specimen/Archivo
- Saira Condensed on Google Fonts (variable, 36 styles) — https://fonts.google.com/specimen/Saira+Condensed
- Bebas Neue on Google Fonts (uppercase-only, non-variable — ruled out as primary) — https://fonts.google.com/specimen/Bebas+Neue
- Lime/neon green on dark UI guidance — Media.io lime green palettes: https://www.media.io/color-palette/lime-green-color-palette.html
- ESPN home/score-screen redesign concept — Medium (Balogun Tobi): https://tobibags19.medium.com/espn-home-and-score-screenredesign-4604644dd7e8
- NBA team sites design system — Engine Digital: https://enginedigital.com/work/nba-team-sites/
- Basketball-Reference sortable stat tables / DataTables conventions — https://www.basketball-reference.com/
- NBA.com (live scores, tickers, dark chrome reference) — https://www.nba.com/
- Mobile app color trends 2026 (deep moody bg + bright accent pops) — Envato: https://elements.envato.com/learn/color-scheme-trends-in-mobile-app-design
