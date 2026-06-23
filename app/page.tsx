"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type {
  GameMode,
  PublicPlayer,
  SimPick,
  SimResult,
  SimRosterLine,
} from "@/lib/types";
import { draftSourceKey, type DraftRosterMap } from "@/lib/draftSources";
import { type SlotKind } from "@/lib/positions";
import type { LineupEntry } from "@/components/LineupBoard";
import { LineupDraftBoard } from "@/components/LineupDraftBoard";
import { ResultsPanel } from "@/components/ResultsPanel";
import { DailyArchive } from "@/components/DailyArchive";
import { DailyTimeline } from "@/components/DailyTimeline";
import { DailyLeaderboard } from "@/components/DailyLeaderboard";
import { DailySignIn } from "@/components/DailySignIn";
import { getSavedUser } from "@/lib/tournamentSession";
import {
  getCachedDailyDone,
  setCachedDailyDone,
  type DailyDoneMap,
  type DailyRank,
} from "@/lib/dailyResultsCache";
import { TournamentEntry } from "@/components/TournamentEntry";
import { GlobalHeader } from "@/components/GlobalHeader";
import { HowToPlay } from "@/components/HowToPlay";
import { Countdown } from "@/components/Countdown";
import { encodeShare } from "@/lib/shareCode";
import { SITE_URL, MOTHERDUCK_URL } from "@/lib/site";
import { pacificDate, isPlayableDailyDate } from "@/lib/dailyDate";
import {
  setPendingDaily,
  getOwnedPendingDaily,
  clearPendingDaily,
  listOwnedPendingDailies,
} from "@/lib/dailyPending";

const KINDS: SlotKind[] = ["G", "FLEX", "W", "FLEX", "B"];
type Phase = "menu" | "play" | "tournament";
type GameType = "free" | "daily";

// POST a daily completion, retrying transient (network / 5xx) failures. ok=true
// only when the server CONFIRMS the record (2xx). A 4xx is a definitive rejection
// (e.g. illegal picks) that won't improve on retry — ok=false + rejected=true, so
// the caller can drop the pending lock since no valid record can ever exist for
// these picks. A bare ok=false (network exhausted) leaves the day locked.
async function saveDailyCompletion(body: {
  name: string;
  pin: string;
  date: string;
  picks: unknown;
}): Promise<{ ok: boolean; share?: string; rejected?: boolean }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const cr = await fetch("/api/daily/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (cr.ok) {
        const cj = await cr.json().catch(() => null);
        return { ok: true, share: typeof cj?.share === "string" ? cj.share : undefined };
      }
      if (cr.status >= 400 && cr.status < 500) return { ok: false, rejected: true };
    } catch {
      /* network / timeout — retry */
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }
  return { ok: false };
}

// Each time a decade is used its odds drop 90% (weight × 0.1 per use) so the
// draft spreads across eras instead of clustering in the same time period.
function pickWeightedDecade(pool: number[], usage: Record<number, number>): number {
  const weights = pool.map((d) => Math.pow(0.1, usage[d] ?? 0));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

// Stale-while-revalidate seed for the daily completion RECORD (not the rank —
// that stays server-fresh; see lib/dailyResultsCache). Read ONLY on the client; on
// the server (and therefore the first hydration render, when the cache is always
// empty) it returns null, so the initial render is deterministic and hydration-safe
// — the cache is only ever populated by a post-mount fetch. On a client-side
// remount (navigating back to Home) it returns the last-known record so we paint it
// immediately instead of the loading skeleton.
function readDailyDoneSeed(): DailyDoneMap | null {
  if (typeof window === "undefined") return null;
  const u = getSavedUser();
  return u ? getCachedDailyDone(u.username, u.pin) : null;
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("menu");
  const [mode, setMode] = useState<GameMode>("classic");
  const [gameType, setGameType] = useState<GameType>("free");
  const [dailySlots, setDailySlots] = useState<{ team: string; decade: number }[]>([]);
  // The daily tournament's fixed 6th-man slot (team+decade); null on sparse days.
  const [dailyBench, setDailyBench] = useState<{ team: string; decade: number } | null>(null);
  const [dailyRosters, setDailyRosters] = useState<DraftRosterMap>({});
  const [dailyDate, setDailyDate] = useState<string>("");
  // Seeded synchronously (pacificDate is deterministic via Intl) so the 7-day strip
  // renders on first paint instead of popping in after an effect; the visibility
  // effect still re-keys it on midnight rollover.
  const [today, setToday] = useState<string>(() => pacificDate());
  const [dailyResult, setDailyResult] = useState<
    { wins: number; losses: number; margin?: number; perfect: boolean } | null
  >(null);
  // Server-authoritative completions for the replayable window, keyed by date.
  // Drives the menu's "already played" state (today's card + the archive list) so
  // a finished day shows its record instead of "Play" — cross-device, no client
  // cache. daily_results owns this now; we just mirror it for display.
  const [dailyDone, setDailyDone] = useState<DailyDoneMap>(
    () => readDailyDoneSeed() ?? {},
  );
  const [showHowTo, setShowHowTo] = useState(false);
  const [decades, setDecades] = useState<number[]>([]);
  const [lineup, setLineup] = useState<(LineupEntry | null)[]>(
    KINDS.map(() => null),
  );
  const [currentDecade, setCurrentDecade] = useState<number | null>(null);
  const [currentTeam, setCurrentTeam] = useState<string | null>(null);
  const [currentPlayers, setCurrentPlayers] = useState<PublicPlayer[] | null>(null);
  const [teamSkips, setTeamSkips] = useState(1);
  const [decadeSkips, setDecadeSkips] = useState(1);
  const [rolling, setRolling] = useState(false);
  const [result, setResult] = useState<SimResult | null>(null);
  const [resultRoster, setResultRoster] = useState<SimRosterLine[]>([]);
  // Signed roll receipt for the CURRENT (team, decade) — captured from /api/slot
  // and the decade-skip, attached to each drafted player so the tournament can
  // verify provenance. "" for Daily's seeded slots (which never enter a tournament).
  const [currentReceipt, setCurrentReceipt] = useState<string>("");
  const [simulating, setSimulating] = useState(false);
  const [booting, setBooting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rollSeq = useRef(0); // guards against out-of-order /api/slot responses
  const rollActive = useRef(false); // synchronous in-flight flag for the auto-start effect
  const lineupRef = useRef(lineup); // latest lineup for rollRound (avoids stale closure)
  lineupRef.current = lineup;
  // Daily play requires a (name, PIN) login; the pending date waits for sign-in.
  const [showDailySignIn, setShowDailySignIn] = useState(false);
  const pendingDaily = useRef<{ date?: string } | null>(null);
  // The replay gate fails CLOSED: while we verify completion we show "checking",
  // and on any lookup failure we surface a retry instead of drafting.
  const [dailyChecking, setDailyChecking] = useState(false);
  const [dailyGateError, setDailyGateError] = useState<string | null>(null);
  // The 7-day strip's "View all" reveals the full back-catalogue (DailyArchive).
  const [archiveOpen, setArchiveOpen] = useState(false);
  // Today's standing among everyone who played it (null until played / loaded).
  // Intentionally NOT seeded from cache: the rank moves as others finish, so it
  // always comes fresh from the next /api/daily/results fetch rather than a
  // possibly-stale snapshot (see lib/dailyResultsCache).
  const [dailyRank, setDailyRank] = useState<DailyRank | null>(null);
  // Whether today's completion has resolved (results fetched, or no account to
  // fetch for). Until then we hold a stable placeholder so the daily block can't
  // flash "Play" and then flip to your result once the fetch lands. Seeds true when
  // a prior in-session fetch left a cached record (stale-while-revalidate), so a
  // remount paints it immediately while the background refetch confirms it (and
  // fills in the live rank).
  const [dailyLoaded, setDailyLoaded] = useState(
    () => readDailyDoneSeed() != null,
  );
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const attemptedDaily = useRef<string | undefined>(undefined);
  // Server-signed token for the current daily result's share link (unforgeable).
  const [dailyShareToken, setDailyShareToken] = useState<string | null>(null);

  const draftedCount = lineup.filter(Boolean).length;
  const draftDone = draftedCount === KINDS.length;

  const resetDraftState = useCallback((nextMode: GameMode, nextType: GameType) => {
    setMode(nextMode);
    setGameType(nextType);
    setResult(null);
    setResultRoster([]);
    setDailyShareToken(null);
    setCurrentReceipt("");
    setLineup(KINDS.map(() => null));
    setCurrentDecade(null);
    setCurrentTeam(null);
    setCurrentPlayers(null);
    setTeamSkips(1);
    setDecadeSkips(1);
    setDailySlots([]);
    setDailyBench(null);
    setDailyRosters({});
    setError(null);
  }, []);

  const rollRound = useCallback(
    async (opts: { decade?: number; excludeTeam?: string } = {}) => {
      if (decades.length === 0) return;
      // Already-drafted teams never repeat; used decades are down-weighted.
      const committed = lineupRef.current.filter(Boolean) as LineupEntry[];
      const usedTeams = committed.map((e) => e.team);
      const usage: Record<number, number> = {};
      for (const e of committed) usage[e.decade] = (usage[e.decade] ?? 0) + 1;
      const excludes = [
        ...new Set([...usedTeams, ...(opts.excludeTeam ? [opts.excludeTeam] : [])]),
      ];

      const myId = ++rollSeq.current;
      rollActive.current = true;
      setRolling(true);
      const decade = opts.decade ?? pickWeightedDecade(decades, usage);
      setCurrentDecade(decade);
      setCurrentTeam(null);
      setCurrentPlayers(null);
      try {
        const url = `/api/slot?decade=${decade}${excludes.length ? `&exclude=${excludes.join(",")}` : ""}&includePlayers=1&mode=${mode}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("roll failed");
        const data = await res.json();
        if (rollSeq.current !== myId) return; // a newer roll superseded this one
        setCurrentTeam(data.team);
        setCurrentReceipt(data.receipt ?? "");
        setCurrentPlayers(Array.isArray(data.players) ? data.players : null);
      } catch {
        if (rollSeq.current === myId) setError("Couldn't roll a team. Try again.");
      } finally {
        if (rollSeq.current === myId) {
          rollActive.current = false;
          setRolling(false);
        }
      }
    },
    [decades, mode],
  );

  const startGame = useCallback(async (m: GameMode, type: GameType, dateOverride?: string) => {
    // NOTE: the daily one-per-day gate lives in playDaily() and is SERVER-
    // authoritative (it checks /api/daily/result and fails closed). startGame must
    // not re-gate on the local cache, or a stale localStorage entry could silently
    // block valid play after the server already confirmed no result.
    resetDraftState(type === "daily" ? "hoopiq" : m, type); // daily hides stats like Ranked
    setPhase("play");
    setBooting(true);
    try {
      if (type === "daily") {
        // Always send an explicit Pacific date so the request is CDN-cache-keyed
        // by day (and can't serve a stale board across midnight). The server only
        // caches /api/daily when given a valid explicit date.
        const requestDate = dateOverride ?? pacificDate();
        const res = await fetch(
          `/api/daily?date=${requestDate}&includePlayers=1&mode=hoopiq`,
        );
        if (!res.ok) throw new Error("load failed");
        const { date, slots, benchSlot, rosters } = (await res.json()) as {
          date: string;
          slots: { team: string; decade: number }[];
          benchSlot: { team: string; decade: number } | null;
          rosters?: DraftRosterMap;
        };
        setDailyDate(date);
        setDailySlots(slots);
        setDailyBench(benchSlot);
        setDailyRosters(rosters ?? {});
      } else {
        const res = await fetch("/api/decades");
        if (!res.ok) throw new Error("load failed");
        const { decades: ds } = (await res.json()) as { decades: number[] };
        setDecades(ds);
      }
    } catch {
      setError("Couldn't load the league. Try again.");
    } finally {
      setBooting(false);
    }
  }, [resetDraftState]);

  const beginDailyDraft = useCallback(
    (daily: {
      date: string;
      slots: { team: string; decade: number }[];
      benchSlot: { team: string; decade: number } | null;
      rosters?: DraftRosterMap;
    }) => {
      resetDraftState("hoopiq", "daily");
      setDailySlots(daily.slots);
      setDailyBench(daily.benchSlot);
      setDailyRosters(daily.rosters ?? {});
      setDailyDate(daily.date);
      setError(null);
      setPhase("play");
      setBooting(false);
    },
    [resetDraftState],
  );

  // Retry persisting a completion whose save never confirmed (the lock kept its
  // picks). "saved" = the server now has it; "rejected" = picks invalid, so no
  // record can ever exist and the lock is dropped; "pending" = still couldn't
  // reach the server; "none" = nothing was pending.
  const flushPendingDaily = useCallback(
    async (date: string): Promise<"saved" | "rejected" | "pending" | "none"> => {
      const u = getSavedUser();
      if (!u) return "pending"; // can't retry without credentials
      // Only ever flush a lock that THIS account created (see lib/dailyPending) —
      // never replay one player's picks under another's credentials.
      const pending = getOwnedPendingDaily(date, u);
      if (!pending) return "none";
      const saved = await saveDailyCompletion({
        name: u.username,
        pin: u.pin,
        date,
        picks: pending.picks,
      });
      if (saved.ok) {
        clearPendingDaily(date, u);
        if (saved.share) setDailyShareToken(saved.share);
        return "saved";
      }
      if (saved.rejected) {
        clearPendingDaily(date, u);
        return "rejected";
      }
      return "pending";
    },
    [],
  );

  // Entry point for the Daily (today or an archived date): require login, then
  // check the player's ACCOUNT for an existing completion (cross-device / cleared
  // localStorage) before drafting — a finished day routes to its result/compare so
  // it can't be replayed for a fresher share link. daily_results is the source of
  // truth; a same-device pending lock (lib/dailyPending) covers the window where a
  // completion save hasn't yet confirmed, so a failed save can't reopen the day.
  const playDaily = useCallback(
    async (dateOverride?: string) => {
      const u = getSavedUser();
      if (!u) {
        pendingDaily.current = { date: dateOverride };
        setShowDailySignIn(true);
        return;
      }
      const date = dateOverride ?? pacificDate();
      attemptedDaily.current = dateOverride;
      setDailyGateError(null);
      setDailyChecking(true);
      try {
        const res = await fetch("/api/daily/start", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: u.username, pin: u.pin, date }),
        });
        if (!res.ok) throw new Error(`start ${res.status}`);
        const data = (await res.json()) as
          | {
              status: "played";
              date: string;
              result: unknown;
            }
          | {
              status: "open";
              date: string;
              slots: { team: string; decade: number }[];
              benchSlot: { team: string; decade: number } | null;
              rosters?: DraftRosterMap;
            };
        if (data.status === "played") {
          // Already completed this date → show the result/compare, don't re-draft.
          // The server owns the gate now, so drop any stale same-device lock.
          clearPendingDaily(date, u);
          setDailyChecking(false);
          // Open THAT day's tournament in-app (your bracket, your result) — the
          // /d/ share page is only for links shared between players.
          window.location.assign(`/tournament?daily=${date}`);
          return;
        }
        // No server record. If THIS account has an unconfirmed completion for the
        // day, try to FLUSH it first (the lock kept the picks) — that persists the
        // result AND stops the day being re-drafted for a better score. Only if the
        // save still can't reach the server do we hold a locked state; the Retry
        // button re-runs this and re-attempts the save. (A lock owned by a different
        // account on this browser is ignored here, so it can still draft its own.)
        if (getOwnedPendingDaily(date, u)) {
          const outcome = await flushPendingDaily(date);
          setDailyChecking(false);
          if (outcome === "saved") {
            window.location.assign(`/tournament?daily=${date}`);
            return;
          }
          if (outcome === "pending") {
            setDailyGateError(
              "Your result for this day hasn't saved yet — check your connection and try again.",
            );
            return;
          }
          // "rejected"/"none": lock cleared, no valid record can exist → fall through.
        } else {
          setDailyChecking(false);
        }
        // Server CONFIRMED no stored result (and nothing pending) → safe to draft.
        if (data.status !== "open") throw new Error("bad start payload");
        beginDailyDraft(data);
      } catch {
        // Fail closed: never draft on a lookup failure (that's the replay hole).
        setDailyChecking(false);
        setDailyGateError(
          "Couldn't verify your daily status — check your connection and try again.",
        );
      }
    },
    [beginDailyDraft, flushPendingDaily],
  );

  // Pull the signed-in account's completions for the replayable window and mirror
  // them into `dailyDone` (the menu's "already played" state). Server is the
  // source of truth — this is the only thing the menu trusts for completion, so a
  // finished day can't show "Play" just because a local cache was cleared.
  const refreshDailyResults = useCallback(async () => {
    const u = getSavedUser();
    // No account → nothing to fetch; today's state is resolved (unplayed) at once.
    if (!u) {
      setDailyLoaded(true);
      return;
    }
    try {
      const res = await fetch("/api/daily/results", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: u.username, pin: u.pin }),
      });
      if (!res.ok) return;
      const { results, todayRank } = (await res.json()) as {
        results: {
          date: string; wins: number; losses: number; margin: number;
          perfect: boolean; champion: boolean; top10: boolean;
        }[];
        todayRank: { rank: number; total: number } | null;
      };
      const map: DailyDoneMap = {};
      for (const r of results) {
        map[r.date] = {
          wins: r.wins, losses: r.losses, margin: r.margin,
          perfect: r.perfect, champion: r.champion, top10: r.top10,
        };
      }
      setDailyDone(map);
      setDailyRank(todayRank ?? null);
    } catch {
      /* leave prior state; the per-date playDaily check still fails closed */
    } finally {
      setDailyLoaded(true);
    }
  }, []);

  // Mirror the completion RECORD into the module cache so a later remount (Home →
  // /tournament → Home) can paint it immediately instead of the skeleton. Only the
  // record is cached — the rank stays server-fresh. Keyed by the current account;
  // skipped until loaded and when signed out, so we never cache the empty pre-fetch
  // state. Covers every setter of dailyDone, not just refreshDailyResults.
  useEffect(() => {
    if (!dailyLoaded) return;
    const u = getSavedUser();
    if (!u) return;
    setCachedDailyDone(u.username, u.pin, dailyDone);
  }, [dailyDone, dailyLoaded]);

  // Deep link: /?d=YYYY-MM-DD (from a shared daily link) starts that day's
  // challenge once, gating on login like any other daily.
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    if (deepLinkHandled.current || typeof window === "undefined") return;
    const d = new URLSearchParams(window.location.search).get("d");
    if (d && isPlayableDailyDate(d)) {
      deepLinkHandled.current = true;
      playDaily(d);
    }
  }, [playDaily]);

  // Self-heal: on load, retry any of the signed-in account's completions whose
  // save never reached the server (e.g. the tab closed mid-save) so a pending lock
  // can never strand a result. Other accounts' locks are left for their owners.
  useEffect(() => {
    const u = getSavedUser();
    if (!u) {
      setDailyLoaded(true); // signed out → today's state is resolved immediately
      return;
    }
    (async () => {
      // Flush any stranded saves FIRST so the subsequent results pull reflects them.
      await Promise.all(
        listOwnedPendingDailies(u).map((p) => flushPendingDaily(p.date)),
      );
      await refreshDailyResults();
    })();
  }, [flushPendingDaily, refreshDailyResults]);

  // Cross-device freshness: the menu fetches completions only once at mount, so a
  // result recorded on ANOTHER device (e.g. you played today on mobile) never
  // reaches an already-open desktop tab — the archive/today card keep showing
  // "Play" until you click in and the server reveals it. Re-pull whenever the tab
  // becomes visible again, which covers tab switches and iOS bfcache restores.
  // Also re-derive the Pacific date on the same beat: a tab left open across
  // midnight would otherwise keep `today` (and the date-less in-memory result)
  // pointing at yesterday, so the CTA/archive could show yesterday's completion
  // while playDaily() starts today's board. On rollover we drop the stale result
  // and re-key today; the refreshed `dailyDone` then drives the new day's state.
  const todayRef = useRef("");
  useEffect(() => {
    todayRef.current = today;
  }, [today]);
  useEffect(() => {
    const sync = () => {
      if (document.visibilityState !== "visible") return;
      const d = pacificDate();
      if (todayRef.current && todayRef.current !== d) {
        setToday(d);
        setDailyResult(null); // yesterday's in-memory result no longer applies
      }
      if (!getSavedUser()) return;
      void refreshDailyResults();
    };
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("pageshow", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("pageshow", sync);
    };
  }, [refreshDailyResults]);

  const backToMenu = () => {
    setPhase("menu");
    setResult(null);
    setResultRoster([]);
    setCurrentReceipt("");
    setDailySlots([]);
    setDailyBench(null);
    setDailyRosters({});
    setLineup(KINDS.map(() => null));
    setCurrentDecade(null);
    setCurrentTeam(null);
    setCurrentPlayers(null);
  };

  // Advance the round. Daily mode uses fixed, seeded slots; free play rolls.
  useEffect(() => {
    if (phase !== "play" || result || draftDone) return;
    if (gameType === "daily") {
      const slot = dailySlots[draftedCount];
      if (slot && (currentTeam !== slot.team || currentDecade !== slot.decade)) {
        setCurrentDecade(slot.decade);
        setCurrentTeam(slot.team);
        setCurrentReceipt(""); // Daily slots aren't server-rolled; no receipt.
      }
      return;
    }
    if (booting || currentDecade !== null || rollActive.current) return;
    if (decades.length === 0) return;
    rollRound({});
  }, [
    phase, booting, result, draftDone, gameType, dailySlots, draftedCount,
    currentTeam, currentDecade, decades, rollRound,
  ]);

  // First-visit how-to. The daily one-per-day gate is now server-authoritative
  // (playDaily → /api/daily/result), so we no longer read or trust any local
  // daily cache here.
  useEffect(() => {
    const d = pacificDate();
    setToday(d);
    try {
      // One-time invalidation of the legacy `md820-daily-*` cache. Pre-PR#23 these
      // keys tracked completion client-side; daily_results on the account is now
      // the source of truth. Left in place they'd hide the Play button for days a
      // user only ever played locally, blocking a server-side replay.
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key?.startsWith("md820-daily-")) localStorage.removeItem(key);
      }
      // Restore a same-device pending lock for TODAY (a completion whose server
      // save never confirmed) so a refresh can't reopen the day — but only the
      // signed-in account's own lock. Distinct key prefix from the purge above —
      // see lib/dailyPending.
      const u = getSavedUser();
      const pendingToday = u ? getOwnedPendingDaily(d, u) : null;
      if (pendingToday) setDailyResult(pendingToday);
      if (!localStorage.getItem("md820-seen-howto")) {
        setShowHowTo(true);
        localStorage.setItem("md820-seen-howto", "1");
      }
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  const teamSkip = () => {
    if (teamSkips <= 0 || currentDecade === null || rolling) return;
    setTeamSkips((n) => n - 1);
    rollRound({ decade: currentDecade, excludeTeam: currentTeam ?? undefined });
  };

  // Decade skip keeps the team and only moves to an era where that team has
  // players, so it never spends the skip just to force a free team respin.
  const decadeSkip = async () => {
    if (
      decadeSkips <= 0 ||
      currentDecade === null ||
      currentTeam === null ||
      rolling
    )
      return;
    const team = currentTeam;
    const cur = currentDecade;
    // Run through the same guard as a roll: mark in-flight and hide the player
    // list so a pick can't land mid-request and strand the UI.
    const myId = ++rollSeq.current;
    rollActive.current = true;
    setRolling(true);
    // Keep the team set the whole time — only the decade reel should spin. The
    // player list is hidden during the in-flight roll via `rolling`, not by
    // nulling the team (which would make the team reel spin too).
    try {
      // Present the current (team, decade) receipt so the server can EXCHANGE it
      // for fresh per-era receipts (receipts are bound to team+decade now).
      const res = await fetch(
        `/api/team-decades?team=${team}&decade=${cur}&receipt=${encodeURIComponent(currentReceipt)}`,
      );
      if (!res.ok) throw new Error("skip failed");
      const { decades: teamDecades, receipts } = (await res.json()) as {
        decades: number[];
        receipts?: Record<number, string>;
      };
      if (rollSeq.current !== myId) return; // superseded
      const others = (teamDecades ?? []).filter((d) => d !== cur);
      if (others.length === 0) {
        setError(`${team} only has players in the ${cur}s.`);
        return;
      }
      setDecadeSkips((n) => n - 1);
      const usage: Record<number, number> = {};
      for (const e of lineupRef.current) {
        if (e) usage[e.decade] = (usage[e.decade] ?? 0) + 1;
      }
      // Same team, new era — adopt the freshly-minted receipt for that era.
      const newDecade = pickWeightedDecade(others, usage);
      setCurrentDecade(newDecade);
      setCurrentReceipt(receipts?.[newDecade] ?? "");
      setCurrentPlayers(null);
    } catch {
      if (rollSeq.current === myId) {
        setError("Couldn't skip the decade. Try again.");
      }
    } finally {
      if (rollSeq.current === myId) {
        rollActive.current = false;
        setRolling(false);
      }
    }
  };

  const simulate = async () => {
    setSimulating(true);
    try {
      const picks: SimPick[] = lineup
        .map((e, i) =>
          e
            ? {
                entity_id: e.player.entity_id,
                team: e.team,
                decade: e.decade,
                slot: i,
              }
            : null,
        )
        .filter((p): p is SimPick => p !== null);
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roster: picks }),
      });
      if (!res.ok) throw new Error("simulate failed");
      const data = await res.json();
      const r = data.result as SimResult;
      setResult(r);
      setResultRoster((data.roster as SimRosterLine[]) ?? []);
      if (gameType === "daily") {
        const rec = { wins: r.wins, losses: r.losses, perfect: r.perfect };
        // The DATE that was played (today, or an archived day on replay). The
        // completion is recorded against the account below — daily_results is the
        // source of truth — so we no longer cache it in localStorage.
        const playedDate = dailyDate || today;
        // Only the home banner tracks TODAY's result (this session only).
        if (playedDate === today) setDailyResult(rec);
        // Record the completion against the player's account (cross-device lock +
        // the head-to-head share compare). The server RECOMPUTES the result from
        // these picks (it never trusts client stats), so we just send the picks +
        // date. Daily play is login-gated, so a saved user exists.
        const u = getSavedUser();
        if (u) {
          // Drop a same-device lock BEFORE the network call so a failed/slow save
          // can't be replayed for a better score on a refresh. It carries the PICKS
          // (so the save can be RETRIED later, not just detected) and its OWNER (so
          // it only ever flushes for this account). flushPendingDaily does the
          // actual POST (with retries) and clears the lock once the server confirms
          // the record (then daily_results owns the gate) or rejects the picks; on a
          // hard failure the lock stays so the day is fail-closed and retried later.
          setPendingDaily({
            date: playedDate,
            ...rec,
            picks,
            owner: { name: u.username, pin: u.pin },
          });
          await flushPendingDaily(playedDate);
          // Mirror the just-saved completion into the menu's server-backed map so
          // the archive/today card reflect it without a reload.
          void refreshDailyResults();
        }
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("Couldn't simulate that season. Try again.");
    } finally {
      setSimulating(false);
    }
  };

  // Whether the data needed to play has loaded (a failed initial fetch leaves
  // this false → we show a failed-start state instead of an empty board).
  const loaded = gameType === "daily" ? dailySlots.length > 0 : decades.length > 0;

  const modeLabel =
    gameType === "daily"
      ? `Daily ${dailyDate}`
      : mode === "hoopiq"
        ? "Ranked"
        : "Classic";
  // Classic/Ranked: encode the finished season into a static-preview link.
  const shareCodeStr =
    result && gameType !== "daily"
      ? encodeShare({
          w: result.wins,
          l: result.losses,
          n: result.netRating,
          p: result.perfect,
          m: modeLabel,
          r: resultRoster.map((r) => ({
            t: r.team,
            s: r.best_season,
            name: r.player_name,
            pts: r.pts,
            reb: r.reb,
            ast: r.ast,
          })),
        })
      : "";
  // Daily links deep-link to that day's challenge (auth-gated, head-to-head
  // compare) and carry a SERVER-SIGNED token so the sharer's record can't be
  // forged; other modes use the static result preview.
  const shareUrl = !result
    ? SITE_URL
    : gameType === "daily"
      ? `${SITE_URL}/d/${dailyDate}${dailyShareToken ? `?s=${encodeURIComponent(dailyShareToken)}` : ""}`
      : `${SITE_URL}/s?r=${encodeURIComponent(shareCodeStr)}`;
  const shareText = result
    ? [
        `82-0+ 🏀 ${result.wins}-${result.losses} (${result.netRating >= 0 ? "+" : ""}${result.netRating} net) · ${modeLabel}`,
        // Daily: don't list the picks in the copyable text either (no spoilers).
        ...(gameType === "daily"
          ? []
          : resultRoster.map(
              (r) => `${r.team} '${String(r.best_season).slice(2)} ${r.player_name}`,
            )),
        shareUrl,
      ].join("\n")
    : "";

  // Today's daily completion for the menu card: the just-played/pending result if
  // there is one, otherwise whatever the server says this account already did.
  const todayResult = dailyResult ?? (today ? dailyDone[today] : undefined) ?? null;

  // Build (or reuse) today's signed share link and copy it / open the share sheet.
  // The token (server-signed, unforgeable) is reused if we just completed today;
  // otherwise we mint one for the stored result via /api/daily/share.
  const shareDaily = async () => {
    const u = getSavedUser();
    if (!u || !today) return;
    // Always mint a fresh token for TODAY. The cached `dailyShareToken` is keyed to
    // whatever date last completed/flushed (a self-heal flush can set it to an
    // ARCHIVED date), and /d/today?s=<other-date-token> is rejected by the landing
    // page — dropping the signed head-to-head result from the shared link.
    let token: string | null = null;
    try {
      const res = await fetch("/api/daily/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: u.username, pin: u.pin, date: today }),
      });
      if (res.ok) {
        const j = await res.json();
        if (typeof j?.share === "string") token = j.share;
      }
    } catch {
      /* fall back to the bare day link below */
    }
    const url = `${SITE_URL}/d/${today}${token ? `?s=${encodeURIComponent(token)}` : ""}`;
    const rec = todayResult ? `${todayResult.wins}-${todayResult.losses}` : "";
    const text = `82-0+ 🏀 Daily${rec ? ` ${rec}` : ""}${
      todayResult?.perfect ? " (perfect!)" : ""
    } — same five rolls, beat my record:`;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ text, url });
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      }
    } catch {
      /* user dismissed the share sheet, or clipboard denied — no-op */
    }
  };

  // The stateful daily content (skeleton → play → result) + the 7-day strip and
  // archive. Shared verbatim by the mobile (open, single-column) and the
  // tablet/desktop (bento tile) menu layouts so there's one source of truth.
  // Other pages' masthead "How to Play" links route here with ?howto=1.
  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).get("howto")) {
        setShowHowTo(true);
      }
    } catch {
      /* search params unavailable — ignore */
    }
  }, []);

  // The folio's right side is a real dateline — today's challenge date — not a
  // decorative issue number. Parsed from the YYYY-MM-DD string to dodge TZ drift.
  const dateline = (() => {
    if (!today) return null;
    const [y, m, d] = today.split("-").map(Number);
    if (!y || !m || !d) return null;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[m - 1]} ${d}, ${y}`;
  })();

  // The DARK "money card" interior (cream-on-ink). The 7-day history lives
  // OUTSIDE the card, in its own full-width band below the bento (`dailyHistory`).
  const dailyBody = (
    <>
      {!dailyLoaded ? (
        // Stable placeholder until today's completion resolves, so the block can't
        // flash "Play" and then flip to your result once the fetch lands.
        <div className="mt-4" aria-hidden>
          <div className="h-4 w-44 bg-[var(--md-ink-2)]" />
          <div className="mt-3 h-[56px] w-full border-2 border-[var(--md-ink-2)] bg-[var(--md-ink-2)]" />
        </div>
      ) : todayResult ? (
        <>
          <div className="mt-4 font-cond text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--md-paper-3)]">
            Today&rsquo;s result
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-[34px] font-bold tabular-nums leading-none text-[var(--md-paper)]">
              {todayResult.wins}&ndash;{todayResult.losses}
            </span>
            {dailyRank ? (
              <button
                type="button"
                onClick={() => setLeaderboardOpen(true)}
                className="group inline-flex items-center gap-1 text-[15px] text-[var(--md-paper)]"
              >
                <span className="border-b-2 border-[var(--md-paper)] pb-px group-hover:border-[var(--md-yellow)] group-hover:text-[var(--md-yellow)]">
                  Rank <strong>#{dailyRank.rank}</strong>{" "}
                  <span className="text-[var(--md-paper-3)] group-hover:text-[var(--md-yellow)]">
                    of {dailyRank.total}
                  </span>
                </span>
                <span className="font-bold" aria-hidden>
                  →
                </span>
              </button>
            ) : typeof todayResult.margin === "number" ? (
              <span className="text-[15px] text-[var(--md-paper-3)]">
                Net rating {todayResult.margin >= 0 ? "+" : ""}
                {Math.round(todayResult.margin)}
              </span>
            ) : null}
            {todayResult.perfect && (
              <span className="text-[15px] text-[var(--md-yellow)]">
                <strong>Perfect&nbsp;🏆</strong>
              </span>
            )}
          </div>
          <div className="mt-1 font-mono text-[12px] text-[var(--md-paper-3)]">
            Next challenge in <Countdown />
          </div>
          <div className="mt-4 flex items-center gap-5">
            <button
              className="md-btn md-btn--sm"
              onClick={() => void shareDaily()}
            >
              🔗 {shareCopied ? "Copied!" : "Share result"}
            </button>
            <button
              type="button"
              onClick={() => playDaily()}
              className="font-cond text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--md-paper-3)] underline-offset-2 hover:text-[var(--md-paper)] hover:underline"
            >
              Review your team
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="mt-4 font-cond text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--md-paper-3)]">
            Today&rsquo;s roll · everyone gets the same five
          </div>
          <p className="mt-2 text-[16px] leading-[1.5] text-[var(--md-paper-3)]">
            The same five team/era rolls for everyone today. Build your roster,
            then compare records.
          </p>
          <button
            className="mt-5 flex w-full items-center justify-between gap-3 border-[2.5px] border-[var(--md-paper)] bg-[var(--md-coral)] p-4 text-left text-[var(--md-white)] transition-transform hover:-translate-y-0.5 disabled:opacity-70"
            style={{ boxShadow: "6px 6px 0 0 var(--md-ink-2)" }}
            disabled={dailyChecking}
            onClick={() => playDaily()}
          >
            <span className="font-cond text-[19px] font-bold uppercase tracking-[0.07em]">
              Play today&rsquo;s challenge
            </span>
            <span className="font-display text-xl font-bold" aria-hidden>
              →
            </span>
          </button>
          <div className="mt-3 flex items-center gap-2">
            <span aria-hidden>🔒</span>
            <span className="font-byline text-[12px] text-[var(--md-paper-3)]">
              Name + PIN — your account, across devices.
            </span>
          </div>
        </>
      )}

      {/* Daily replay gate: verifying / fail-closed retry. */}
      {dailyChecking && (
        <p className="mt-3 font-mono text-[12px] text-[var(--md-paper-3)]">
          Checking your daily status…
        </p>
      )}
      {dailyGateError && (
        <div className="mt-3 flex w-full flex-col items-center gap-2 border-2 border-[var(--md-coral)] bg-[var(--md-ink-2)] p-3">
          <p className="font-display text-[13px] text-[var(--md-coral)]">
            {dailyGateError}
          </p>
          <button
            className="md-btn md-btn--sm md-btn--secondary"
            onClick={() => playDaily(attemptedDaily.current)}
          >
            ↻ Retry
          </button>
        </div>
      )}
    </>
  );

  // The "LAST 7 DAYS" strip + archive grid — a full-width band below the bento.
  const dailyHistory = today ? (
    <>
      <DailyTimeline
        today={today}
        results={dailyDone}
        onPlay={(date) => playDaily(date)}
        archiveOpen={archiveOpen}
        onToggleArchive={() => setArchiveOpen((v) => !v)}
      />
      <DailyArchive
        today={today}
        results={dailyDone}
        onPlay={(date) => playDaily(date)}
        open={archiveOpen}
      />
    </>
  ) : null;

  return (
    <main
      className={`relative mx-auto flex min-h-full flex-col px-4 pb-12 sm:pb-16 ${
        // The play phase (both the 2-column draft and the result screen) needs
        // room; the menu bento gets the full 6xl.
        phase === "menu" ? "max-w-3xl md:max-w-6xl" : "max-w-5xl"
      }`}
    >
      {showHowTo && <HowToPlay onClose={() => setShowHowTo(false)} />}

      {leaderboardOpen &&
        today &&
        (() => {
          const u = getSavedUser();
          return u ? (
            <DailyLeaderboard
              date={today}
              user={u}
              onClose={() => setLeaderboardOpen(false)}
            />
          ) : null;
        })()}
      {showDailySignIn && (
        <DailySignIn
          onCancel={() => setShowDailySignIn(false)}
          onSignedIn={async () => {
            setShowDailySignIn(false);
            const d = pendingDaily.current?.date;
            pendingDaily.current = null;
            // Single-flight the create-or-match: for first-time credentials both
            // calls would otherwise race authenticate() (no DB uniqueness on the
            // name/PIN pair) and insert duplicate accounts. Await the first so the
            // account exists before the second auth runs and simply matches it.
            await refreshDailyResults(); // populate the menu's completion map
            // Only auto-advance into a draft when sign-in was gated by a pending
            // daily (the play flow). A generic masthead "Sign In" has no pending
            // date and should just land the user on the refreshed menu.
            if (d) void playDaily(d);
          }}
        />
      )}
      <div className="md-sunbeam" />

      <GlobalHeader
        onSignIn={() => setShowDailySignIn(true)}
        onHowToPlay={() => setShowHowTo(true)}
        right={
          phase === "play" ? (
            <span
              className="md-capsule"
              style={
                mode === "hoopiq"
                  ? { background: "var(--md-ink)", color: "var(--md-white)" }
                  : undefined
              }
            >
              {mode === "hoopiq" ? "Ranked" : "Classic"}
            </span>
          ) : undefined
        }
      />

      {/* ---------------- MENU ---------------- */}
      {phase === "menu" && (
        <>
          {/* The bento as a 2-col grid with explicit placement so the LAST 7 DAYS
              band can be full-width BELOW on desktop yet sit RIGHT AFTER the daily
              card (before the modes) when it all stacks on mobile. DOM order is
              left → history → right; desktop pins them with col/row-start. */}
          <section className="relative z-10 grid gap-6 md:grid-cols-[1.6fr_1fr]">
              {/* Left: editorial hero + the big Daily tile. */}
              <div className="flex flex-col gap-6 md:col-start-1 md:row-start-1">
                {/* Folio bar on a double rule */}
                <div className="md-rule-double flex items-end justify-between pb-2">
                  <span className="md-folio uppercase">
                    A daily basketball draft puzzle
                  </span>
                  {dateline && (
                    <span className="md-folio uppercase">{dateline}</span>
                  )}
                </div>
                {/* Marker kicker → Anton cover line → double rule */}
                <div>
                  <span className="md-kicker--marker">Today&rsquo;s draft is live.</span>
                  <h1
                    className="font-cover mt-1 flex flex-wrap items-baseline gap-x-4 uppercase"
                    style={{
                      fontSize: "clamp(46px, 5.4vw, 74px)",
                      lineHeight: 0.9,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    <span>Go</span>
                    <span className="text-[var(--md-coral)]">Undefeated.</span>
                  </h1>
                  <div className="mt-4 flex flex-col gap-[3px]">
                    <div className="h-[5px] w-full bg-[var(--md-ink)]" />
                    <div className="h-[2px] w-1/2 max-w-[320px] bg-[var(--md-coral)]" />
                  </div>
                </div>
                {/* Deck */}
                <p className="max-w-[620px] text-[17px] leading-[1.6]">
                  Five rounds. Each spin gives you one team + era — draft a player
                  and slot him at Guard, Wing, Big, or Flex.{" "}
                  <span className="font-bold">
                    Fit five together and{" "}
                    <span className="box-decoration-clone bg-[var(--md-yellow)] px-1 text-[var(--md-ink)]">
                      simulate the season.
                    </span>
                  </span>
                </p>
                <div className="md-card--cover flex flex-1 flex-col p-6">
                  <div
                    className="flex items-center justify-between gap-2 pb-3"
                    style={{
                      borderBottom: "1px solid var(--md-paper)",
                      boxShadow: "0 4px 0 -1px var(--md-paper)",
                    }}
                  >
                    <div className="font-cond text-[18px] font-semibold uppercase tracking-[0.16em] text-[var(--md-paper)]">
                      Daily Challenge
                    </div>
                    <span className="text-xl" aria-hidden>
                      🏆
                    </span>
                  </div>
                  {dailyBody}
                </div>
              </div>
              {/* LAST 7 DAYS — its own grid row: full-width on desktop, but right
                  after the daily card (before the modes) when stacked on mobile. */}
              <div className="md:col-span-2 md:col-start-1 md:row-start-2">
                {dailyHistory}
              </div>
              {/* Right: the "ways to play" rail. */}
              <div className="flex flex-col gap-4 md:col-start-2 md:row-start-1">
                <div className="md-rule-double flex items-end justify-between pb-2">
                  <span className="font-cond text-[14px] font-bold uppercase tracking-[0.18em]">
                    More Ways to Play
                  </span>
                  <span className="md-folio">THREE MODES</span>
                </div>
                {/* Private Tournament — cobalt, a first-class mode. */}
                <Link
                  href="/tournament?tab=private"
                  className="flex flex-[1.1] flex-col justify-between gap-3 border-2 border-[var(--md-ink)] p-6 text-[var(--md-white)] transition-transform hover:-translate-y-0.5"
                  style={{ background: "var(--md-cobalt)", boxShadow: "var(--md-shadow-md)" }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[18px]" aria-hidden>🏆</span>
                    <span className="font-cond text-[17px] font-bold uppercase tracking-[0.1em]">
                      Private Tournament
                    </span>
                  </div>
                  <p className="text-[15px] leading-[1.45] text-[#dde4ff]">
                    Host a bracket for your friends, or join one by link.
                  </p>
                  <div className="flex items-center justify-between border-t border-white/30 pt-3 font-cond text-[12px] font-semibold uppercase tracking-[0.12em] text-[#dde4ff]">
                    <span>Host or Join</span>
                    <span aria-hidden>→</span>
                  </div>
                </Link>
                {/* Classic — clean stock insert. */}
                <button
                  className="flex flex-1 flex-col justify-between gap-3 border-2 border-[var(--md-ink)] bg-[var(--md-white)] p-6 text-left transition-transform hover:-translate-y-0.5"
                  style={{ boxShadow: "var(--md-shadow-md)" }}
                  onClick={() => startGame("classic", "free")}
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center bg-[var(--md-ink)] font-mono text-[11px] font-bold text-[var(--md-yellow)]">
                      01
                    </span>
                    <span className="font-cond text-[17px] font-bold uppercase tracking-[0.1em]">
                      Classic
                    </span>
                  </div>
                  <p className="text-[15px] leading-[1.45] text-[var(--md-ink-muted)]">
                    Per-game stats shown. Draft with full information.
                  </p>
                  <div className="flex items-center justify-between border-t border-[var(--md-ink)]/20 pt-3 font-cond text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--md-ink-muted)]">
                    <span>Play Classic</span>
                    <span aria-hidden>→</span>
                  </div>
                </button>
                {/* Ranked — ink. */}
                <button
                  className="flex flex-1 flex-col justify-between gap-3 border-2 border-[var(--md-ink)] p-6 text-left text-[var(--md-paper)] transition-transform hover:-translate-y-0.5"
                  style={{ background: "var(--md-ink)", boxShadow: "var(--md-shadow-md)" }}
                  onClick={() => startGame("hoopiq", "free")}
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center bg-[var(--md-yellow)] font-mono text-[11px] font-bold text-[var(--md-ink)]">
                      02
                    </span>
                    <span className="font-cond text-[17px] font-bold uppercase tracking-[0.1em] text-[var(--md-paper)]">
                      Ranked
                    </span>
                  </div>
                  <p className="text-[15px] leading-[1.45] text-[var(--md-paper-3)]">
                    Stats hidden. Draft from memory — true hoops IQ.
                  </p>
                  <div className="flex items-center justify-between border-t border-[#2a231c] pt-3 font-cond text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--md-paper-3)]">
                    <span>Play Ranked</span>
                    <span aria-hidden>→</span>
                  </div>
                </button>
              </div>
          </section>

        </>
      )}

      {/* Failed to load the game data — recoverable. */}
      {phase === "play" && !booting && !result && !loaded && (
        <section className="relative z-10 mx-auto mt-6 w-full max-w-lg">
          <div className="md-card md-card--lift p-5 text-center">
            <p className="font-display text-base font-bold">
              Couldn&rsquo;t start the game.
            </p>
            <p className="mt-1 text-[13px] text-[var(--md-ink-muted)]">
              {error ?? "Something went wrong loading the league."}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                className="md-btn md-btn--sm md-btn--teal"
                onClick={() => startGame(mode, gameType)}
              >
                Try again
              </button>
              <button
                className="md-btn md-btn--sm md-btn--secondary"
                onClick={backToMenu}
              >
                Back to menu
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Transient in-game error (e.g. a failed roll/simulate) while playing. */}
      {phase === "play" && loaded && !result && error && (
        <div className="relative z-10 mx-auto mt-6 max-w-lg">
          <div className="md-card border-[var(--md-coral)] p-4">
            <p className="font-display text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* ---------------- RESULT ---------------- */}
      {phase === "play" && result && (
        // The result is a two-column desktop layout (score/CTAs + THE FIVE card),
        // so it uses the full play-phase width (max-w-5xl from <main>). The narrow
        // max-w-lg here was crushing the left column on desktop.
        <section className="relative z-10 mt-4 w-full">
          <ResultsPanel
            roster={resultRoster}
            result={result}
            shareText={shareText}
            shareLink={shareUrl}
            // Daily: don't enable sharing until the signed token has come back
            // from /api/daily/complete, else shareUrl is a bare /d/<date>.
            shareReady={gameType !== "daily" || !!dailyShareToken}
            modeLabel={modeLabel}
            mode={mode}
            isDaily={gameType === "daily"}
            onReset={backToMenu}
            onEnterTournament={
              gameType === "free" || (gameType === "daily" && dailyBench)
                ? () => setPhase("tournament")
                : undefined
            }
          />
        </section>
      )}

      {/* ---------------- TOURNAMENT ENTRY ---------------- */}
      {phase === "tournament" && (
        // Full play-phase width (max-w-5xl from <main>): the post-submit bracket
        // needs room. TournamentEntry keeps its own entry form narrow internally.
        <section className="relative z-10 mt-4 w-full">
          <TournamentEntry
            initialLineup={lineup}
            mode={gameType === "daily" ? "daily" : mode}
            dailyBench={gameType === "daily" ? dailyBench : null}
            dailyDate={gameType === "daily" ? dailyDate : null}
            preloadedRosters={gameType === "daily" ? dailyRosters : undefined}
            onBack={backToMenu}
          />
        </section>
      )}

      {/* ---------------- GAME ---------------- */}
      {phase === "play" && !result && !booting && loaded && (
        <section className="relative z-10 mt-4 flex flex-col gap-5">
          <LineupDraftBoard
            kinds={KINDS}
            lineup={lineup}
            setLineup={setLineup}
            source={
              currentDecade !== null
                ? { team: currentTeam, decade: currentDecade, receipt: currentReceipt }
                : null
            }
            sourcePlayers={
              currentTeam && currentDecade !== null
                ? gameType === "daily"
                  ? dailyRosters[draftSourceKey({ team: currentTeam, decade: currentDecade })] ?? null
                  : currentPlayers
                : null
            }
            sourcePlayersMode={currentTeam && currentDecade !== null ? mode : null}
            rolling={rolling}
            mode={mode}
            allowRespin={gameType === "free"}
            onConsumeSource={() => {
              setCurrentDecade(null);
              setCurrentTeam(null);
              setCurrentPlayers(null);
            }}
            onNoneEligible={() =>
              rollRound({
                decade: currentDecade ?? undefined,
                excludeTeam: currentTeam ?? undefined,
              })
            }
            controls={({ rolling: r }) =>
              gameType === "free" ? (
                <div className="flex flex-col items-end gap-1.5">
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      className="md-btn md-btn--sm md-btn--ink"
                      onClick={teamSkip}
                      disabled={teamSkips <= 0 || r}
                    >
                      ↻ New team ({teamSkips})
                    </button>
                    <button
                      className="md-btn md-btn--sm md-btn--ink"
                      onClick={decadeSkip}
                      disabled={decadeSkips <= 0 || r || decades.length < 2}
                    >
                      ↻ New decade ({decadeSkips})
                    </button>
                  </div>
                  <span className="font-byline text-[11px] text-[var(--md-paper-3)]">
                    Free play · re-roll either
                  </span>
                </div>
              ) : null
            }
          />

          {draftDone && (
            <div className="flex flex-col items-center gap-3">
              <div className="font-display text-sm">
                Five drafted, positions covered. Time to find out.
              </div>
              <button
                className="md-btn md-btn--lg md-btn--teal"
                disabled={simulating}
                onClick={simulate}
              >
                {simulating ? "Simulating…" : "Simulate Season"}
              </button>
            </div>
          )}
        </section>
      )}

      {phase === "play" && booting && !result && (
        <div className="relative z-10 py-20 text-center font-display text-sm text-[var(--md-ink-muted)]">
          Spinning up the league…
        </div>
      )}

      <footer className="relative z-10 mt-auto flex flex-col gap-1.5 border-t border-[var(--md-ink)] pt-5 text-[var(--md-ink-muted)] sm:flex-row sm:items-center sm:justify-between">
        <p className="font-byline text-[12px] tracking-[0.02em]">
          Powered by{" "}
          <a
            href={MOTHERDUCK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-[var(--md-ink)]"
          >
            MotherDuck
          </a>{" "}
          · <span className="font-mono">nba_box_scores_v2</span>
        </p>
        <p className="font-byline text-[12px] tracking-[0.02em]">
          An independent project — not affiliated with or endorsed by the NBA.
        </p>
      </footer>
    </main>
  );
}
