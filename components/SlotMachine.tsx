"use client";

import { useEffect, useRef, useState } from "react";

// Codes used only for the visual flicker while a slot "spins".
const FLICKER = [
  "LAL", "BOS", "CHI", "NYK", "MIA", "GSW", "SAS", "DET", "PHX",
  "SEA", "UTA", "DEN", "HOU", "ORL", "DAL", "PHI", "TOR", "MEM",
];
const DECADE_FLICKER = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];
const SPIN_MS = 650;
const TICK_MS = 70;

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
  const prev = useRef<string | null>(team);

  const [decadeDisplay, setDecadeDisplay] = useState(decade);
  const [decadeSpinning, setDecadeSpinning] = useState(false);
  const prevDecade = useRef<number>(decade);
  // True while the decade reel is held spinning on a full roll, waiting for the
  // team fetch to land so both reels can resolve at the same moment.
  const decadeWaiting = useRef(false);

  const teamTick = () =>
    setDisplay(FLICKER[Math.floor(Math.random() * FLICKER.length)]);
  const decadeTick = () =>
    setDecadeDisplay(
      DECADE_FLICKER[Math.floor(Math.random() * DECADE_FLICKER.length)],
    );

  // Team reel: spins when the team value changes (a team skip or a full roll).
  // While the team is still being fetched (null) it flickers indefinitely; once
  // it arrives it settles for SPIN_MS and lands. A decade skip keeps the same
  // team, so this stays static.
  useEffect(() => {
    if (team === prev.current) return;
    prev.current = team;
    setSpinning(true);
    const iv = setInterval(teamTick, TICK_MS);
    if (team === null) {
      // Rolling — keep flickering until the team lands (next effect run).
      return () => clearInterval(iv);
    }
    const to = setTimeout(() => {
      clearInterval(iv);
      setDisplay(team);
      setSpinning(false);
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

  return (
    <div className="flex items-center gap-3 sm:gap-4">
      <div
        className={`md-badge ${dim} ${spinning ? "md-spinning" : ""}`}
        style={archivo}
      >
        {display}
      </div>
      <div
        className={`inline-flex items-center border-2 border-[var(--md-ink)] bg-[var(--md-coral)] leading-none text-[var(--md-paper)] ${eraCls} ${decadeSpinning ? "md-spinning" : ""}`}
        style={archivo}
      >
        {decadeDisplay}s
      </div>
    </div>
  );
}
