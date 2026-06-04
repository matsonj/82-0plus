"use client";

import { useEffect, useState } from "react";
import { msUntilPacificMidnight } from "@/lib/dailyDate";

// Time until the next daily resets (midnight Pacific — matches /api/daily's date).
export function Countdown() {
  const [left, setLeft] = useState("");

  useEffect(() => {
    const tick = () => {
      const ms = Math.max(0, msUntilPacificMidnight());
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const s = Math.floor((ms % 60_000) / 1000);
      const pad = (n: number) => String(n).padStart(2, "0");
      setLeft(`${pad(h)}:${pad(m)}:${pad(s)}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return <span className="tabular-nums">{left}</span>;
}
