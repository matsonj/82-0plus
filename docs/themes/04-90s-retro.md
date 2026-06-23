# daily82 — Theme 04: 90s RETRO ARCADE

> **"BOOMSHAKALAKA."** A coin-op rebrand for **daily82** (daily82.com), the daily basketball draft puzzle — built in the image of **NBA Jam (1993, Midway)** and the early-90s arcade floor. Hot neon on near-black, CRT glow and scanlines, chunky bitmap type, seven-segment scoreboards, flaming basketballs, and "INSERT COIN" attract-mode energy. This replaces the current MotherDuck "cream paper / thick ink / orange duck" look. It is implementable on the existing stack: Next.js App Router, Tailwind v4 (`@import "tailwindcss"`), CSS custom-property tokens in `app/globals.css`, fonts via `next/font/google`.
>
> The app already has an arcade streak — the slot-reel **spin**, the uppercase **high-score name entry**, the coin-op tone. This theme stops apologizing for it and turns the whole thing into a 1993 cabinet attract screen.

---

## 1. Vibe statement + mood board

**Vibe.** You just walked up to the cabinet. The screen is glowing in a dark room, scanlines rolling, the marquee buzzing — an attract loop daring you to drop a quarter. Everything is hot neon burned onto black glass: electric blue panels, magenta player select, a seven-segment scoreboard ticking, and when you win, the ball **catches fire** and the net singes. The type is chunky and digitized; numbers are LED-segment; the announcer is screaming BOOMSHAKALAKA in your head. It's loud, saturated, nostalgic, and genuinely fun — but the box score and the leaderboard never stop being readable, because a scoreboard you can't read isn't a scoreboard. **CRT maximalism for the chrome; arcade-clean legibility for the data.**

**Mood board — named references and the specific element to borrow:**

| Reference | What I actually studied | The one move to steal |
|---|---|---|
| **NBA Jam (1993) title / attract screen** (arcade-museum.com, MobyGames arcade shots, gamesdatabase title-screen art) | Midway logo on the top border, blue instruction bar, big chrome-beveled logo, a cheerleader dribbling across attract mode; flashing "PRESS START." | The **attract-mode title screen**: chrome-beveled logo on black, a flashing "INSERT COIN / PRESS START" line, looping idle hype. This becomes our hero. |
| **NBA Jam "He's on fire!" effect** (MEL Magazine oral history, NLSC "Why Being On Fire Was So Cool", Giphy/Tenor clips) | After 3 straight buckets the **ball literally catches fire** and singes the net; the fire/smoke sprites were lifted from *Smash TV*; cartoonish orange→yellow→white flame. | The **win-streak fire treatment**: flaming-ball glow + animated flame gradient on a perfect/undefeated result. Orange→yellow→white core. |
| **NBA Jam graphics pipeline** (Fabien Sanglard, fabiensanglard.net/nbajamte) | **400×254** native res (stretched to 4:3), **16-bit `xRGB 1555`** palette-indexed color, **32,768** colors available, up to 256 colors per sprite, **digitized photo sprites** with hard dithering, no compression. | The **low-res, high-saturation, dithered** texture; chunky non-square pixels; digitized-photo player heads with a hard neon key-line. Lean into limited-palette dither, not smooth gradients. |
| **NBA Jam team / player select** (TCRF prototype notes for SNES/Genesis) | Left team portraits on a **teal** panel, right team on a **purple** panel; boxed digitized faces; matchup screen. | Two-color **team-panel theming** (teal vs. magenta/purple) and the boxed, key-lined **player portrait** treatment for draft cards. |
| **High-score / initials entry** (NBA Jam FAQs, arcade-museum manual) | Enter 3 initials to keep your run; secret codes typed as initials (e.g. `JAM`); a core replay hook. | The **HIGH SCORES table** + uppercase initials entry — maps perfectly onto our existing name input and the Daily leaderboard. |
| **Mortal Kombat / Midway title treatment** (Williams/Midway cabinet & attract art) | Heavy **chrome-bevel + drop-shadow** logo lettering, lightning, hot rim-light on black, dragon-marquee maximalism. | The **chrome-bevel logo** and **lightning** accent for the `daily82` wordmark and big win moments. |
| **CRT / scanline web revival** (Medium "CSS to mimic a CRT", DEV.to CRT terminal, Arcadecore/Vaporwave aesthetic wikis) | Scanlines = repeating 1px linear-gradient; neon = layered `text-shadow` glow; vignette + faint flicker; monospace base. | The **CRT overlay**: scanline layer, screen vignette, subtle bloom/flicker — applied as a global skin, dialable to zero for accessibility. |
| **Basketball-Reference / ESPN / NBA.com** (baseline study) | Dense sortable tables, **tabular numerals**, zebra rows, conservative neutral type, stable left-aligned stat order. | What to **respect**: tabular-figure alignment and a calm, scannable reading order for the box score. The arcade skin wraps the data; it never scrambles it. |

---

## 2. Color palette

Strategy from the arcade floor: a **near-black "CRT glass" background** is the whole world. **Hot neons** (blue, magenta, flame, lightning-yellow, CRT-green) do every bit of shouting and glow. Saturation is cranked. The old warm cream/orange/duck world is retired entirely — this is the opposite temperature.

### Core tokens (replace the `--md-*` set)

| New token | Hex | Replaces | Role |
|---|---|---|---|
| `--rt-black` | `#08080F` | `--md-paper` (#f4efea) → as the **default bg** | CRT glass near-black. The whole app sits on this. Faint blue-violet, not pure #000, so glow reads. |
| `--rt-panel` | `#11121F` | `--md-paper-2` (#ece5dd) | Raised panel / card field on black. |
| `--rt-panel-2` | `#1B1D31` | `--md-paper-3` (#e1d6cb) | Stat-cell fill, inset wells, zebra. |
| `--rt-line` | `#2E3358` | `--md-ink` (#383838) as the **border** | Default panel hairline (cool indigo). For the heavy "ink" border role, prefer a neon (see below) or `--rt-chrome`. |
| `--rt-chrome` | `#9AA6C8` | — | Beveled chrome edge / silver UI rim (Midway logo metal). Light edge of bevels. |
| `--rt-chrome-dark` | `#3A4263` | — | Dark edge of bevels (bottom/right of chrome). |
| `--rt-text` | `#EAF2FF` | `--md-ink` (#383838) as **body text** | Near-white with a cool tint — the default readable text color on black. |
| `--rt-text-dim` | `#8C93B8` | `--md-ink-muted` (#818181) | Captions, labels, secondary text. |
| `--rt-white` | `#FFFFFF` | `--md-white` | Pure white — fire-core highlights, max-contrast numerals on dark cells. |

### Neon accent tokens (the loud half)

| New token | Hex | Replaces (nearest) | Role & rules |
|---|---|---|---|
| `--rt-blue` | `#1FA8FF` | `--md-blue` (#2ba5ff) | **Electric arcade blue** — the NBA Jam instruction-bar / "home team" blue. Primary panel headers, info, links, left-team theming. |
| `--rt-cyan` | `#36F0E0` | `--md-teal-bright` (#53dbc9) | CRT cyan — wins glow, positive net rating, secondary CTA, "select" highlight. |
| `--rt-magenta` | `#FF2EA6` | `--md-coral` (#ff7169) | **Hot player-select magenta** — the signature loud color. Right-team theming, tournament flair, primary CTA option B. |
| `--rt-purple` | `#7B3CFF` | `--md-sky` (#6fc2ff) | Player-select purple — era/decade theming, "Flex" slot, premium. |
| `--rt-flame` | `#FF5A1F` | `--md-orange` (#ff9538) | **"ON FIRE" flame orange** — streaks, hype, the fire gradient base, destructive only when paired with red. |
| `--rt-flame-hot` | `#FF1E3C` | — | Flame red core / losses / "L" markers / GAME OVER. |
| `--rt-yellow` | `#FFE21A` | `--md-yellow` (#ffde00) | **Lightning / "PRESS START" yellow** — attract-mode flashing text, coin/score accents, fire mid-tone. The brightest thing on screen. |
| `--rt-green` | `#39FF7A` | `--md-teal` (#16aa98) | **CRT phosphor green** — scoreboard numerals, "WIN" / GO state, leaderboard rank-up arrows. |

### The fire gradient (used for "on fire" / undefeated)
```css
--rt-fire: linear-gradient(180deg, #FFFFFF 0%, #FFE21A 28%, #FF5A1F 62%, #FF1E3C 100%);
```
White-hot core → lightning yellow → flame orange → flame red, exactly the NBA Jam ball-fire ramp (white/yellow/orange flame lifted from *Smash TV*).

### Neon glow recipe (the look that makes it CRT, not flat)
Every neon element gets a layered `text-shadow` / `box-shadow` bloom in its own color:
```css
--rt-glow-blue:    0 0 4px #1FA8FF, 0 0 12px rgba(31,168,255,.7), 0 0 28px rgba(31,168,255,.35);
--rt-glow-green:   0 0 4px #39FF7A, 0 0 12px rgba(57,255,122,.7), 0 0 28px rgba(57,255,122,.35);
--rt-glow-magenta: 0 0 4px #FF2EA6, 0 0 12px rgba(255,46,166,.7), 0 0 28px rgba(255,46,166,.35);
--rt-glow-yellow:  0 0 4px #FFE21A, 0 0 14px rgba(255,226,26,.8), 0 0 30px rgba(255,226,26,.4);
```

### WCAG / contrast notes — where the glow must yield

Neon-on-black is high-contrast by nature, which helps; the danger is *thin neon strokes* and *neon-on-neon*. Rules:

- **Data is white, not neon.** All box-score values, win-loss records, ranks, and table cells render in `--rt-text` (#EAF2FF) or `--rt-white` on `--rt-panel`/`--rt-panel-2`. #EAF2FF on `#11121F` ≈ **15:1** — far above AA. Neon is for the *labels and chrome around* the numbers, not the numbers themselves.
- **Body text never gets glow.** `text-shadow` bloom degrades small-text legibility. Glow is allowed only at ≥20px (headings, scoreboard digits, capsules). Body copy (VT323/Inter, ≤16px) is flat.
- **Audit the loud neons on black** (large/heading use only):
  - `--rt-yellow` #FFE21A on #08080F ≈ **16.8:1** ✅ (best for attract text)
  - `--rt-green` #39FF7A on #08080F ≈ **15.6:1** ✅ (scoreboard numerals)
  - `--rt-cyan` #36F0E0 on #08080F ≈ **13.9:1** ✅
  - `--rt-magenta` #FF2EA6 on #08080F ≈ **6.4:1** ✅ for ≥18px bold; borderline for body — **never use magenta for small text**, only headings/fills.
  - `--rt-blue` #1FA8FF on #08080F ≈ **7.0:1** ✅ headings; for body-size links bump to `--rt-cyan`.
  - `--rt-flame` #FF5A1F on #08080F ≈ **5.4:1** ✅ ≥18px only; pair losses with the white numeral, color the *label*.
- **Never put neon text on a neon fill.** Magenta/blue/green fills always carry **#08080F** or **#FFFFFF** text, whichever wins contrast (black on yellow/green/cyan; white on magenta/purple/flame-red/blue).
- **Scanline overlay must not eat contrast.** Cap scanline opacity at **0.06–0.10** and never overlay scanlines on a data table cell (see §9).

---

## 3. Typography

All faces below are **on Google Fonts** (verified via fonts.google.com). The one exception — a true seven-segment face — is called out explicitly with a Google fallback. The hard rule of pixel/arcade type: **it is illegible at body size.** We use a chunky display face for shouting, an LED/segment face for numbers, and a readable companion for everything you actually read.

### The four roles

| Role | Font (Google Fonts) | Used for | Banned for |
|---|---|---|---|
| **Display / marquee** | **Press Start 2P** | The `daily82` logo wordmark, the hero/attract title, "GAME OVER", "INSERT COIN", capsule micro-labels (sparingly). Pure 8-bit bitmap. | Anything over ~3 words, anything ≤14px line you must read in a paragraph. |
| **Headline / hype** | **Bungee** (or **Audiowide** for a softer techno feel) | Section headers, button labels, "DAILY CHALLENGE", "HIGH SCORES", player names, big callouts. Chunky urban-signage caps — readable where Press Start 2P isn't. | Body paragraphs. |
| **Scoreboard numerals** | **DSEG7 Classic** *(NOT on Google Fonts — see note)*; Google-Fonts fallback **Orbitron** (700/900), final fallback `ui-monospace` tabular | The seven-segment scoreboard: the big record (e.g. `73-9`), rank `#24`, countdown timer, score count-ups. | Letters/words (it's digits-first); body text. |
| **Body / data** | **VT323** (CRT terminal pixel face, readable) with **Inter** as the true small-text fallback for dense tables | All readable copy, box-score cell values, leaderboard rows, helper text, form inputs. | — |

> **Seven-segment note (read this).** A genuine 7-segment LED face — **DSEG / DSEG7 Classic** (keshikan, SIL OFL) — is the authentic NBA-Jam-scoreboard look but is **not hosted on Google Fonts**; it must be self-hosted (drop the woff2 in `/public/fonts`, declare with `@font-face`, or wrap via `next/font/local`). If you want a **Google-Fonts-only** build, use **Orbitron 900** as the scoreboard numeral face — it's geometric, tabular, and reads as a digital readout, just not literally segmented. Recommendation: ship **Orbitron** day one (zero new asset pipeline), and optionally swap to **DSEG7 Classic** behind `next/font/local` for the hero scoreboard only.

> **VT323 vs. Inter.** VT323 nails the glowing-monitor body feel and is legible down to ~15px, but it's a single weight and gets shaky in very dense tables. Use **VT323** for hero/marketing copy and medium-density UI; fall back to **Inter** (tabular-nums) for the leaderboard and the 5-column box score where row density and number alignment matter most. Pick per-surface, documented in the component table.

### `next/font/google` setup (replaces Space Mono + Inter in `app/layout.tsx`)
```ts
import { Press_Start_2P, Bungee, Orbitron, VT323, Inter } from "next/font/google";

const display = Press_Start_2P({ variable: "--font-display", weight: "400", subsets: ["latin"] });
const hype    = Bungee({         variable: "--font-hype",    weight: "400", subsets: ["latin"] });
const seg     = Orbitron({       variable: "--font-seg",     weight: ["700","900"], subsets: ["latin"] });
const term    = VT323({          variable: "--font-term",    weight: "400", subsets: ["latin"] });
const sans    = Inter({          variable: "--font-sans",    subsets: ["latin"] });
// optional authentic scoreboard:
// import localFont from "next/font/local";
// const seg7 = localFont({ src: "../public/fonts/DSEG7Classic-Bold.woff2", variable: "--font-seg7" });
```
```css
:root {
  --font-display-stack: var(--font-display), "Press Start 2P", monospace; /* bitmap; tiny use */
  --font-hype-stack:    var(--font-hype), "Bungee", system-ui, sans-serif;
  --font-seg-stack:     var(--font-seg7, var(--font-seg)), "Orbitron", ui-monospace, monospace;
  --font-body-stack:    var(--font-term), "VT323", ui-monospace, monospace;
  --font-data-stack:    var(--font-sans), Inter, system-ui, sans-serif; /* dense tables only */
}
```

### Type scale (px) and where each face is allowed

| Token | px / line-height | Face | Notes |
|---|---|---|---|
| `--t-attract` | 40–72 (clamp) / 1.05 | Press Start 2P | Hero/attract title only. Letter-spacing 0 (the bitmap has its own metrics). |
| `--t-logo` | 18–28 / 1 | Press Start 2P | Header wordmark `daily82`. |
| `--t-h1` | 32 / 1.05 | Bungee | Page headlines where Press Start 2P would be too dense. |
| `--t-h2` | 24 / 1.1 | Bungee | "DAILY CHALLENGE", "HIGH SCORES". Uppercase. |
| `--t-h3` | 18 / 1.15 | Bungee | Card titles, button labels. Uppercase, letter-spacing .02em. |
| `--t-score-xl` | 56–96 (clamp) / 1 | Orbitron 900 / DSEG7 | The hero scoreboard record. Glow allowed. |
| `--t-score` | 28 / 1 | Orbitron 900 / DSEG7 | Result-card record, rank. |
| `--t-label` | 11 / 1.3 | Press Start 2P **or** Bungee | Micro caps labels (capsules, stat headers). Press Start 2P only at exactly 8/16px to stay crisp; otherwise Bungee. Letter-spacing .06em. |
| `--t-body` | 16 / 1.5 | VT323 (→ Inter for tables) | Default readable copy. |
| `--t-body-sm` | 14 / 1.45 | VT323 / Inter | Helper text. |
| `--t-data` | 14–16 / 1.3 | Inter tabular-nums | Box-score cell values, leaderboard rows. **This is the legibility floor — keep it sans, not pixel, in dense grids.** |

### HERO treatment — replaces `Go 82–0.` → `GO UNDEFEATED.` as an attract screen

The current hero is a yellow paper tile with `Go 82–0.` in Space Mono. The new hero **is a 1993 cabinet attract screen**:

- **Background:** `--rt-black` with the global CRT skin (scanlines + vignette + faint flicker) and a low magenta→purple radial glow rising from the bottom (replacing the cream "sunbeam").
- **Eyebrow:** `PUSH PLAYERS · DRAFT FIVE · GO UNDEFEATED` in Bungee 11px, `--rt-cyan`, letter-spacing .18em — the attract instruction bar.
- **Title:** `GO UNDEFEATED.` in **Press Start 2P**, `clamp(40px, 11vw, 72px)`, stacked two lines on mobile (`GO` / `UNDEFEATED.`), filled `--rt-yellow` with `--rt-glow-yellow` and a 3px chrome bevel drop-shadow. (Keep it short — Press Start 2P punishes long strings.)
- **Flashing CTA:** below the title, a blinking `▸ PRESS START` / `INSERT COIN` line in `--rt-green` (the real Play button), `arcade-blink` animation 1.1s steps(2).
- **Idle hype:** the slot-reel quietly cycles team logos behind glass during idle (attract loop), echoing the cheerleader who jogs across NBA Jam's attract mode.

---

## 4. Geometry

The old system was flat fills + 2px ink borders + zero radius + hard offset shadows. We keep the **zero-to-tiny radius and the chunky structure**, but swap warm flat ink for **CRT glass + chrome bevels + neon glow**.

- **Radius:** **2px** default (pixels were never perfectly round). Pills/capsules 4px. Scoreboard wells 0px. No soft cards.
- **Borders:** the heavy "ink" border becomes a **double edge**: a 2px neon (`--rt-blue`/`--rt-magenta`/`--rt-green` per context) outer line + a 1px `--rt-line` inner, reading like a glowing screen frame. Plain panels use a single 1px `--rt-line`.
- **Bevels / chrome (the Midway move):** primary buttons and the scoreboard frame use a **beveled chrome edge** — light `--rt-chrome` on top/left, dark `--rt-chrome-dark` on bottom/right — built with `box-shadow` insets, not images:
  ```css
  box-shadow:
    inset 2px 2px 0 var(--rt-chrome),
    inset -2px -2px 0 var(--rt-chrome-dark),
    0 0 0 2px #000,            /* cabinet black keyline */
    var(--rt-glow-blue);       /* outer neon bloom */
  ```
- **Shadows:** the old hard *offset* shadow (`4px 4px 0 ink`) is replaced by **neon glow bloom** (colored, blurred) as the "lift" cue. For chrome elements, keep a 1px hard black keyline so they pop off the CRT.
- **Glow as elevation:** resting card = faint 8px glow; hover/active = brighter, larger glow (the element "powers up"). This replaces the old translate-on-hover offset-shadow trick.
- **CRT / scanline skin (global):** a fixed full-viewport overlay (pointer-events:none) carrying (a) horizontal scanlines, (b) a radial vignette darkening the corners like curved glass, (c) an optional ~0.03 flicker. All gated by `prefers-reduced-motion` and a user toggle (see §9).
  ```css
  .crt-scanlines::after {
    content:""; position:fixed; inset:0; z-index:9999; pointer-events:none;
    background: repeating-linear-gradient(
      to bottom, rgba(0,0,0,0) 0 2px, rgba(0,0,0,.10) 2px 3px);
    mix-blend-mode: multiply;
  }
  .crt-vignette::before {
    content:""; position:fixed; inset:0; z-index:9998; pointer-events:none;
    background: radial-gradient(120% 100% at 50% 50%, transparent 60%, rgba(0,0,0,.55));
  }
  ```
- **Spacing rhythm:** an **8px grid** (homage to Press Start 2P's 8px metrics). Section gaps 24/32px, card padding 16/24px, capsule padding 6×12px. Tighter and more "packed HUD" than the airy current layout.

---

## 5. Component restyle table

| Component (current `.md-*`) | NBA Jam version |
|---|---|
| **Header / logo** | `daily82` in Press Start 2P, chrome-beveled, `--rt-yellow` with yellow glow, on `--rt-black` bar with a 1px `--rt-blue` underglow line (the instruction bar). The `+`/era marker becomes a small flaming-ball glyph. |
| **Hero** | The attract title screen (§3). Flashing PRESS START, slot reel idling behind glass, magenta→purple bottom glow. |
| **Capsule / pill (`.md-capsule`)** | "Coin-op tag": 4px-radius, neon 2px border + matching glow, fill `--rt-panel`, label in Bungee 11px caps. Color variants map blue/cyan/magenta/green. Black text only on light fills. |
| **Card (`.md-card` + `--lift`)** | "CRT panel": `--rt-panel` field, double neon/indigo edge, glow as lift. Header strip in `--rt-blue` with Bungee caps title (the NBA Jam blue bar). |
| **Buttons (`.md-btn` family)** | **Arcade cabinet button**: chrome bevel + neon glow, presses *in* (bevel inverts) on `:active` instead of offset-sliding. Primary = green "START" glow; secondary = blue; danger = flame-red. |
| **Text input (`.md-input` / `--name`)** | **High-score entry**: black well, inset bevel, `--rt-green` segmented-feel caps text, a blinking block caret. The `--name` variant already does uppercase + letter-spacing — push spacing to .3em so it reads like `A_A_A` initials. |
| **Team badge (`.md-badge`)** | Boxed digitized-portrait card: 2px key-line in the team's neon, team tricode in Bungee, on `--rt-panel-2`. Left-team theming leans `--rt-cyan`, right-team `--rt-magenta` (NBA Jam select panels). |
| **Sunbeam backdrop (`.md-sunbeam`)** | Replaced by the **bottom neon glow** + CRT vignette + scanlines. A magenta/purple radial rising from the floor of the screen. |
| **Slot reel (`.md-spinning`)** | **Coin-op reel** behind glass (§6): fast blur-roll, then a hard **buzzer snap** to the result with a yellow flash + screen-shake. |
| **Stat grid (`.md-statline`/`.md-stat`)** | **Digital scoreboard** (§ below): black wells, green seven-segment values, Bungee caps labels, thin `--rt-line` gridlines. Values stay flat (no glow) for legibility. |
| **Leaderboard / Daily ranks** | **HIGH SCORES table** (§ below). |
| **Scrollbar (`.md-scroll`)** | Black track, `--rt-blue` thumb with faint glow, 2px radius. |

### CSS sketches (the load-bearing ones)

**Arcade cabinet button** (replaces `.md-btn`):
```css
.rt-btn {
  display:inline-flex; align-items:center; justify-content:center; gap:8px;
  padding:14px 24px; border-radius:2px; cursor:pointer;
  font-family:var(--font-hype-stack); font-size:16px; text-transform:uppercase;
  letter-spacing:.04em; color:#08080F; background:var(--rt-green);
  border:0; line-height:1;
  box-shadow:
    inset 2px 2px 0 rgba(255,255,255,.55),
    inset -2px -2px 0 var(--rt-chrome-dark),
    0 0 0 2px #000, var(--rt-glow-green);
  transition: filter .08s ease, box-shadow .08s ease, transform .04s ease;
}
.rt-btn:hover:not(:disabled){ filter:brightness(1.12); }
.rt-btn:active:not(:disabled){              /* presses INTO the cabinet */
  transform:translateY(1px);
  box-shadow:
    inset -2px -2px 0 rgba(255,255,255,.4),
    inset 2px 2px 0 var(--rt-chrome-dark),
    0 0 0 2px #000;
}
.rt-btn:disabled{ filter:grayscale(.7) brightness(.7); cursor:not-allowed; box-shadow:0 0 0 2px #000; }
.rt-btn--blue  { background:var(--rt-blue);    color:#fff; box-shadow:inset 2px 2px 0 rgba(255,255,255,.5), inset -2px -2px 0 var(--rt-chrome-dark), 0 0 0 2px #000, var(--rt-glow-blue); }
.rt-btn--danger{ background:var(--rt-flame-hot); color:#fff; }
.rt-btn--lg{ padding:18px 34px; font-size:20px; }
.rt-btn--sm{ padding:8px 14px;  font-size:13px; }
```

**CRT panel / card** (replaces `.md-card`):
```css
.rt-card {
  background:var(--rt-panel); border-radius:2px;
  border:1px solid var(--rt-line);
  box-shadow: 0 0 0 2px rgba(31,168,255,.0), 0 0 10px rgba(31,168,255,.18);
}
.rt-card--lift { box-shadow: 0 0 0 2px var(--rt-blue), 0 0 18px rgba(31,168,255,.35); }
.rt-card__bar {                       /* the NBA Jam blue header bar */
  background:var(--rt-blue); color:#04121f; padding:8px 16px;
  font-family:var(--font-hype-stack); text-transform:uppercase; letter-spacing:.04em;
  font-size:14px; border-radius:2px 2px 0 0;
}
```

**Digital scoreboard / stat grid** (replaces `.md-statline`/`.md-stat`):
```css
.rt-scoreboard {
  display:grid; grid-template-columns:repeat(5,1fr); gap:1px;
  background:var(--rt-line); border:2px solid #000; border-radius:2px;
  box-shadow: var(--rt-glow-blue);
}
.rt-stat { background:#04060C; padding:8px 4px; text-align:center; }
.rt-stat__label {                      /* caps label, dim, flat */
  font-family:var(--font-hype-stack); font-size:10px; letter-spacing:.08em;
  text-transform:uppercase; color:var(--rt-text-dim);
}
.rt-stat__value {                      /* SEVEN-SEGMENT, green, flat (legible) */
  font-family:var(--font-seg-stack); font-weight:900; font-size:20px;
  color:var(--rt-green); font-variant-numeric:tabular-nums;
  /* glow OFF on dense data values; keep crisp */
}
```

**The slot reel as a coin-op reel** (replaces `.md-spinning`):
```css
@keyframes rt-reel-roll { from{ transform:translateY(0) } to{ transform:translateY(-100%) } }
.rt-reel { will-change:transform; animation: rt-reel-roll .12s linear infinite; filter:blur(1px); }
@keyframes rt-reel-snap {                 /* the buzzer stop */
  0%{ transform:translateY(-6px); filter:brightness(2) } 100%{ transform:translateY(0); filter:none } }
.rt-reel--stop { animation: rt-reel-snap .18s steps(3) both; }
```

**HIGH SCORES table** (Daily leaderboard — legibility-first):
- Header: `HIGH SCORES` in Press Start 2P (or Bungee) `--rt-yellow`, on a black bar.
- Rows: rank in **Orbitron** green seven-segment (`#01`…), initials in **Bungee** caps, record + net in **Inter tabular-nums** white (the readable data). Zebra via `--rt-panel` / `--rt-panel-2`. **No glow, no scanlines on rows** — this is a leaderboard you read.
- Your row: highlighted with a `--rt-magenta` 2px left bar + faint magenta row tint (the "that's you" cue), like your initials blinking on the high-score screen.

```html
<table class="rt-highscores">
  <thead><tr><th>RANK</th><th>NAME</th><th>RECORD</th><th>NET</th></tr></thead>
  <tbody>
    <tr><td class="seg">01</td><td>JAM</td><td>82-0</td><td>+18.4</td></tr>
    <tr class="me"><td class="seg">24</td><td>JKM</td><td>73-9</td><td>+15.1</td></tr>
  </tbody>
</table>
```

---

## 6. Motion

Arcade motion is **snappy, stepped, and loud** — `steps()` easing, not smooth cubic-beziers. Every animation has a `prefers-reduced-motion: reduce` fallback that drops to a static state.

| Moment | Animation | Detail |
|---|---|---|
| **Slot-reel spin → buzzer snap** | `rt-reel-roll` blur-roll, then `rt-reel-snap` 3-step hard stop with a 1-frame yellow flash + 120ms screen-shake. | The defining interaction. Sound-design hook: buzzer/coin SFX (optional, muted by default). |
| **"ON FIRE" on win streak / undefeated** | Flame gradient animates upward on the ball + record; `--rt-glow-yellow` pulses; net "singes" (a one-shot flame sprite). | Triggered on perfect (82-0) and on big margins. Cap pulse loop count; calm after 3 cycles. |
| **Attract-mode text** | `arcade-blink` — `INSERT COIN` / `PRESS START` blink at 1.1s `steps(2)`. | Only the hero CTA and "your row" cursor blink; never blink body content (seizure/annoyance risk). |
| **CRT flicker** | Global overlay opacity jitters ~0.02–0.04 at ~8s intervals; one-time "power-on" scan sweep on first load (200ms). | Subtle. Off under reduced-motion and the CRT toggle. |
| **Score count-up** | Result record counts up on the seven-segment readout (0→73, etc.) over ~600ms `steps(20)`; rank ticks down to `#24`. | Reduced-motion: render final value instantly. |
| **Screen-shake on big results** | 120–200ms translate jitter (±3px) on perfect seasons / champion. | One-shot; never on routine actions. Reduced-motion: a single static glow flash instead. |
| **Button press** | Bevel inverts + 1px down translate (§5). | Instant; no shake. |

```css
@keyframes arcade-blink { 0%,49%{opacity:1} 50%,100%{opacity:0} }
.attract-blink{ animation: arcade-blink 1.1s steps(2,start) infinite; }
@keyframes screen-shake { 10%,90%{transform:translate(-2px,1px)} 30%,70%{transform:translate(3px,-2px)} 50%{transform:translate(-3px,2px)} }
.shake{ animation: screen-shake .18s steps(2) 1; }
@media (prefers-reduced-motion: reduce){
  .attract-blink, .shake, .rt-reel, .rt-reel--stop { animation:none !important; }
  .crt-scanlines::after, .crt-vignette::before { display:none; }
}
```

---

## 7. Iconography / imagery / texture

- **Flaming basketball** — the hero mascot, replacing the duck. Orange→yellow→white flame ramp; used for the logo `+`, the on-fire state, and the favicon. Pixel-sprite rendering, not a smooth vector.
- **Lightning bolts** — Midway/MK accent for big moments, tournament brackets, "POWER UP."
- **Scanlines + CRT vignette** — global texture (§4). The single biggest "this is a CRT" cue.
- **Dithering / limited-palette gradients** — emulate the 16-bit `xRGB 1555` look: use **stepped/dithered gradients** (CSS `repeating-linear-gradient` bands or a tiny PNG dither overlay) instead of smooth ones in decorative panels. Authentic to the 32,768-color hardware Sanglard documented.
- **Pixel sprites & digitized portraits** — player draft cards get a hard neon key-line and a faint dither, evoking NBA Jam's digitized photo heads. Render team logos as pixel-snapped (`image-rendering:pixelated`).
- **Chrome bevels** — silver beveled edges on primary chrome (logo, START button, scoreboard frame), built with inset box-shadows (§4), echoing the Midway metal logotype.
- **Coin / arcade glyphs** — coin slot, joystick, "1P/2P", `▸` triangle cursors as list bullets and the PRESS START marker.
- **Imagery discipline:** texture lives on chrome and decoration; **data surfaces stay clean** (flat black wells, no dither, no scanlines).

---

## 8. Homepage walkthrough — before → after

### A) Mobile hero → attract-mode title screen
**Before:** centered eyebrow "A DAILY BASKETBALL DRAFT PUZZLE" (Space Mono caps, muted ink) over `Go 82–0.` in dark ink on cream, with a yellow radial sunbeam and a paragraph of helper text.

**After:**
- Page background flips to `--rt-black` with the global CRT skin; a magenta→purple glow rises from the bottom edge.
- Eyebrow → `▸ DRAFT FIVE · GO UNDEFEATED` in Bungee caps, `--rt-cyan`, letter-spacing .18em — the instruction bar.
- Title → `GO` / `UNDEFEATED.` stacked, **Press Start 2P** `clamp(40px,11vw,72px)`, `--rt-yellow` fill + yellow glow + chrome bevel drop-shadow.
- Below: a blinking `▸ PRESS START` in `--rt-green` (this *is* the Play CTA), `attract-blink`.
- The 7-day strip and helper copy move into **VT323** body, dimmed, beneath the fold — still readable, no glow.
- The slot reel idles behind a "glass" panel, slow-cycling team logos (attract loop).

### B) The "Daily Challenge / Today's Result 73-9 / Rank #24" card → coin-op scoreboard
**Before (`.md-card`):** white card, yellow header strip "Daily Challenge" + 🏆, result and rank in Space Mono on cream cells.

**After — a cabinet scoreboard panel:**
- Card = `rt-card`; header bar = NBA Jam **blue** strip, `DAILY CHALLENGE` in Bungee caps, the 🏆 swapped for a small flaming-ball + lightning glyph.
- The result becomes the **scoreboard readout**: `73` and `9` rendered as big **green seven-segment** numerals (Orbitron 900 / DSEG7) in two black wells separated by a segmented `-`, labels `WINS` / `LOSSES` in dim Bungee caps under each. The number is flat (no glow) so it stays crisp; the *frame* glows blue.
- **Rank `#24`** sits in a magenta "high-score" capsule: `RANK` label + green seg numeral, with a `▸` cursor — reads like your initials on the high-score board. If today's result is **82-0**, the whole card goes **ON FIRE**: the record runs the fire gradient, net pulses, a one-shot net-singe sprite fires, optional screen-shake.
- Net rating / margin row uses **Inter tabular-nums** white on a `--rt-panel-2` well — the legible data line.
- CTA at the bottom: `▸ PLAY TODAY` (green START button) when unplayed; `VIEW RESULT` (blue) when done; `INSERT COIN` flavor only as decoration, never as the literal label for a free game.

---

## 9. Tradeoffs, signal & accessibility guardrails

**What it signals.** Fun, nostalgic, high-energy, unmistakably *basketball arcade*. It owns the "Boomshakalaka" lane and leans all the way into the app's existing slot-reel + high-score DNA. It reads young, playful, and confident — the opposite of the cozy, corporate-adjacent cream-paper look it replaces.

**Tradeoffs.**
- **Pixel type is a liability if misused** — Press Start 2P is gorgeous at logo/hero scale and unreadable in a sentence. The whole type system is built to keep it caged (display only) and route real reading to VT323/Inter. Hold that line or the app becomes illegible.
- **CRT maximalism vs. a data product** — daily82 is stats-forward. Scanlines, glow, and flicker are *delightful as chrome* and *hostile on a box score*. The guide deliberately strips effects off data surfaces.
- **Neon-on-black can fatigue** in long sessions and is harder for some low-vision users than the old high-key paper look.
- **Authentic 7-segment** needs a self-hosted font (DSEG); the Orbitron fallback ships clean but is less literally "scoreboard."

**Usability & accessibility guardrails (non-negotiable):**
1. **A "CRT FX" toggle** in the header (default ON, persisted) that disables scanlines, vignette, flicker, and glow in one switch. Honor `prefers-reduced-motion` to default it OFF and to kill all blink/shake/reel/count-up animation.
2. **Scanlines never touch data.** No scanline/vignette overlay over the box score, leaderboard rows, or form inputs. Cap global scanline opacity ≤0.10; vignette ≤0.55 at the corners only.
3. **Data is white, glow-free, AA+.** Box-score values, records, ranks, and table cells use `--rt-text`/`--rt-white` on dark wells (≥7:1), Inter tabular-nums in dense grids, no `text-shadow`.
4. **Neon is for ≥18px.** No magenta/flame/blue neon on text smaller than 18px; small links use `--rt-cyan` (highest legible neon). Never neon-on-neon.
5. **No blinking body content.** Blink is limited to the single hero CTA and the "your row" cursor; nothing flashes faster than ~2Hz (seizure safety).
6. **Sound off by default.** Any buzzer/announcer SFX is opt-in and muted on load.
7. **Focus states stay visible** — keyboard focus rings use a solid `--rt-cyan` 2px outline that survives even with CRT FX off.

---

## 10. Sources

- NBA Jam — Museum of the Game / International Arcade Museum: https://www.arcade-museum.com/Videogame/nba-jam
- NBA Jam Operations Manual (Midway): https://www.arcade-museum.com/manuals-videogames/N/NBAJam.pdf
- Fabien Sanglard — "A trip down the NBA Jam (T.E.) graphics pipeline" (resolution, 16-bit xRGB1555 palette, digitized sprites): https://fabiensanglard.net/nbajamte/
- NBA Jam (1993 video game) — Wikipedia (digitized sprites, "on fire", Boomshakalaka, Turmell): https://en.wikipedia.org/wiki/NBA_Jam_(1993_video_game)
- MEL Magazine — "The Behind-the-Scenes Story of 'He's on Fire!' in NBA Jam" (fire/smoke from Smash TV): https://melmagazine.com/en-us/story/hes-on-fire-nba-jam
- NLSC — "Wayback Wednesday: Why Being On Fire Was So Cool in NBA Jam": https://www.nba-live.com/ww-why-being-on-fire-was-so-cool-in-nba-jam/
- The Cutting Room Floor — Proto:NBA Jam (SNES) (teal/purple team-select panels): https://tcrf.net/Proto:NBA_Jam_(SNES)
- The Cutting Room Floor — NBA Jam (SNES): https://tcrf.net/NBA_Jam_(SNES)
- MobyGames — NBA Jam (Arcade, 1993) screenshots: https://www.mobygames.com/game/6609/nba-jam/screenshots/arcade/665920/
- Games Database — NBA Jam TE arcade title-screen artwork: https://www.gamesdatabase.org/media/arcade/artwork-title-screen/nba-jam-te
- The Spriters Resource — NBA Jam TE title-screen logo: https://www.spriters-resource.com/snes/nbajamte/asset/58757/
- Google Fonts — Press Start 2P: https://fonts.google.com/specimen/Press+Start+2P
- Google Fonts — VT323: https://fonts.google.com/specimen/VT323
- Google Fonts — Bungee: https://fonts.google.com/specimen/Bungee
- Google Fonts — Audiowide: https://fonts.google.com/specimen/Audiowide
- Google Fonts — Orbitron: https://fonts.google.com/specimen/Orbitron
- DSEG 7-/14-segment font (keshikan, SIL OFL — NOT on Google Fonts, self-host): https://www.keshikan.net/fonts-e.html  ·  https://github.com/keshikan/DSEG
- Medium (Dovid Edelkopf) — "Using CSS Animations To Mimic The Look Of A CRT Monitor": https://medium.com/@dovid11564/using-css-animations-to-mimic-the-look-of-a-crt-monitor-3919de3318e2
- DEV.to (ekeijl) — "Retro CRT terminal screen in CSS + JS": https://dev.to/ekeijl/retro-crt-terminal-screen-in-css-js-4afh
- Aesthetics Wiki — "Arcadecore" (high-contrast neon on dark, CRT glow): https://aesthetics.fandom.com/wiki/Arcadecore
- Web UI Prompt — "Vaporwave" (neon saturation, scanlines, glow maximalism): https://www.webuiprompt.com/design/vaporwave
- Basketball-Reference (data-table baseline — tabular numerals, scannable rows): https://www.basketball-reference.com/
