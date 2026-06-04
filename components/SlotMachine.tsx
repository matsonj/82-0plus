"use client";

import { useEffect, useRef, useState } from "react";

// Codes used only for the visual flicker while a slot "spins".
const FLICKER = [
  "LAL", "BOS", "CHI", "NYK", "MIA", "GSW", "SAS", "DET", "PHX",
  "SEA", "UTA", "DEN", "HOU", "ORL", "DAL", "PHI", "TOR", "MEM",
];

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
    }, 70);
    const to = setTimeout(() => {
      clearInterval(iv);
      setDisplay(team);
      setSpinning(false);
    }, 650);
    return () => {
      clearInterval(iv);
      clearTimeout(to);
    };
  }, [team]);

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
        className={`font-display ${label} font-bold uppercase tracking-wide text-[var(--md-ink-muted)]`}
      >
        {decade}s
      </div>
    </div>
  );
}
