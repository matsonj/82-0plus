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

  // Team reel: only spins when the team value actually changes (a team skip or
  // a full roll). A decade skip keeps the same team, so this stays static.
  useEffect(() => {
    if (team === prev.current) return;
    prev.current = team;
    if (!team) {
      setDisplay("···");
      return;
    }
    setSpinning(true);
    const iv = setInterval(() => {
      setDisplay(FLICKER[Math.floor(Math.random() * FLICKER.length)]);
    }, TICK_MS);
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

  // Decade reel: only spins when the decade value actually changes (a decade
  // skip or a full roll). A team skip re-rolls within the same decade, so this
  // stays static — the user can see exactly which resource they spent.
  useEffect(() => {
    if (decade === prevDecade.current) return;
    prevDecade.current = decade;
    setDecadeSpinning(true);
    const iv = setInterval(() => {
      setDecadeDisplay(
        DECADE_FLICKER[Math.floor(Math.random() * DECADE_FLICKER.length)],
      );
    }, TICK_MS);
    const to = setTimeout(() => {
      clearInterval(iv);
      setDecadeDisplay(decade);
      setDecadeSpinning(false);
    }, SPIN_MS);
    return () => {
      clearInterval(iv);
      clearTimeout(to);
    };
  }, [decade]);

  const dim =
    size === "lg"
      ? "h-28 w-44 text-5xl"
      : size === "sm"
        ? "h-11 w-16 text-base"
        : "h-16 w-20 text-2xl";
  const label = size === "lg" ? "text-sm" : "text-[11px]";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`md-badge ${dim} ${spinning ? "md-spinning" : ""}`}>
        {display}
      </div>
      <div
        className={`font-display ${label} font-bold uppercase tracking-wide text-[var(--md-ink-muted)] ${decadeSpinning ? "md-spinning" : ""}`}
      >
        {decadeDisplay}s
      </div>
    </div>
  );
}
