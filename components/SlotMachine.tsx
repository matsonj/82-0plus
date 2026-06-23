"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

// Codes that streak past in the reel window while a slot "spins". Order is the
// physical reel order — the strip scrolls through them so the eye reads motion,
// not letters.
const FLICKER = [
  "LAL", "BOS", "CHI", "NYK", "MIA", "GSW", "SAS", "DET", "PHX",
  "SEA", "UTA", "DEN", "HOU", "ORL", "DAL", "PHI", "TOR", "MEM",
];
const DECADE_FLICKER = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];

// How long a reel scrolls before it locks once the result is known. Long
// enough that the decel TAIL crawls — the symbols slow to a near-readable
// crawl at the end to tease the result (the easing in .md-reel__strip is a
// long ease-out). The lock wobble is a CSS one-shot layered on top.
const SPIN_MS = 1300;
// The year reel keeps screaming this much LONGER than the team reel, so the
// reels stop left-to-right (team first, then year) like a real slot machine.
const STAGGER_MS = 440;
// The era reel's lock animation (the longest) runs this long after it stops
// spinning; we wait it out before signaling the reel has fully settled.
const LAND_MS = 900;
// More lead-in cells = more symbols to crawl through during the long decel
// tail (the tease). The strip is [current, ...lead-in, target].
const REEL_ITEMS_BEFORE_TARGET = 16;
// Each reel cell is this fraction of the window height, so several symbols
// stack inside the drum (denser than one-symbol-per-window). The edge-fade
// mask in .md-reel fades the partial neighbours above/below the centred one.
const REEL_CELL_FRACTION = 0.6;

type ReelValue = string | number;

function buildReelStrip<T extends ReelValue>(
  current: T,
  target: T,
  pool: readonly T[],
): T[] {
  const candidates = pool.filter((item) => item !== target);
  const source =
    candidates.length > 0
      ? candidates
      : pool.length > 0
        ? pool
        : [current];
  const leadIn: T[] = [];
  for (let i = 0; i < REEL_ITEMS_BEFORE_TARGET; i++) {
    leadIn.push(source[Math.floor(Math.random() * source.length)]);
  }
  return [current, ...leadIn, target];
}

function reelStyle(items: readonly ReelValue[], durationMs: number = SPIN_MS) {
  return {
    "--reel-count": items.length,
    "--reel-cell": REEL_CELL_FRACTION,
    "--reel-duration": `${durationMs}ms`,
  } as CSSProperties;
}

export function SlotMachine({
  team,
  decade,
  teamPool,
  decadePool,
  size = "md",
  onSettled,
}: {
  team: string | null;
  decade: number;
  teamPool?: string[];
  decadePool?: number[];
  size?: "lg" | "md" | "sm";
  // Fires once the reels have FULLY come to rest (both stopped spinning AND
  // their land animation has played out). Lets the parent reveal the player
  // list exactly when the reel stops, not while it's still settling.
  onSettled?: () => void;
}) {
  const [display, setDisplay] = useState(team ?? "···");
  const [teamStrip, setTeamStrip] = useState<string[]>([team ?? "···"]);
  const [spinning, setSpinning] = useState(false);
  // Bumped each time a reel lands, to retrigger the one-shot land animation.
  const [teamLand, setTeamLand] = useState(0);
  // Seed prev to the CURRENT value so a fresh mount with an unchanged team does
  // NOT spin (e.g. cancelling a pick remounts the roll card — the team didn't
  // change, so it should just show, not re-spin). Genuine reveals still spin:
  // they arrive as a null→value change while mounted. (A sentinel here would
  // also break under StrictMode's mount double-invoke → spin-forever.)
  const prev = useRef<string | null>(team);

  const [decadeDisplay, setDecadeDisplay] = useState(decade);
  const [decadeStrip, setDecadeStrip] = useState<number[]>([decade]);
  const [decadeSpinning, setDecadeSpinning] = useState(false);
  const [decadeLand, setDecadeLand] = useState(0);
  // How long the era strip SCROLLS. On a full roll it's held to land a beat
  // after the team, so its scroll must last that whole time (SPIN_MS+STAGGER)
  // or it stops scrolling early and sits static while the team is still going —
  // making both reels appear to stop together with an offset ring flash. A
  // standalone decade skip just uses SPIN_MS.
  const [decadeSpinMs, setDecadeSpinMs] = useState(SPIN_MS);
  const prevDecade = useRef<number>(decade);
  // True while a full roll's decade reel is held spinning, waiting for the team
  // to resolve so it can land a beat AFTER the team (left-to-right stop).
  const decadeWaiting = useRef(false);
  // First effect run of THIS mount — used to spin the year on a fresh full-roll
  // mount (where its value is already set, so there's no change to detect).
  const decadeFirstRun = useRef(true);
  // Settle detection (drives onSettled): whether a reel has been spinning, and
  // the pending "fully landed" timer.
  const wasSpinning = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const teamChoices = useMemo(
    () => (teamPool && teamPool.length > 0 ? teamPool : FLICKER),
    [teamPool],
  );
  const decadeChoices = useMemo(
    () => (decadePool && decadePool.length > 0 ? decadePool : DECADE_FLICKER),
    [decadePool],
  );

  // Team reel: spins ONLY when the team value changes (a team skip, a full roll,
  // or first mount). While the team is still being fetched (null) it scrolls
  // until it arrives, then screams for SPIN_MS and lands. A decade-only skip
  // leaves the team untouched → this stays static.
  useEffect(() => {
    if (team === prev.current) return;
    prev.current = team;
    if (team === null) return;
    setTeamStrip(buildReelStrip(display, team, teamChoices));
    setSpinning(true);
    const to = setTimeout(() => {
      setDisplay(team);
      setSpinning(false);
      setTeamLand((n) => n + 1);
    }, SPIN_MS);
    return () => {
      clearTimeout(to);
    };
  }, [display, team, teamChoices]);

  // Decade reel: spins when the decade value changes (a decade skip, or a full
  // roll while mounted) OR on a FRESH MOUNT that's mid-full-roll (team === null).
  // The post-pick remount seeds prevDecade to the new value, wiping the change
  // signal, so team===null is what tells us a roll is underway and the year
  // should spin. A team-only skip is a MOUNTED transition (not firstRun) with an
  // unchanged decade, so it stays static — only the team spins there. On a full
  // roll the year is held spinning and lands STAGGER_MS AFTER the team
  // (left-to-right stop); a standalone decade skip lands on its own SPIN_MS timer.
  useEffect(() => {
    const firstRun = decadeFirstRun.current;
    decadeFirstRun.current = false;
    const changed = decade !== prevDecade.current;
    if (changed || (firstRun && team === null)) {
      prevDecade.current = decade;
      setDecadeStrip(buildReelStrip(decadeDisplay, decade, decadeChoices));
      setDecadeSpinning(true);
      if (team === null) {
        // Full roll: held until the team lands. Scroll for the whole held
        // window so the reel keeps spinning right up to its (staggered) land
        // instead of stopping early next to the team.
        setDecadeSpinMs(SPIN_MS + STAGGER_MS);
        decadeWaiting.current = true; // full roll: wait for the team to land first
        return;
      }
      setDecadeSpinMs(SPIN_MS);
      decadeWaiting.current = false;
      const to = setTimeout(() => {
        setDecadeDisplay(decade);
        setDecadeSpinning(false);
        setDecadeLand((n) => n + 1);
      }, SPIN_MS);
      return () => {
        clearTimeout(to);
      };
    }
    // Decade value didn't change, but a full roll was waiting on the team — it
    // just resolved. Land the decade a beat after the team (left-to-right stop).
    if (decadeWaiting.current && team !== null) {
      decadeWaiting.current = false;
      const to = setTimeout(() => {
        setDecadeDisplay(decade);
        setDecadeSpinning(false);
        setDecadeLand((n) => n + 1);
      }, SPIN_MS + STAGGER_MS);
      return () => {
        clearTimeout(to);
      };
    }
  }, [decade, decadeChoices, decadeDisplay, team]);

  // Signal "fully settled" once BOTH reels have stopped spinning and the (longest)
  // land animation has played out — so the player list reveals right as the reel
  // stops. A new spin cancels any pending signal. The timer-ref + null guard keeps
  // it from re-arming on benign re-renders; a separate unmount cleanup avoids a
  // stray fire after the card closes.
  useEffect(() => {
    if (spinning || decadeSpinning) {
      wasSpinning.current = true;
      if (settleTimer.current) {
        clearTimeout(settleTimer.current);
        settleTimer.current = null;
      }
      return;
    }
    if (wasSpinning.current && settleTimer.current === null) {
      settleTimer.current = setTimeout(() => {
        settleTimer.current = null;
        wasSpinning.current = false;
        onSettled?.();
      }, LAND_MS);
    }
  }, [spinning, decadeSpinning, onSettled]);
  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    [],
  );

  // Badge (team) + era-box sizing per size. The team chip is a self-contained
  // ink chip with cream Archivo type, so it reads on a dark "roll" card (ink-on-
  // ink, the cream wordmark carries) AND on a light surface (a dark chip).
  const dim =
    size === "lg"
      ? "h-16 w-28 text-3xl sm:h-24 sm:w-40 sm:text-5xl"
      : size === "sm"
        ? "h-11 w-16 text-base"
        : "h-16 w-20 text-2xl";
  // Era reel matches the TEAM reel's height (and text scale) so the spin motion
  // reads identically in both. Width is content-driven (px padding) to fit the
  // 5-char "1990s". On a black/ink ground like the team chip; the LANDED year is
  // coral (the red), so the red is what stays centered.
  const eraCls =
    size === "lg"
      ? "h-16 px-4 text-3xl sm:h-24 sm:px-6 sm:text-5xl"
      : size === "sm"
        ? "h-11 px-3 text-base"
        : "h-16 px-4 text-2xl";
  const archivo = {
    fontFamily: "var(--font-display)",
    fontWeight: 900,
    fontVariationSettings: '"wdth" 110',
    letterSpacing: "-0.01em",
  } as const;

  return (
    <div className="flex items-center gap-3 sm:gap-4">
      {/* Team reel. The result is ALWAYS in flow so the window keeps its size in
          every state (idle / spin / land) — no collapse-to-a-sliver. It's just
          hidden while spinning, with the scrolling strip overlaid on top. */}
      <div className={`md-reel ${dim}`}>
        <div
          className={`md-badge md-reel__face ${spinning ? "md-reel__face--spinning" : ""}`}
          style={archivo}
        >
          <span
            // teamLand keys it so the land one-shot replays on each landing.
            key={`team-${teamLand}`}
            className={`md-reel__result ${!spinning && teamLand > 0 ? "md-reel__land" : ""}`}
            style={spinning ? { visibility: "hidden" } : undefined}
          >
            {display}
          </span>
          {spinning && (
            <span
              className="md-reel__strip"
              style={reelStyle(teamStrip)}
              aria-hidden="true"
            >
              {teamStrip.map((code, i) => (
                <span key={i} className="md-reel__cell">
                  {code}
                </span>
              ))}
            </span>
          )}
        </div>
      </div>
      {/* Era reel — same in-flow-result trick (this is the box that was
          collapsing to "-" because it has no fixed height). */}
      <div
        className={`md-reel inline-flex items-center justify-center border-2 border-[var(--md-ink)] bg-[var(--md-ink)] leading-none text-[var(--md-paper)] ${eraCls}`}
        style={archivo}
      >
        <div
          className={`md-reel__face md-reel__face--era ${decadeSpinning ? "md-reel__face--spinning" : ""}`}
        >
          <span
            key={`decade-${decadeLand}`}
            className={`md-reel__result ${!decadeSpinning && decadeLand > 0 ? "md-reel__land" : ""}`}
            style={
              decadeSpinning
                ? { visibility: "hidden" }
                : { color: "var(--md-coral)" }
            }
          >
            {decadeDisplay}s
          </span>
          {decadeSpinning && (
            <span
              className="md-reel__strip"
              style={reelStyle(decadeStrip, decadeSpinMs)}
              aria-hidden="true"
            >
              {decadeStrip.map((decadeCode, i) => (
                <span key={i} className="md-reel__cell">
                  {decadeCode}s
                </span>
              ))}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
