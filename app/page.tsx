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
import { canFill, type SlotKind } from "@/lib/positions";
import { SlotMachine } from "@/components/SlotMachine";
import { PlayerList } from "@/components/PlayerList";
import { LineupBoard, type LineupEntry } from "@/components/LineupBoard";
import { ResultsPanel } from "@/components/ResultsPanel";
import { DailyArchive } from "@/components/DailyArchive";
import { DailySignIn } from "@/components/DailySignIn";
import { getSavedUser } from "@/lib/tournamentSession";
import { TournamentEntry } from "@/components/TournamentEntry";
import { HowToPlay } from "@/components/HowToPlay";
import { Countdown } from "@/components/Countdown";
import { encodeShare } from "@/lib/shareCode";
import { SITE_URL } from "@/lib/site";
import { pacificDate, isPlayableDailyDate } from "@/lib/dailyDate";

const KINDS: SlotKind[] = ["G", "FLEX", "W", "FLEX", "B"];
type Phase = "menu" | "play" | "tournament";
type GameType = "free" | "daily";

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

export default function Home() {
  const [phase, setPhase] = useState<Phase>("menu");
  const [mode, setMode] = useState<GameMode>("classic");
  const [gameType, setGameType] = useState<GameType>("free");
  const [dailySlots, setDailySlots] = useState<{ team: string; decade: number }[]>([]);
  // The daily tournament's fixed 6th-man slot (team+decade); null on sparse days.
  const [dailyBench, setDailyBench] = useState<{ team: string; decade: number } | null>(null);
  const [dailyDate, setDailyDate] = useState<string>("");
  const [today, setToday] = useState<string>("");
  const [dailyResult, setDailyResult] = useState<
    { wins: number; losses: number; perfect: boolean } | null
  >(null);
  const [showHowTo, setShowHowTo] = useState(false);
  const [decades, setDecades] = useState<number[]>([]);
  const [lineup, setLineup] = useState<(LineupEntry | null)[]>(
    KINDS.map(() => null),
  );
  const [currentDecade, setCurrentDecade] = useState<number | null>(null);
  const [currentTeam, setCurrentTeam] = useState<string | null>(null);
  const [pending, setPending] = useState<PublicPlayer | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
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
  const dailyResultRef = useRef(dailyResult); // latest daily lock for startGame guard
  dailyResultRef.current = dailyResult;
  // Daily play requires a (name, PIN) login; the pending date waits for sign-in.
  const [showDailySignIn, setShowDailySignIn] = useState(false);
  const pendingDaily = useRef<{ date?: string } | null>(null);

  const draftedCount = lineup.filter(Boolean).length;
  const draftDone = draftedCount === KINDS.length;
  const draftedIds = lineup
    .filter(Boolean)
    .map((e) => (e as LineupEntry).player.entity_id);

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
      setPending(null);
      setSelected(null);
      const decade = opts.decade ?? pickWeightedDecade(decades, usage);
      setCurrentDecade(decade);
      setCurrentTeam(null);
      try {
        const url = `/api/slot?decade=${decade}${excludes.length ? `&exclude=${excludes.join(",")}` : ""}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("roll failed");
        const data = await res.json();
        if (rollSeq.current !== myId) return; // a newer roll superseded this one
        setCurrentTeam(data.team);
        setCurrentReceipt(data.receipt ?? "");
      } catch {
        if (rollSeq.current === myId) setError("Couldn't roll a team. Try again.");
      } finally {
        if (rollSeq.current === myId) {
          rollActive.current = false;
          setRolling(false);
        }
      }
    },
    [decades],
  );

  const startGame = useCallback(async (m: GameMode, type: GameType, dateOverride?: string) => {
    // Daily is one attempt per date, ever. Today's lock lives in dailyResultRef;
    // an archived date is checked against its own localStorage key.
    if (type === "daily") {
      if (!dateOverride && dailyResultRef.current) return;
      if (dateOverride) {
        try {
          if (localStorage.getItem(`md820-daily-${dateOverride}`)) return;
        } catch {
          /* localStorage unavailable */
        }
      }
    }
    setMode(type === "daily" ? "hoopiq" : m); // daily hides stats like Ranked
    setGameType(type);
    setResult(null);
    setResultRoster([]);
    setCurrentReceipt("");
    setLineup(KINDS.map(() => null));
    setCurrentDecade(null);
    setCurrentTeam(null);
    setPending(null);
    setSelected(null);
    setTeamSkips(1);
    setDecadeSkips(1);
    setDailySlots([]);
    setDailyBench(null);
    setError(null);
    setPhase("play");
    setBooting(true);
    try {
      if (type === "daily") {
        const res = await fetch(
          dateOverride ? `/api/daily?date=${dateOverride}` : "/api/daily",
        );
        if (!res.ok) throw new Error("load failed");
        const { date, slots, benchSlot } = (await res.json()) as {
          date: string;
          slots: { team: string; decade: number }[];
          benchSlot: { team: string; decade: number } | null;
        };
        setDailyDate(date);
        setDailySlots(slots);
        setDailyBench(benchSlot);
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
  }, []);

  // Entry point for the Daily (today or an archived date): require login, then
  // check the player's ACCOUNT for an existing completion (cross-device / cleared
  // localStorage) before drafting — a finished day routes to its result/compare so
  // it can't be replayed for a fresher share link. daily_results stays the source
  // of truth; the localStorage lock is just a fast same-device cache.
  const playDaily = useCallback(
    async (dateOverride?: string) => {
      const u = getSavedUser();
      if (!u) {
        pendingDaily.current = { date: dateOverride };
        setShowDailySignIn(true);
        return;
      }
      const date = dateOverride ?? pacificDate();
      try {
        const res = await fetch("/api/daily/result", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: u.username, pin: u.pin, date }),
        });
        if (res.ok) {
          const { result } = await res.json();
          if (result) {
            // Already completed this date → show the result/compare, don't re-draft.
            window.location.assign(`/d/${date}`);
            return;
          }
        }
      } catch {
        /* network — fall through and let them play (server still de-dupes) */
      }
      startGame("classic", "daily", dateOverride);
    },
    [startGame],
  );

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

  const backToMenu = () => {
    setPhase("menu");
    setResult(null);
    setResultRoster([]);
    setCurrentReceipt("");
    setDailySlots([]);
    setDailyBench(null);
    setLineup(KINDS.map(() => null));
    setCurrentDecade(null);
    setCurrentTeam(null);
  };

  // Advance the round. Daily mode uses fixed, seeded slots; free play rolls.
  useEffect(() => {
    if (phase !== "play" || result || draftDone) return;
    if (gameType === "daily") {
      const slot = dailySlots[draftedCount];
      if (slot && (currentTeam !== slot.team || currentDecade !== slot.decade)) {
        setPending(null);
        setSelected(null);
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

  // First-visit how-to + today's daily lock (one challenge per Pacific day).
  useEffect(() => {
    const d = pacificDate();
    setToday(d);
    try {
      const stored = localStorage.getItem(`md820-daily-${d}`);
      if (stored) setDailyResult(JSON.parse(stored));
      if (!localStorage.getItem("md820-seen-howto")) {
        setShowHowTo(true);
        localStorage.setItem("md820-seen-howto", "1");
      }
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  const draftable = useCallback(
    (p: PublicPlayer) => {
      if (draftedIds.includes(p.entity_id)) return false;
      return KINDS.some((kind, i) => lineup[i] === null && canFill(p.positions, kind));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lineup],
  );

  const placeAt = (player: PublicPlayer, i: number) => {
    if (currentTeam === null || currentDecade === null) return;
    const entry: LineupEntry = { player, team: currentTeam, decade: currentDecade, receipt: currentReceipt };
    setLineup((prev) => prev.map((s, idx) => (idx === i ? entry : s)));
    setPending(null);
    setSelected(null);
    setCurrentDecade(null);
    setCurrentTeam(null);
  };

  const pick = (player: PublicPlayer) => {
    const eligible = KINDS.map((kind, i) => ({ kind, i }))
      .filter(({ i }) => lineup[i] === null)
      .filter(({ kind }) => canFill(player.positions, kind))
      .map(({ i }) => i);
    if (eligible.length === 0) return;
    if (eligible.length === 1) placeAt(player, eligible[0]);
    else setPending(player);
  };

  // Slot clicks place the pending pick, or move/swap already-drafted players
  // between eligible slots. There is no delete — committed picks can be
  // rearranged but not removed (so you can't re-roll past the five spins).
  const onSlotClick = (i: number) => {
    if (pending) {
      if (lineup[i] === null && canFill(pending.positions, KINDS[i]))
        placeAt(pending, i);
      return;
    }
    if (selected === null) {
      if (lineup[i]) setSelected(i);
      return;
    }
    if (i === selected) {
      setSelected(null);
      return;
    }
    const sel = lineup[selected] as LineupEntry;
    const target = lineup[i];
    if (target === null) {
      if (canFill(sel.player.positions, KINDS[i])) {
        setLineup((prev) =>
          prev.map((s, idx) => (idx === i ? sel : idx === selected ? null : s)),
        );
        setSelected(null);
      }
    } else if (
      canFill(sel.player.positions, KINDS[i]) &&
      canFill(target.player.positions, KINDS[selected])
    ) {
      setLineup((prev) =>
        prev.map((s, idx) => (idx === i ? sel : idx === selected ? target : s)),
      );
      setSelected(null);
    }
  };

  let targets: number[] = [];
  if (pending) {
    targets = KINDS.map((kind, i) => ({ kind, i }))
      .filter(({ i }) => lineup[i] === null)
      .filter(({ kind }) => canFill(pending.positions, kind))
      .map(({ i }) => i);
  } else if (selected !== null) {
    const sel = lineup[selected] as LineupEntry;
    targets = KINDS.map((_, i) => i).filter((i) => {
      if (i === selected) return false;
      const t = lineup[i];
      if (t === null) return canFill(sel.player.positions, KINDS[i]);
      return (
        canFill(sel.player.positions, KINDS[i]) &&
        canFill(t.player.positions, KINDS[selected])
      );
    });
  }

  const teamSkip = () => {
    if (teamSkips <= 0 || currentDecade === null || pending || rolling) return;
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
      pending ||
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
    setPending(null);
    setSelected(null);
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
        // Lock the DATE that was played (today, or an archived day on replay).
        const playedDate = dailyDate || today;
        try {
          localStorage.setItem(`md820-daily-${playedDate}`, JSON.stringify(rec));
        } catch {
          /* localStorage unavailable */
        }
        // Only the home banner tracks TODAY's result.
        if (playedDate === today) setDailyResult(rec);
        // Record the completion against the player's account (cross-device lock +
        // the head-to-head share compare). The server RECOMPUTES the result from
        // these picks (it never trusts client stats), so we just send the picks +
        // date. Daily play is login-gated, so a saved user exists; fire-and-forget.
        const u = getSavedUser();
        if (u) {
          void fetch("/api/daily/complete", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name: u.username,
              pin: u.pin,
              date: playedDate,
              picks,
            }),
          }).catch(() => {});
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
  // Encode the finished season into a shareable link that renders a rich
  // preview (dynamic OG image) when pasted into Slack/Twitter/etc.
  const shareCodeStr = result
    ? encodeShare({
        w: result.wins,
        l: result.losses,
        n: result.netRating,
        p: result.perfect,
        m: modeLabel,
        // Daily is a shared puzzle — the link/OG preview must not reveal which
        // players were used, so the roster is dropped for daily shares.
        r:
          gameType === "daily"
            ? []
            : resultRoster.map((r) => ({
                t: r.team,
                s: r.best_season,
                name: r.player_name,
                pts: r.pts,
                reb: r.reb,
                ast: r.ast,
              })),
        // Carry the sharer's name on daily links so the recipient sees a compare.
        u: gameType === "daily" ? getSavedUser()?.username : undefined,
      })
    : "";
  // Daily links deep-link to that day's challenge (auth-gated, head-to-head
  // compare); other modes use the static result preview.
  const shareUrl = result
    ? gameType === "daily"
      ? `${SITE_URL}/d/${dailyDate}?r=${encodeURIComponent(shareCodeStr)}`
      : `${SITE_URL}/s?r=${encodeURIComponent(shareCodeStr)}`
    : SITE_URL;
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

  return (
    <main className="relative mx-auto flex min-h-full max-w-3xl flex-col overflow-x-hidden px-4 pb-12 sm:pb-16">
      {showHowTo && <HowToPlay onClose={() => setShowHowTo(false)} />}
      {showDailySignIn && (
        <DailySignIn
          onCancel={() => setShowDailySignIn(false)}
          onSignedIn={() => {
            setShowDailySignIn(false);
            const d = pendingDaily.current?.date;
            pendingDaily.current = null;
            void playDaily(d); // re-check completion now that we're signed in
          }}
        />
      )}
      <div className="md-sunbeam" />

      <header className="relative z-10 flex items-center justify-between py-4 sm:py-5">
        <div className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden>
            🦆
          </span>
          <span className="font-display text-lg font-bold tracking-tight">
            82-0<span className="text-[var(--md-orange)]">+</span>
          </span>
        </div>
        {phase === "play" && (
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
        )}
      </header>

      {/* ---------------- MENU ---------------- */}
      {phase === "menu" && (
        <section className="relative z-10 flex flex-col items-center text-center">
          <div className="md-capsule mb-4 max-w-full text-center">
            Can you go 82-0?
          </div>
          <h1
            className="font-display font-bold tracking-tight"
            style={{ fontSize: "clamp(40px, 11vw, 80px)", lineHeight: 1 }}
          >
            Go 82&ndash;0.
          </h1>
          <p className="mx-auto mt-4 max-w-md text-[14px] leading-relaxed sm:text-[15px]">
            Five rounds. Each spin gives you one team + era — draft a player and
            slot him at Guard, Wing, Big, or Flex. Fit five together and simulate
            the season.
          </p>

          {dailyResult ? (
            <div
              className="md-card mt-8 w-full max-w-md p-5 text-left"
              style={{ background: "var(--md-paper-2)" }}
            >
              <div className="flex items-center justify-between">
                <div className="font-display text-xl font-bold">
                  Daily Challenge
                </div>
                <span className="text-2xl" aria-hidden>
                  {dailyResult.perfect ? "🏆" : "✓"}
                </span>
              </div>
              <p className="mt-1 text-[13px] text-[var(--md-ink)]">
                Today&rsquo;s result:{" "}
                <strong>
                  {dailyResult.wins}&ndash;{dailyResult.losses}
                </strong>
                {dailyResult.perfect ? " — perfect season!" : ""}. One per day.
              </p>
              <p className="mt-1 font-display text-[12px] text-[var(--md-ink-muted)]">
                Next challenge in <Countdown />
              </p>
            </div>
          ) : (
            <button
              className="md-card md-card--lift mt-8 w-full max-w-md p-5 text-left transition-transform hover:-translate-y-0.5"
              style={{ background: "var(--md-yellow)" }}
              onClick={() => playDaily()}
            >
              <div className="flex items-center justify-between">
                <div className="font-display text-xl font-bold">
                  Daily Challenge
                </div>
                <span className="text-2xl" aria-hidden>
                  🏆
                </span>
              </div>
              <p className="mt-1 text-[13px] text-[var(--md-ink)]">
                The same five team/era rolls for everyone today. Compare records.
              </p>
            </button>
          )}

          {/* Replay any of the last ~30 daily challenges. */}
          {today && (
            <DailyArchive
              today={today}
              onPlay={(date) => playDaily(date)}
            />
          )}

          <div className="mt-6 font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
            or free play
          </div>
          <div className="mt-3 grid w-full max-w-md gap-3 sm:grid-cols-2">
            <button
              className="md-card md-card--lift p-5 text-left transition-transform hover:-translate-y-0.5"
              onClick={() => startGame("classic", "free")}
            >
              <div className="font-display text-xl font-bold">Classic</div>
              <p className="mt-1 text-[13px] text-[var(--md-ink-muted)]">
                Per-game stats shown. Draft with full information.
              </p>
            </button>
            <button
              className="md-card md-card--lift p-5 text-left transition-transform hover:-translate-y-0.5"
              style={{ background: "var(--md-ink)" }}
              onClick={() => startGame("hoopiq", "free")}
            >
              <div className="font-display text-xl font-bold text-[var(--md-white)]">
                Ranked
              </div>
              <p className="mt-1 text-[13px] text-[var(--md-paper-3)]">
                Stats hidden. Draft from memory — true hoops IQ.
              </p>
            </button>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
            <button
              className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-blue)] underline"
              onClick={() => setShowHowTo(true)}
            >
              How to play
            </button>
            <Link
              href="/tournament"
              className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-blue)] underline"
            >
              My teams →
            </Link>
          </div>
        </section>
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
        <section className="relative z-10 mx-auto mt-4 w-full max-w-lg">
          <ResultsPanel
            roster={resultRoster}
            result={result}
            shareText={shareText}
            shareLink={shareUrl}
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
        <section className="relative z-10 mx-auto mt-4 w-full max-w-lg">
          <TournamentEntry
            initialLineup={lineup}
            mode={gameType === "daily" ? "daily" : mode}
            dailyBench={gameType === "daily" ? dailyBench : null}
            dailyDate={gameType === "daily" ? dailyDate : null}
            onBack={backToMenu}
          />
        </section>
      )}

      {/* ---------------- GAME ---------------- */}
      {phase === "play" && !result && !booting && loaded && (
        <section className="relative z-10 mt-4 flex flex-col gap-5">
          <div>
            <div className="mb-2 font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
              Your lineup · {draftedCount}/{KINDS.length}
            </div>
            <LineupBoard
              kinds={KINDS}
              entries={lineup}
              targets={targets}
              selected={selected}
              onSlotClick={onSlotClick}
            />
            <div className="mt-2 text-center font-display text-[11px] text-[var(--md-ink-muted)]">
              {pending
                ? "Tap a glowing slot to place him."
                : selected !== null
                  ? "Tap a glowing slot to move him (or tap him again to cancel)."
                  : draftDone
                    ? "Tap a player, then a slot, to rearrange."
                    : "Tip: tap a drafted player then a slot to move him."}
            </div>
          </div>

          {pending && (
            <div className="md-card md-card--lift flex flex-col items-center gap-3 p-4">
              <div className="font-display text-sm">
                Where does{" "}
                <span className="font-bold">{pending.player_name}</span> play?
              </div>
              <button
                className="md-btn md-btn--sm md-btn--secondary"
                onClick={() => setPending(null)}
              >
                Cancel pick
              </button>
            </div>
          )}

          {!draftDone && !pending && currentDecade !== null && (
            <div className="md-card md-card--lift flex flex-col items-center gap-3 p-3 sm:gap-4 sm:p-5">
              <div className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
                Round {draftedCount + 1} of {KINDS.length}
              </div>
              <SlotMachine team={currentTeam} decade={currentDecade} size="lg" />
              {gameType === "free" && (
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    className="md-btn md-btn--sm md-btn--secondary"
                    onClick={teamSkip}
                    disabled={teamSkips <= 0 || rolling}
                  >
                    ↻ Team skip ({teamSkips})
                  </button>
                  <button
                    className="md-btn md-btn--sm md-btn--secondary"
                    onClick={decadeSkip}
                    disabled={decadeSkips <= 0 || rolling || decades.length < 2}
                  >
                    ↻ Decade skip ({decadeSkips})
                  </button>
                </div>
              )}
              <div className="w-full">
                {currentTeam && !rolling ? (
                  <PlayerList
                    team={currentTeam}
                    decade={currentDecade}
                    mode={mode}
                    allowRespin={gameType === "free"}
                    draftable={draftable}
                    onPick={pick}
                    onNoneEligible={() =>
                      rollRound({
                        decade: currentDecade ?? undefined,
                        excludeTeam: currentTeam ?? undefined,
                      })
                    }
                  />
                ) : (
                  <div className="py-8 text-center font-display text-sm text-[var(--md-ink-muted)]">
                    Spinning the reel…
                  </div>
                )}
              </div>
            </div>
          )}

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

      <footer className="relative z-10 mt-auto pt-12 text-center">
        <p className="font-display text-xs text-[var(--md-ink-muted)]">
          Powered by MotherDuck · <code>nba_box_scores_v2</code>
        </p>
        <p className="mt-2 text-[11px] text-[var(--md-ink-muted)]">
          An independent project, not affiliated with or endorsed by the NBA.
        </p>
      </footer>
    </main>
  );
}
