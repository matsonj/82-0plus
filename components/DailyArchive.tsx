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
 *  by the main CTA, so this lists the prior days. Completion is server-authoritative
 *  (`results`, keyed by date) — a finished day shows its record (tap to review the
 *  result/compare), an unplayed day offers Play. The click still routes through
 *  playDaily, so the server remains the gate even if this map is stale. */
export function DailyArchive({
  today,
  results = {},
  onPlay,
}: {
  today: string;
  results?: Record<string, { wins: number; losses: number; perfect: boolean }>;
  onPlay: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const dates = useMemo(
    () => recentDailyDates().filter((d) => d !== today),
    [today],
  );

  if (dates.length === 0) return null;

  return (
    <div className="mt-3 w-full max-w-md">
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
          {dates.map((d) => {
            const done = results[d];
            return (
              <div
                key={d}
                className="flex items-center justify-between gap-3 border-b border-[var(--md-paper-3)] px-3 py-2"
              >
                <span className="font-display text-sm font-bold">{label(d)}</span>
                {done ? (
                  <button
                    className="flex items-center gap-2 font-display text-sm"
                    onClick={() => onPlay(d)}
                    title="Tap to review your result"
                  >
                    <span className="tabular-nums font-bold">
                      {done.wins}&ndash;{done.losses}
                    </span>
                    <span aria-hidden>{done.perfect ? "🏆" : "✓"}</span>
                  </button>
                ) : (
                  <button
                    className="md-btn md-btn--sm md-btn--secondary"
                    onClick={() => onPlay(d)}
                  >
                    Play
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
