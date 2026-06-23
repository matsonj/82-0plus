"use client";

import { useEffect, useRef, useState } from "react";

// Codes that streak past in the reel window while a slot "spins". Order is the
// physical reel order — the strip scrolls through them so the eye reads motion,
// not letters.
const FLICKER = [
  "LAL", "BOS", "CHI", "NYK", "MIA", "GSW", "SAS", "DET", "PHX",
  "SEA", "UTA", "DEN", "HOU", "ORL", "DAL", "PHI", "TOR", "MEM",
];
const DECADE_FLICKER = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];

// How long a reel keeps screaming before it lands once the result is known.
// The land (decelerate + snap + settle) is a CSS one-shot layered on top.
const SPIN_MS = 620;
// Reel-scroll cadence: how fast the strip cycles one full pass while spinning.
// Short = a fast, blurred scream. Retuned from the old per-tick flicker model
// to a continuous CSS scroll, so this is a duration, not a setInterval tick.
const TICK_MS = 70; // kept exported-name parity; now the JS strip-shuffle cadence

export function SlotMachine({
  team,
  decade,
  size = "md",
}: {
  team: string | null;
  decade: number;
  size?: "lg" | "md" | "sm";
}) {
  const [display, setDisplay] = useState(team ?? "···");
  const [spinning, setSpinning] = useState(false);
  // Bumped each time the team reel lands, to retrigger the one-shot land anim.
  const [teamLand, setTeamLand] = useState(0);
  const prev = useRef<string | null>(team);

  const [decadeDisplay, setDecadeDisplay] = useState(decade);
  const [decadeSpinning, setDecadeSpinning] = useState(false);
  const [decadeLand, setDecadeLand] = useState(0);
  const prevDecade = useRef<number>(decade);
  // True while the decade reel is held spinning on a full roll, waiting for the
  // team fetch to land so both reels can resolve at the same moment.
  const decadeWaiting = useRef(false);

  // Re-seed the blurred strip occasionally so a long fetch doesn't show the
  // same frozen codes — keeps the scream alive when team stays null.
  const teamTick = () =>
    setDisplay(FLICKER[Math.floor(Math.random() * FLICKER.length)]);
  const decadeTick = () =>
    setDecadeDisplay(
      DECADE_FLICKER[Math.floor(Math.random() * DECADE_FLICKER.length)],
    );

  // Team reel: spins when the team value changes (a team skip or a full roll).
  // While the team is still being fetched (null) it scrolls indefinitely; once
  // it arrives it screams for SPIN_MS then lands (decelerate + snap). A decade
  // skip keeps the same team, so this stays static.
  useEffect(() => {
    if (team === prev.current) return;
    prev.current = team;
    setSpinning(true);
    const iv = setInterval(teamTick, TICK_MS);
    if (team === null) {
      // Rolling — keep scrolling until the team lands (next effect run).
      return () => clearInterval(iv);
    }
    const to = setTimeout(() => {
      clearInterval(iv);
      setDisplay(team);
      setSpinning(false);
      setTeamLand((n) => n + 1);
    }, SPIN_MS);
    return () => {
      clearInterval(iv);
      clearTimeout(to);
    };
  }, [team]);

  // Decade reel. A decade skip (team unchanged) spins and lands on its own
  // timer. A FULL roll changes the decade while the team is still being fetched
  // (team === null) — there we hold the decade reel spinning and land it
  // together with the team the moment the fetch resolves. A team skip leaves the
  // decade untouched, so this stays static — the user sees which skip they spent.
  useEffect(() => {
    const changed = decade !== prevDecade.current;
    if (changed) {
      prevDecade.current = decade;
      setDecadeSpinning(true);
      const iv = setInterval(decadeTick, TICK_MS);
      if (team === null) {
        // Full roll: hold until the team lands.
        decadeWaiting.current = true;
        return () => clearInterval(iv);
      }
      decadeWaiting.current = false;
      const to = setTimeout(() => {
        clearInterval(iv);
        setDecadeDisplay(decade);
        setDecadeSpinning(false);
        setDecadeLand((n) => n + 1);
      }, SPIN_MS);
      return () => {
        clearInterval(iv);
        clearTimeout(to);
      };
    }
    // Decade value didn't change, but a full roll was waiting on the team — and
    // it just arrived. Settle + land in lockstep with the team reel.
    if (decadeWaiting.current && team !== null) {
      decadeWaiting.current = false;
      const iv = setInterval(decadeTick, TICK_MS);
      const to = setTimeout(() => {
        clearInterval(iv);
        setDecadeDisplay(decade);
        setDecadeSpinning(false);
        setDecadeLand((n) => n + 1);
      }, SPIN_MS);
      return () => {
        clearInterval(iv);
        clearTimeout(to);
      };
    }
  }, [decade, team]);

  // Badge (team) + era-box sizing per size. The team chip is a self-contained
  // ink chip with cream Archivo type, so it reads on a dark "roll" card (ink-on-
  // ink, the cream wordmark carries) AND on a light surface (a dark chip).
  const dim =
    size === "lg"
      ? "h-16 w-28 text-3xl sm:h-24 sm:w-40 sm:text-5xl"
      : size === "sm"
        ? "h-11 w-16 text-base"
        : "h-16 w-20 text-2xl";
  const eraCls =
    size === "lg"
      ? "px-3 py-1 text-2xl sm:text-4xl"
      : size === "sm"
        ? "px-1.5 py-0.5 text-sm"
        : "px-2 py-0.5 text-xl";
  const archivo = {
    fontFamily: "var(--font-display)",
    fontWeight: 900,
    fontVariationSettings: '"wdth" 110',
    letterSpacing: "-0.01em",
  } as const;

  // While spinning, render a vertical reel strip (multiple codes stacked) that
  // scrolls under motion blur — that's the "scream". When landed, render just
  // the result and replay the land one-shot (decelerate → snap → settle).
  const teamStrip = reelStrip(display, FLICKER);
  const decadeStrip = reelStrip(decadeDisplay, DECADE_FLICKER).map((d) => `${d}s`);

  return (
    <div className="flex items-center gap-3 sm:gap-4">
      <div className={`md-reel ${dim}`}>
        <div
          className={`md-badge md-reel__face ${spinning ? "md-reel__face--spinning" : ""}`}
          style={archivo}
          // teamLand keys the element so the land animation replays on each land.
          key={`team-${teamLand}`}
        >
          {spinning ? (
            <span className="md-reel__strip" aria-hidden="true">
              {teamStrip.map((code, i) => (
                <span key={i} className="md-reel__cell">
                  {code}
                </span>
              ))}
            </span>
          ) : (
            <span className={`md-reel__result ${teamLand > 0 ? "md-reel__land" : ""}`}>
              {display}
            </span>
          )}
        </div>
      </div>
      <div
        className={`md-reel inline-flex items-center border-2 border-[var(--md-ink)] bg-[var(--md-coral)] leading-none text-[var(--md-paper)] ${eraCls}`}
        style={archivo}
      >
        <div
          className={`md-reel__face md-reel__face--era ${decadeSpinning ? "md-reel__face--spinning" : ""}`}
          key={`decade-${decadeLand}`}
        >
          {decadeSpinning ? (
            <span className="md-reel__strip" aria-hidden="true">
              {decadeStrip.map((code, i) => (
                <span key={i} className="md-reel__cell">
                  {code}
                </span>
              ))}
            </span>
          ) : (
            <span className={`md-reel__result ${decadeLand > 0 ? "md-reel__land" : ""}`}>
              {decadeDisplay}s
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// Build a short vertical strip centered on `current`, drawn from `pool`, so the
// scrolling reel shows a believable run of neighbors rather than one repeated
// code. Five cells is plenty for a blurred scroll window.
function reelStrip<T>(current: T, pool: T[]): T[] {
  const idx = Math.max(0, pool.indexOf(current as T));
  const n = pool.length;
  return [-2, -1, 0, 1, 2].map((o) => pool[(idx + o + n * 2) % n]);
}
