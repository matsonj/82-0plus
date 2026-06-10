# Private Tournaments — Smoke Test Walkthrough

Dev server: **http://localhost:3000** (`npm run dev`).

Fastest way to exercise the multiplayer bits: **two browser profiles** (or one normal
+ one incognito) so you can be two accounts at once. Account identity is **name + PIN**;
the **Log out** link in My Teams clears the saved account.

> Two caveats up front:
> - **Finalization** requires *all slots filled* (or the 24h expiry window). There's no UI
>   button to force it, so a **size-4 tournament filled with 4 submissions** is the quickest
>   way to see a finished bracket.
> - This runs against the **live MotherDuck dev DB**, so test tournaments persist. They
>   auto-expire in 24h; the admin **Delete tournament** control clears one immediately.

---

## 0. Setup
- [X] Open http://localhost:3000. Home page shows: eyebrow tagline (NOT the old
      "CAN YOU GO 82-0?" pill) → **Daily Challenge** card → **Previous Challenges** link
      directly beneath it → **Private Tournament** card (sky-blue) → "or free play" →
      Classic / Ranked.
- [X] Header (top-right): logo, **My Teams**, and a notification **asterisk (✶)** — grey
      when there are no alerts.

## 1. Main game regression
*(We extracted the shared draft engine + results + entry components — confirm the main game
still works.)*
- [X] **Classic** → draft 5. Tapping a multi-position player shows **"Where does X play?"**
      with glowing eligible slots + a **Cancel pick** button (cancel works here). A
      single-eligible player auto-places.
- [X] Rearrange: tap a placed player, then a glowing slot — moves/swaps. Team/decade skips work.
- [X] Simulate → **ResultsPanel**: record, score breakdown, roster (tap a row for the career
      card in Classic), team box, **Share / Play again / Enter Tournament**.
-  [X] **Enter Tournament** → sixth-man bench roll + captain + name/PIN/team-name → submit →
      bracket result. *(Same `TournamentEntry` the private flow now reuses.)*
- [X] **Ranked**: same, stats hidden. **Daily**: fixed board, stats hidden, one-per-day.

## 2. Private tournament — create
- [X] Home → **Private Tournament** → lands on the Private area with **Create / Join /
      "see my private tournaments"** (no forced login first).
- [X] **Create**, Blind board, **size 4**, Ranked. Tournament **name (up to 24 chars)** +
      tournament **PIN** are separate from your admin account name/PIN.
- [X] **Duplicate check:** create a 2nd tournament with the *same name + same PIN* →
      **rejected** ("pick a different PIN"). Same name + *different* PIN → allowed.
- [X] **Manual board:** create another, choose Manual → decade dropdown then team dropdown
      per slot. 3 teams in one decade → inline error (max 2/decade); 6 distinct teams across
      ≤2-per-decade → accepted.
- [X] On success: share link `…/p/<id>` + Copy. Open the lobby.

## 3. Private draft (reworked UX)
- [X] As admin, **Submit team** (host CTA) → draft begins. Board reveals one team/era at a
      time ("Reveal 1 of 5"…).
- [X] Tap a multi-position player → **"Where does X play?"** + glowing slots, **but no
      Cancel** — private locks the pick (can't swap for a different player; rearrange only).
- [X] Place all 5 → **"See your record"** → **interstitial** = the full ResultsPanel
      (record, breakdown, roster) with a **single "Add sixth man & captain"** button (no
      Share/Play-again). Confirm it's **mobile-width**, not stretched.
- [X] Continue → **sixth man + captain + team name** screen — behaves like the main game's
      tournament entry (sixth from the fixed bench, captain grid, **Submit team**). Submit.
- [X] **Lobby** shows **"Your team is in"** → **Regular season: W–L · ±net**, then
      **Provisional bracket: W–L · <status>**. Submitted count ticks (e.g. "1/4").

## 4. Multiplayer + finalization
- [X] Copy the share link, open in a 2nd profile (logged out) → **public view**: status +
      countdown only, **no rosters leaked**, with a **Register** path. Register as a 2nd
      account and draft a team.
- [X] Fill all 4 slots (4 submissions) → the last submit **auto-finalizes** → `/p/<id>`
      shows the **final bracket** + per-entrant standings. *(Otherwise it waits for the 24h
      window — filling all slots is the quick trigger.)*
- [ ] Your own entry is **highlighted** in the bracket; the logged-out public view is
      **un-highlighted**.

## 5. My Teams + notifications
- [ ] Header **My Teams** → filter tabs **Daily / Ranked / Classic / Private**. Pick one →
      a **"Clear filter · show all"** blue link appears (present on **Private** too).
- [ ] **Private** tab lists your private tournaments (open + completed); each opens `/p/<id>`.
- [ ] **Private-only account:** log out, log in as an account that *only* has a private entry
      → it still loads your private list (no logout / "no team found").
- [ ] Header **asterisk turns coral** when you have a pending or unviewed-completed private
      tournament; opening the **completed** final clears it. Opening an **open** tournament
      does NOT clear it (mark-viewed only fires once completed).

## 6. Admin delete
- [ ] As the host, the lobby/result shows a quiet **"Delete tournament"** → confirm-to-delete
      → routes back to My Teams. A non-host can't delete (server returns 403).

---

### Bracket-format spot checks (optional, needs filling each size)
- [ ] **4**: East final / West final / Final.
- [ ] **8**: conf semis → conf finals → Final.
- [ ] **12**: seeds 1–2 bye the opening round.
- [ ] **16**: standard 8-per-conference.
- [ ] **20**: NBA play-in decides seeds 7/8; play-in loser shows **"Lost Play-In"**; play-in
      games are excluded from displayed W–L.
