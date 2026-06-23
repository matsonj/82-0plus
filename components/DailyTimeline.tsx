"use client";

import { recentDailyDates } from "@/lib/dailyDate";
import { type DayEntry } from "@/lib/dailyHistory";

// "2026-06-10" → "Tue" for the cell label (plain calendar date, no TZ shift).
function weekday(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    weekday: "short",
    timeZone: "UTC",
  });
}

// "2026-06-10" → "Tue, Jun 10" for the hover tooltip.
function pretty(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The last 7 daily challenges as a full-width strip of scorecards — one card per
 * day with its W–L record, today on the right with a flame border + PLAY call.
 * Each card taps to review a finished day or play an unplayed one (the click
 * routes through playDaily, the server gate). "View all" toggles the archive grid.
 */
export function DailyTimeline({
  today,
  results = {},
  onPlay,
  archiveOpen,
  onToggleArchive,
}: {
  today: string;
  results?: Record<string, DayEntry>;
  onPlay: (date: string) => void;
  archiveOpen: boolean;
  onToggleArchive: () => void;
}) {
  // Last 7 Pacific days, oldest → newest so today lands on the right.
  const days = recentDailyDates(7).slice().reverse();

  return (
    <div className="w-full">
      <div className="md-rule-double flex items-end justify-between pb-2">
        <span className="font-cond text-[14px] font-bold uppercase tracking-[0.16em]">
          Last 7 Days
        </span>
        <button
          type="button"
          onClick={onToggleArchive}
          className="font-cond text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--md-coral)] underline-offset-2 hover:underline"
        >
          {archiveOpen ? "Hide" : "View all →"}
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1.5 sm:gap-2.5">
        {days.map((date) => {
          const r = results[date];
          const isToday = date === today;
          const perfect = r?.perfect;
          return (
            <button
              key={date}
              type="button"
              onClick={() => onPlay(date)}
              title={
                r
                  ? `${pretty(date)} · ${r.wins}–${r.losses}${r.perfect ? " · perfect" : ""}`
                  : isToday
                    ? "Play today’s challenge"
                    : `${pretty(date)} · play`
              }
              aria-label={
                r ? `${pretty(date)}, ${r.wins} and ${r.losses}` : `${pretty(date)}, not played`
              }
              className="flex flex-col items-center justify-center gap-1 border-2 px-1 py-3 transition-transform hover:-translate-y-0.5"
              style={{
                borderColor: isToday ? "var(--md-coral)" : "var(--md-ink)",
                background: perfect ? "var(--md-yellow)" : "var(--md-white)",
                boxShadow: isToday ? "var(--md-shadow-pop)" : "var(--md-shadow-sm)",
              }}
            >
              <span className="font-cond text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--md-ink-muted)] sm:text-[11px]">
                {isToday ? "Today" : weekday(date)}
              </span>
              {r ? (
                <span className="font-mono text-[13px] font-bold tabular-nums leading-none sm:text-[18px]">
                  {r.wins}-{r.losses}
                </span>
              ) : isToday ? (
                <span className="font-cond text-[13px] font-bold uppercase leading-none text-[var(--md-coral)] sm:text-[15px]">
                  Play →
                </span>
              ) : (
                <span className="font-mono text-[14px] leading-none text-[var(--md-ink-muted)] sm:text-[16px]">
                  —
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
