"use client";

import { recentDailyDates } from "@/lib/dailyDate";

// "2026-06-10" → "Tue" (parsed as a plain calendar date, no TZ shift).
function weekday(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    weekday: "short",
    timeZone: "UTC",
  });
}

type DayResult = { wins: number; losses: number; perfect?: boolean };

/**
 * The last 7 daily challenges as a compact streak, today on the right. Each day is
 * tappable (review a finished day, or play an unplayed one — the click still routes
 * through playDaily, so the server stays the gate). Markers mirror the menu's
 * language: 🏆 won/perfect, ✅ played, an empty box for a missed day, and a filled
 * yellow box for today-not-yet-played. "View all" toggles the full archive.
 */
export function DailyTimeline({
  today,
  results = {},
  onPlay,
  archiveOpen,
  onToggleArchive,
}: {
  today: string;
  results?: Record<string, DayResult>;
  onPlay: (date: string) => void;
  archiveOpen: boolean;
  onToggleArchive: () => void;
}) {
  // Last 7 Pacific days, oldest → newest so today lands on the right.
  const days = recentDailyDates(7).slice().reverse();

  return (
    <div className="mt-6 w-full">
      <div className="flex items-center justify-between">
        <div className="font-display text-[12px] font-bold uppercase tracking-[0.06em] text-[var(--md-ink-muted)]">
          Last 7 days
        </div>
        <button
          type="button"
          onClick={onToggleArchive}
          className="font-display text-[12px] font-bold text-[var(--md-ink)] underline-offset-2 hover:underline"
        >
          {archiveOpen ? "Hide" : "View all →"}
        </button>
      </div>

      <div className="mt-3 flex items-start justify-between">
        {days.map((date) => {
          const r = results[date];
          const isToday = date === today;
          return (
            <button
              key={date}
              type="button"
              onClick={() => onPlay(date)}
              className="flex flex-1 flex-col items-center gap-[7px]"
              title={
                r
                  ? `${r.wins}–${r.losses}${r.perfect ? " · perfect" : ""}`
                  : isToday
                    ? "Play today’s challenge"
                    : "Play this day"
              }
            >
              <span className="flex h-[30px] items-center justify-center text-[26px] leading-none">
                {r?.perfect ? (
                  <span aria-hidden>🏆</span>
                ) : r ? (
                  <span aria-hidden>✅</span>
                ) : (
                  <span
                    className="inline-block h-6 w-6 border-2"
                    style={{
                      borderColor: isToday
                        ? "var(--md-ink)"
                        : "var(--md-paper-3)",
                      background: isToday ? "var(--md-yellow)" : "transparent",
                    }}
                  />
                )}
              </span>
              <span
                className="font-display text-[11px] font-bold"
                style={{
                  color: isToday ? "var(--md-ink)" : "var(--md-ink-muted)",
                }}
              >
                {isToday ? "Today" : weekday(date)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
