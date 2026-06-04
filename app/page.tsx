"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

const KINDS: SlotKind[] = ["G", "FLEX", "W", "FLEX", "B"];
type Phase = "menu" | "play";

// Each time a decade is used its odds drop 30% (weight × 0.7 per use).
function pickWeightedDecade(pool: number[], usage: Record<number, number>): number {
  const weights = pool.map((d) => Math.pow(0.7, usage[d] ?? 0));
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
  const [simulating, setSimulating] = useState(false);
  const [booting, setBooting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rollSeq = useRef(0); // guards against out-of-order /api/slot responses
  const rollActive = useRef(false); // synchronous in-flight flag for the auto-start effect
  const lineupRef = useRef(lineup); // latest lineup for rollRound (avoids stale closure)
  lineupRef.current = lineup;

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

  const startGame = useCallback(async (m: GameMode) => {
    setMode(m);
    setResult(null);
    setResultRoster([]);
    setLineup(KINDS.map(() => null));
    setCurrentDecade(null);
    setCurrentTeam(null);
    setPending(null);
    setSelected(null);
    setTeamSkips(1);
    setDecadeSkips(1);
    setError(null);
    setPhase("play");
    setBooting(true);
    try {
      const res = await fetch("/api/decades");
      if (!res.ok) throw new Error("load failed");
      const { decades: ds } = (await res.json()) as { decades: number[] };
      setDecades(ds);
    } catch {
      setError("Couldn't load the league. Try again.");
    } finally {
      setBooting(false);
    }
  }, []);

  const backToMenu = () => {
    setPhase("menu");
    setResult(null);
    setResultRoster([]);
    setLineup(KINDS.map(() => null));
    setCurrentDecade(null);
    setCurrentTeam(null);
  };

  // Start a new round whenever there's an open slot and no active round.
  useEffect(() => {
    if (phase !== "play" || booting || result || draftDone) return;
    if (currentDecade !== null || rollActive.current) return;
    if (decades.length === 0) return;
    rollRound({});
  }, [phase, booting, result, draftDone, currentDecade, decades, rollRound]);

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
    const entry: LineupEntry = { player, team: currentTeam, decade: currentDecade };
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
    try {
      const res = await fetch(`/api/team-decades?team=${currentTeam}`);
      if (!res.ok) return;
      const { decades: teamDecades } = (await res.json()) as { decades: number[] };
      const others = (teamDecades ?? []).filter((d) => d !== currentDecade);
      if (others.length === 0) {
        setError(`${currentTeam} only has players in the ${currentDecade}s.`);
        return; // keep the skip
      }
      setDecadeSkips((n) => n - 1);
      const usage: Record<number, number> = {};
      for (const e of lineupRef.current) {
        if (e) usage[e.decade] = (usage[e.decade] ?? 0) + 1;
      }
      setCurrentDecade(pickWeightedDecade(others, usage));
    } catch {
      /* keep the skip on failure */
    }
  };

  const simulate = async () => {
    setSimulating(true);
    try {
      const picks: SimPick[] = lineup.filter(Boolean).map((e) => {
        const entry = e as LineupEntry;
        return {
          entity_id: entry.player.entity_id,
          team: entry.team,
          decade: entry.decade,
        };
      });
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roster: picks }),
      });
      if (!res.ok) throw new Error("simulate failed");
      const data = await res.json();
      setResult(data.result as SimResult);
      setResultRoster((data.roster as SimRosterLine[]) ?? []);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("Couldn't simulate that season. Try again.");
    } finally {
      setSimulating(false);
    }
  };

  return (
    <main className="relative mx-auto flex min-h-full max-w-3xl flex-col overflow-x-hidden px-4 pb-12 sm:pb-16">
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
            {mode === "hoopiq" ? "HoopIQ" : "Classic"}
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

          <div className="mt-8 font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
            Choose a mode
          </div>
          <div className="mt-3 grid w-full max-w-md gap-3 sm:grid-cols-2">
            <button
              className="md-card md-card--lift p-5 text-left transition-transform hover:-translate-y-0.5"
              onClick={() => startGame("classic")}
            >
              <div className="font-display text-xl font-bold">Classic</div>
              <p className="mt-1 text-[13px] text-[var(--md-ink-muted)]">
                Per-game stats shown. Draft with full information.
              </p>
            </button>
            <button
              className="md-card md-card--lift p-5 text-left transition-transform hover:-translate-y-0.5"
              style={{ background: "var(--md-ink)" }}
              onClick={() => startGame("hoopiq")}
            >
              <div className="font-display text-xl font-bold text-[var(--md-white)]">
                HoopIQ
              </div>
              <p className="mt-1 text-[13px] text-[var(--md-paper-3)]">
                Stats hidden. Draft from memory — true hoops IQ.
              </p>
            </button>
          </div>
          <p className="mt-6 text-[11px] text-[var(--md-ink-muted)]">
            Players are sorted by minutes per game.
          </p>
        </section>
      )}

      {error && phase === "play" && (
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
            onReset={backToMenu}
          />
        </section>
      )}

      {/* ---------------- GAME ---------------- */}
      {phase === "play" && !result && !booting && (
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
            <div className="md-card md-card--lift flex flex-col items-center gap-4 p-4 sm:p-5">
              <div className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
                Round {draftedCount + 1} of {KINDS.length}
              </div>
              <SlotMachine team={currentTeam} decade={currentDecade} size="lg" />
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
              <div className="w-full">
                {currentTeam ? (
                  <PlayerList
                    team={currentTeam}
                    decade={currentDecade}
                    mode={mode}
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
