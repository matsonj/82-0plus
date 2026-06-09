# Social Sharing Refactor — Plan & Spec

Handoff doc for fixing the two reported share bugs and tightening the sharing
feature. Grounded in the current code + reference implementations (Wordle, MDN
Web Share/Clipboard, Vercel/Next `next/og`).

## Reported symptoms

1. **Unfurl is a coin flip** — the *same* share link sometimes renders the
   social card and sometimes shows a generic/blank preview in iMessage/Slack/etc.
2. **Copy does nothing on iOS** — tapping share/copy on an iPhone copies nothing.

Two distinct share products, treat them separately:

- **Daily challenge** (`/d/[date]?s=`) — **highest priority**. Spoiler-free,
  date-bound, signed token.
- **Classic / Ranked** (`/s?r=`) — identical to each other. Full roster reveal,
  unsigned cosmetic payload.

---

## Current architecture (verified)

| Concern | Daily | Classic/Ranked |
|---|---|---|
| Share route | `app/d/[date]/page.tsx` | `app/s/page.tsx` |
| Payload | `lib/dailyShareToken.ts` — HMAC-SHA256 signed, date-bound (`body.sig`) | `lib/shareCode.ts` — base64url, **unsigned** (cosmetic only) |
| OG image | `app/api/og/route.tsx` (roster **redacted**, `r:[]`) | `app/api/og/route.tsx` (full roster) |
| Share UI | `components/DailyShareLanding.tsx` (`ShareLink`) | `components/ResultsPanel.tsx`, `components/TournamentResults.tsx` |
| Native share / clipboard helper | `lib/shareActions.ts` (`presentShare`) — used by Classic/Tournament | DailyShareLanding has its **own inline** share logic (does NOT use `presentShare`) |
| `metadataBase` | set to `SITE_URL` in `app/layout.tsx:19` ✅ | same |
| OG route config | `runtime="nodejs"`, no cache headers, reads 2 fonts/request | same |

**Things that are already correct — do not "fix" them:**
- `metadataBase` is set, so relative `/api/og?r=...` URLs *are* absolutized by
  Next. The "relative og:image" theory is a red herring here.
- Daily token signing/verification (`dailyShareToken.ts`) is solid: HMAC,
  `timingSafeEqual`, date-bound, forward-compatible (6- vs 10-entry). Keep it.
- Daily OG correctly redacts the roster (no spoilers). Keep it.
- Two-tier model (signed daily token vs unsigned cosmetic classic code) is right.

---

## Bug 1 — iOS copy/share does nothing

### Root cause (confirmed)
`components/DailyShareLanding.tsx` `ShareLink.onShare` (lines ~236–272):

```ts
const onShare = async () => {
  setStatus("working");
  const res = await fetch("/api/daily/share", {...});  // ← async gap #1
  const { share } = await res.json();                   // ← async gap #2
  const url = `${SITE_URL}/d/${date}?s=${share}`;
  if (touch && nav.share) {
    await nav.share({ text, title });   // iOS: transient activation already CONSUMED → NotAllowedError
  } else {
    await navigator.clipboard.writeText(url);  // same problem on desktop, but Chrome is lenient
  }
};
```

iOS Safari only allows `navigator.share` / `navigator.clipboard.write*` from a
**synchronous user-gesture tick**. The two `await`s (mint the signed link, parse
JSON) burn the gesture *before* the share call, so iOS rejects it — silently,
because the `catch` treats it as "user dismissed."

The Classic/Tournament path (`presentShare` in `lib/shareActions.ts`) has the
same latent hazard on its desktop clipboard fallback (`writeText` after the
caller may have awaited a PNG render), but it mostly works because the native
share sheet (file+text) is invoked from a gesture there.

### Fix
**Decouple link-minting from the gesture.** Mint the signed link *before* the
user taps, so the click handler is synchronous:

- Fetch the signed `?s=` token on mount / when the result panel opens (or on
  first focus), store it in state. The Share button's `onClick` then calls
  `navigator.share` / clipboard **with no preceding `await`**.
- If a token isn't ready yet, the button shows "Preparing…" and is disabled —
  never await inside the handler.

**Add a robust, gesture-safe copy helper** (`lib/copyText.ts`) and route every
"Copy link" button through it. Canonical pattern (Safari-safe: pass a *Promise*
into `ClipboardItem` so `write()` stays synchronous):

```ts
// lib/copyText.ts — call ONLY from a click/tap handler, never after an external await.
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({ "text/plain": Promise.resolve(new Blob([text], { type: "text/plain" })) }),
      ]);
      return true;
    }
  } catch {}
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch {}
  try { // legacy fallback for old iOS / locked-down WebViews
    const ta = document.createElement("textarea");
    ta.value = text; ta.readOnly = true;
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
    document.body.appendChild(ta);
    ta.contentEditable = "true";
    const r = document.createRange(); r.selectNodeContents(ta);
    const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(r);
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}
```

- Always show a visible "Copied!" toast — a silent success on mobile reads as a
  no-op. **Never claim "copied" unless a copy path actually returned success.**
- **Distinguish error classes** in `presentShare` / `presentShareIntent`: treat
  `AbortError` as a real user cancel (do nothing), but `NotAllowedError` /
  `TypeError` as genuine failures that must fall through to the copy / manual UI.
  The current `presentShare` (`lib/shareActions.ts:30`) swallows *every* error as
  "handled," so an activation-expired rejection shows the user nothing.
- **Fix copy-semantics inconsistency:** `ResultsPanel.tsx:168` labels the button
  "Copy link" but writes `shareText` (full message); `TournamentResults.tsx:394`
  writes `shareLink` (URL only). Pick one contract per button label.
- Consolidate behind a shared **`ShareIntent` builder** + single
  `presentShareIntent()` (Codex's framing): one place that knows daily =
  text-only signed link, daily-tournament = same destination but token must carry
  the run, classic/ranked = `/s?r=...` full roster. `DailyShareLanding`,
  `ResultsPanel`, and `TournamentResults` all route through it.
- **One share path: image + link together.** The goal is a single native share
  carrying the PNG card *and* the link — NOT a text-only path with a separate
  image button. The reason today's flow breaks on iOS is that
  `buildTournamentShareImage(...)` is `await`ed *inside* the click handler
  (`TournamentResults.tsx:308`), which burns transient activation before
  `navigator.share`. Fix = **precompute the blob, not drop it**: build the PNG
  (and mint the token) before the tap, store both in state, gate the button on
  "both ready." The tap handler is then synchronous:
  `navigator.share({ files: [pngFile], text, url })`.
- Add `url:` to the `navigator.share` payload AND keep the URL embedded in `text`
  — some targets keep the image but drop the structured `url` field, so the link
  must also live in `text`. (Today's code already embeds it in `text`; keep that.)
- Desktop / no `canShare({ files })` → fall back to `copyText(link)` + the
  existing download overlay.

Refs: [Safari ClipboardItem+Promise](https://wolfgangrittner.dev/how-to-use-clipboard-api-in-safari/),
[Apple forums NotAllowedError](https://developer.apple.com/forums/thread/691873),
[MDN Web Share](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share),
[MDN canShare](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/canShare).

---

## Bug 2 — Unfurl is a coin flip

There are **two independent causes**; both must be fixed.

### Cause 2a — Racey share URL (the "link is randomly different" part)
`components/TournamentResults.tsx:295-300`: the daily `shareLink` falls back to a
**bare** `/d/${date}` (no `?s=` token) until the async token fetch in the effect
at line 272 resolves and sets `dailyShareToken`. So:

- Tap **early** → share `/d/2026-06-05` → daily route's `sharerFrom` returns null
  → generic "Daily Challenge · Jun 5" card.
- Tap **later** → share `/d/2026-06-05?s=<token>` → rich "WRECKING CREW went
  82-0 — can you beat it?" card.

Same button, two different URLs depending on timing — this is the most likely
explanation for "the link seems randomly different."

**Fix:** never emit a bare `/d/date` for a completed result. Disable the share
button (show "Preparing link…") until the signed token is in state, or mint the
token as part of the result handoff. This also fixes Bug 1 by making the token
ready *before* the gesture (see below). For daily-tournament shares, the token
must include the tournament run before the button enables.

### Cause 2b — Uncached / slow OG render (the "even the right link flakes" part)
`app/api/og/route.tsx` is `runtime="nodejs"`, reads two `.ttf` files from disk on
**every** request, and sets **no cache headers**. Each scrape is an uncached,
cold-ish render. Link scrapers (Slackbot, iMessage, Twitterbot) enforce a tight
(~2–3s) timeout and **skip the image on timeout** — so the *first* scrape of a
fresh link can fail and a later retry succeeds. Each platform also caches
independently (FB/Slack ~24h, LinkedIn ~7d), so once a bad scrape is cached the
preview stays broken for that platform. That's the nondeterminism.

(`metadataBase` is set, so this is **not** a relative-URL problem.)

### Fix — make the image deterministic, fast, and cached
1. **Cache the OG response.** It's a pure function of `?r=`. Add:
   ```ts
   return new ImageResponse(<…/>, {
     width: 1200, height: 630, fonts: […],
     headers: { "Cache-Control": "public, immutable, no-transform, max-age=31536000" },
   });
   ```
2. **Hoist font reads to module scope** (top-level `await readFile`) so they
   load once per cold start, not per request. Or switch the route to
   `runtime="edge"` with fonts fetched once — measure which is faster on Vercel.
3. **Keep `og:image:width/height` (1200×630)** on every share route — already
   present, verify it survives the refactor. Add `og:image:type` = `image/png`.
4. **Add `openGraph.url` to `/d/[date]`** including the signed `?s=` query, the
   way `/s` already does — gives scrapers a canonical URL and keeps the tokened
   card stable. If the token carries tournament data, the title/description
   should say "tournament"; otherwise "daily challenge." Keep OG images
   spoiler-free either way.
5. **After deploy, force a re-scrape** of known-broken links via each platform's
   debugger (FB Sharing Debugger, X Card Validator, LinkedIn Post Inspector,
   Slack: re-paste in a fresh channel) — caches won't self-heal for up to 7 days.

**Determinism checklist:** same link → byte-identical card, < 2s, absolute URL,
explicit dimensions, edge-cached. If all hold, unfurls stop being random.

Refs: [Next opengraph-image caching](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image),
[Why og:image not showing / scraper timeouts](https://sharescan.io/blog/why-og-image-not-showing-slack-linkedin-x),
[Next #60180 per-platform inconsistency](https://github.com/vercel/next.js/discussions/60180).

---

## Enhancement — Wordle-style share text (optional, do after the two bugs)

Make the share copy spreadable and spoiler-free, Wordle-style:

```
82-0+ Daily Jun 8
🏀 71–11  (+12.4 net)
🟩🟩🟩🟨⬜            ← compact result strip; conveys "how you did", not WHICH players
Beat my season → https://82-0plus.vercel.app/d/2026-06-08?s=…
```

- **Daily**: spoiler-free — emoji strip + record + margin, NO player names; CTA
  links to the same dated route (everyone plays the same puzzle). Stable
  `Daily <Mon D>` title line is the synchronization hook.
- **Classic/Ranked**: full reveal is fine — roster names OK in text and on the
  OG card; CTA = "build your own season" → app root.
- URL on its own final line so scrapers unfurl it cleanly.
- Drive roster-inclusion + CTA off the existing `m: "Daily …"` vs classic flag.

Refs: [Wordle share format](https://emojitimeline.com/wordle-players-use-emojis-to-share-their-results/),
[Wordle story](https://theygotacquired.com/gaming/wordle-acquired-by-the-new-york-times/).

---

## Priority order

1. **Bug 2a (racey URL) + Bug 1 (iOS share/copy)** — these share one fix:
   mint the signed token *before* the gesture (disable the button until ready),
   AND precompute the PNG blob before the gesture, then a synchronous click
   handler that shares **image + link in one native sheet**
   (`navigator.share({ files, text, url })`), falling back to `copyText(link)` +
   download overlay on desktop, with correct error-class handling. Consolidate
   the three share surfaces behind one `ShareIntent` builder + `presentShareIntent()`.
   *Highest user impact; fixes both "random link" and "nothing copied."*
2. **Bug 2b (unfurl render)** — cache `/api/og`, hoist fonts, verify dimensions,
   add `openGraph.url` to `/d/[date]`, re-scrape broken links.
3. **Enhancement** — Wordle-style spoiler-free share text for Daily.

## Test plan (from Codex)
- Unit-test the `ShareIntent` builders so daily **never** emits a bare
  `/d/date` URL for a completed result.
- Mock `navigator.share` / clipboard failures and assert the fallback UI appears
  and "copied" is only claimed on real success.
- Manual pass: iOS Safari + Slack/Discord/iMessage unfurl — **daily challenge
  first**, then classic/ranked.

## Out of scope / notes
- `/t/[id]` tournament bracket pages have no custom OG metadata (generic card).
  Separate follow-up if tournament-link previews matter.
- `SITE_URL` falls back to the prod domain when `NEXT_PUBLIC_SITE_URL` is unset;
  confirm it's set per-environment so preview deploys don't mint prod links.
