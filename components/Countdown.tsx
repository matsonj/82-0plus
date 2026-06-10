"use client";

import { useEffect, useState } from "react";
import { msUntilPacificMidnight } from "@/lib/dailyDate";

function format(ms: number): string {
  const v = Math.max(0, ms);
  const h = Math.floor(v / 3_600_000);
  const m = Math.floor((v % 3_600_000) / 60_000);
  const s = Math.floor((v % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// Time until the next daily resets (midnight Pacific — matches /api/daily's date).
// Seeded synchronously so the time is on the first paint instead of popping in a
// tick later; suppressHydrationWarning covers the sub-second server/client drift.
export function Countdown() {
  const [left, setLeft] = useState(() => format(msUntilPacificMidnight()));

  useEffect(() => {
    const tick = () => setLeft(format(msUntilPacificMidnight()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="tabular-nums" suppressHydrationWarning>
      {left}
    </span>
  );
}
