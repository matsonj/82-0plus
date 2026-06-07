"use client";

import { useEffect, useMemo, useState } from "react";
import { recentDailyDates } from "@/lib/dailyDate";

interface PlayedResult {
  wins: number;
  losses: number;
  perfect: boolean;
}

function readPlayed(date: string): PlayedResult | null {
  try {
    const raw = localStorage.getItem(`md820-daily-${date}`);
    return raw ? (JSON.parse(raw) as PlayedResult) : null;
  } catch {
    return null;
  }
}

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
 *  by the main CTA, so this lists the prior days. One attempt per date, ever —
 *  already-played days show their record instead of a Play button. */
export function DailyArchive({
  today,
  onPlay,
}: {
  today: string;
  onPlay: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // localStorage is client-only — read after mount so SSR markup matches.
  const [played, setPlayed] = useState<Record<string, PlayedResult | null>>({});

  const dates = useMemo(
    () => recentDailyDates().filter((d) => d !== today),
    [today],
  );

  useEffect(() => {
    if (!open) return;
    const map: Record<string, PlayedResult | null> = {};
    for (const d of dates) map[d] = readPlayed(d);
    setPlayed(map);
  }, [open, dates]);

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
          {dates.map((d) => {
            const res = played[d];
            return (
              <div
                key={d}
                className="flex items-center justify-between gap-3 border-b border-[var(--md-paper-3)] px-3 py-2"
              >
                <span className="font-display text-sm font-bold">{label(d)}</span>
                {res ? (
                  <span className="font-display text-xs text-[var(--md-ink-muted)]">
                    {res.perfect ? "🏆 " : ""}
                    {res.wins}&ndash;{res.losses} · played
                  </span>
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
