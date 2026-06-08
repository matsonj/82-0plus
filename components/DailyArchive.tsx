"use client";

import { useMemo, useState } from "react";
import { recentDailyDates } from "@/lib/dailyDate";

// "2026-06-05" → "Jun 5" (parsed as a plain calendar date, no TZ shift).
function label(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** The Daily archive: replay any of the last ~30 daily challenges. Today is shown
 *  by the main CTA, so this lists the prior days. Completion is enforced
 *  server-side (playDaily → /api/daily/result), so every day offers Play — an
 *  already-finished day routes to its result on click instead of re-drafting. */
export function DailyArchive({
  today,
  onPlay,
}: {
  today: string;
  onPlay: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const dates = useMemo(
    () => recentDailyDates().filter((d) => d !== today),
    [today],
  );

  if (dates.length === 0) return null;

  return (
    <div className="mt-4 w-full max-w-md">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-blue)] underline"
      >
        {open ? "Hide previous challenges" : "Previous challenges"}
      </button>

      {open && (
        <div
          className="md-scroll mt-3 max-h-[16rem] overflow-auto border-2 border-[var(--md-ink)] bg-[var(--md-white)] text-left"
          style={{ boxShadow: "var(--md-shadow-md)" }}
        >
          {dates.map((d) => (
            <div
              key={d}
              className="flex items-center justify-between gap-3 border-b border-[var(--md-paper-3)] px-3 py-2"
            >
              <span className="font-display text-sm font-bold">{label(d)}</span>
              <button
                className="md-btn md-btn--sm md-btn--secondary"
                onClick={() => onPlay(d)}
              >
                Play
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
