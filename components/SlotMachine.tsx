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
// The year reel keeps screaming this much LONGER than the team reel, so the
// reels stop left-to-right (team first, then year) like a real slot machine.
const STAGGER_MS = 360;
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
  // Bumped each time a reel lands, to retrigger the one-shot land animation.
  const [teamLand, setTeamLand] = useState(0);
  // undefined sentinel → the reel also spins on first mount (the initial reveal,
  // and the remount after a pick), not only on later prop changes.
  const prev = useRef<string | null | undefined>(undefined);

  const [decadeDisplay, setDecadeDisplay] = useState(decade);
  const [decadeSpinning, setDecadeSpinning] = useState(false);
  const [decadeLand, setDecadeLand] = useState(0);
  const prevDecade = useRef<number | undefined>(undefined);

  // Re-seed the blurred strip occasionally so a long fetch doesn't show the
  // same frozen codes — keeps the scream alive when team stays null.
  const teamTick = () =>
    setDisplay(FLICKER[Math.floor(Math.random() * FLICKER.length)]);
  const decadeTick = () =>
    setDecadeDisplay(
      DECADE_FLICKER[Math.floor(Math.random() * DECADE_FLICKER.length)],
    );

  // BOTH reels spin on any reveal (a full roll, a team skip, a decade skip, or
  // the first mount), and they stop left-to-right: the TEAM lands first, then
  // the YEAR a beat (STAGGER_MS) later — like a real slot machine. While the
  // team is still being fetched (team === null) both keep screaming; the lands
  // are scheduled from the moment the team resolves.
  useEffect(() => {
    const teamChanged = team !== prev.current;
    const decadeChanged = decade !== prevDecade.current;
    if (!teamChanged && !decadeChanged) return;
    prev.current = team;
    prevDecade.current = decade;

    setSpinning(true);
    setDecadeSpinning(true);
    const tiv = setInterval(teamTick, TICK_MS);
    const div = setInterval(decadeTick, TICK_MS);

    // Can't land the team until the fetch resolves — keep both screaming until
    // a later run arrives with the team known.
    if (team === null) {
      return () => {
        clearInterval(tiv);
        clearInterval(div);
      };
    }

    const teamTo = setTimeout(() => {
      clearInterval(tiv);
      setDisplay(team);
      setSpinning(false);
      setTeamLand((n) => n + 1);
    }, SPIN_MS);
    const decadeTo = setTimeout(() => {
      clearInterval(div);
      setDecadeDisplay(decade);
      setDecadeSpinning(false);
      setDecadeLand((n) => n + 1);
    }, SPIN_MS + STAGGER_MS);

    return () => {
      clearInterval(tiv);
      clearInterval(div);
      clearTimeout(teamTo);
      clearTimeout(decadeTo);
    };
  }, [team, decade]);

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
            <span className="md-reel__strip" aria-hidden="true">
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
        className={`md-reel inline-flex items-center border-2 border-[var(--md-ink)] bg-[var(--md-coral)] leading-none text-[var(--md-paper)] ${eraCls}`}
        style={archivo}
      >
        <div
          className={`md-reel__face md-reel__face--era ${decadeSpinning ? "md-reel__face--spinning" : ""}`}
        >
          <span
            key={`decade-${decadeLand}`}
            className={`md-reel__result ${!decadeSpinning && decadeLand > 0 ? "md-reel__land" : ""}`}
            style={decadeSpinning ? { visibility: "hidden" } : undefined}
          >
            {decadeDisplay}s
          </span>
          {decadeSpinning && (
            <span className="md-reel__strip" aria-hidden="true">
              {decadeStrip.map((code, i) => (
                <span key={i} className="md-reel__cell">
                  {code}
                </span>
              ))}
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
