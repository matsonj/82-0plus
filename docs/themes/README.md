# daily82 — Re-theme directions

Four complete, implementable style guides exploring distinct aesthetics for the **82-0+ → daily82** rebrand. The current look is the MotherDuck "cream paper / thick ink / orange duck" neo-brutalist arcade system (Space Mono + Inter, flat fills, 2px ink borders, zero radius, hard offset shadows). It reads warm/cozy — "too Claude-themed" — and we want a distinct **sports** identity.

Each guide re-skins the *same* foundation: the `--md-*` token set in `app/globals.css` and the existing component inventory (header/logo, hero, capsule, card, buttons, arcade input, team badge, sunbeam, slot-reel animation, 5-col box-score stat grid, custom scrollbar). Every guide maps its palette token-by-token onto those slots, picks Google-Fonts-available type, and gives CSS sketches + a mobile homepage before→after. Researched against live sports sites (Basketball Reference, ESPN, NBA.com, Yahoo Sports) plus theme-specific references.

| # | Direction | One-line vibe | Palette | Display / Sans | Biggest move |
|---|-----------|---------------|---------|----------------|--------------|
| [01](01-classic.md) | **Classic** | Ink on newsprint, set in the press box — a '70s NBA record book | Newsprint cream + ink, **navy** structure, barn-red verdict, honor-gold | **Domine** (serif) + **Libre Franklin** | Basketball-Reference ruled box score becomes the signature; hairline rules replace thick boxes + shadows |
| [02](02-modern.md) | **Modern** | "Broadcast Dark" — an NBA League Pass score bug in your pocket | **Dark-first** near-black surfaces, off-white text, electric **court-green** accent (= "win") | **Archivo** + **Inter** | Kill ink borders/shadows; rounded cards, elevation-by-surface + glow; dark mode |
| [03](03-postmodern.md) | **Post-modern** | Editorial poster / streetwear drop — breaks the polite grid | Black + bone, **acid-lime** beacon, riso/City-Edition clash colors (chrome only) | **Archivo** (width axis) + **Anton** + Space Mono | Oversized off-grid hero ("GO / UNDE / FEATED.") bleeding off-edge with a die-cut "82" sticker |
| [04](04-90s-retro.md) | **90s Retro** | BOOMSHAKALAKA — a 1993 NBA Jam / Midway cabinet attract screen | Hot neon on CRT near-black: arcade blue, magenta, flame orange, lightning yellow, phosphor green | **Press Start 2P** + **Bungee** + **Orbitron** + **Inter** | Homepage = coin-op attract screen w/ CRT skin; result card = seven-segment scoreboard that catches fire on 82-0 |

## How to read these

- **Want credibility & data-density?** → Classic. Best fit for the stats-game DNA; lowest risk; least "fun."
- **Want premium & current?** → Modern. Looks like the apps people already use; dark mode makes scores pop; safe-but-distinctive.
- **Want bold & shareable?** → Post-modern. Highest brand distinctiveness and social-card energy; most execution risk; needs design discipline.
- **Want fun & nostalgic, leaning into the arcade streak the app already has** (slot reel, high-score name entry)? → 90s Retro. Highest personality; biggest accessibility/legibility guardrails (CRT FX toggle, reduced-motion).

## Shared constraints every guide respects

- **Box score & leaderboard stay legible.** Tabular numerals, real contrast — maximalism decorates the chrome, never the numbers.
- **Hero copy:** `Go 82–0.` → `Go undefeated.` (the "82" lives in the wordmark / logo).
- **Implementable as-is:** Tailwind v4 + CSS custom properties in `app/globals.css`, fonts via `next/font/google`.
- The `seed: '82-0+:${date}'` string in `lib/daily.ts` is load-bearing and is **not** a theming concern — leave it.

## Next step

Pick a direction (or a hybrid — e.g. Modern's dark surfaces + Classic's ruled tables). The chosen guide is detailed enough to implement the token swap in `app/globals.css` plus the component restyles directly.
