"use client";

import { useEffect, useRef, useState } from "react";

// Countdown to a fixed ISO instant, ticking once a second. Two uses:
//   • tournament-level "Locks in HH:MM:SS" (the open window's expires_at), and
//   • per-entrant "M:SS to lock in" (the 10-minute completion deadline).
// `onExpire` fires EXACTLY once when the clock crosses zero (guarded by a ref) —
// callers use it to trigger the "you were removed" flow / a lobby re-fetch.
// `compact` switches to M:SS (no zero-padded hours) for the short per-entry window;
// the default HH:MM:SS preserves the tournament-level display.
export function EntryCountdown({
  expiresAt,
  onExpire,
  compact = false,
}: {
  expiresAt: string;
  onExpire?: () => void;
  compact?: boolean;
}) {
  const [left, setLeft] = useState("");
  const firedRef = useRef(false);
  // Hold the latest onExpire so a changing callback doesn't re-arm the interval.
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    firedRef.current = false;
    const target = Date.parse(expiresAt);
    const pad = (n: number) => String(n).padStart(2, "0");
    const tick = () => {
      const ms = Math.max(0, target - Date.now());
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const s = Math.floor((ms % 60_000) / 1000);
      setLeft(
        compact
          ? h > 0
            ? `${h}:${pad(m)}:${pad(s)}`
            : `${m}:${pad(s)}`
          : `${pad(h)}:${pad(m)}:${pad(s)}`,
      );
      if (ms <= 0 && !firedRef.current) {
        firedRef.current = true;
        onExpireRef.current?.();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, compact]);

  return <span className="tabular-nums">{left}</span>;
}
