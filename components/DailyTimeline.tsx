"use client";

import { recentDailyDates } from "@/lib/dailyDate";
import { dayState, cellStyle, type DayEntry } from "@/lib/dailyHistory";

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
 * The last 7 daily challenges as a tight colour streak, today on the right. Pure
 * colour — teal played / yellow perfect / white missed, with a yellow border on
 * today — mirroring the archive grid's language so the two read as one system. Each
 * square taps to review a finished day or play an unplayed one (the click still routes
 * through playDaily, the server gate); the date + record live in the hover tooltip.
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

      <div className="mt-3 flex items-start">
        {days.map((date, i) => {
          const r = results[date];
          const isToday = date === today;
          // The last 7 days are always inside the playable window. Pure-colour squares
          // (record lives in the tooltip + the full archive grid), linked by a solid
          // line into a chain: [] — [] — [].
          const s = cellStyle(dayState(date, today, r, true));
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
              className="flex flex-1 flex-col items-center gap-1.5"
            >
              <span className="relative flex w-full items-center justify-center">
                {/* Connectors stop ~3px shy of the 14px box (7px half + 3px gap) so
                    each square has empty space around it on the chain. */}
                {i > 0 && (
                  <span
                    aria-hidden
                    className="absolute left-0 top-1/2 h-0.5 -translate-y-1/2"
                    style={{ width: "calc(50% - 10px)", background: "rgba(56,56,56,0.28)" }}
                  />
                )}
                {i < days.length - 1 && (
                  <span
                    aria-hidden
                    className="absolute right-0 top-1/2 h-0.5 -translate-y-1/2"
                    style={{ width: "calc(50% - 10px)", background: "rgba(56,56,56,0.28)" }}
                  />
                )}
                <span
                  className="relative z-10 h-3.5 w-3.5"
                  style={{ background: s.bg, border: s.border }}
                />
              </span>
              <span
                className="font-display text-[11px] font-bold"
                style={{ color: isToday ? "var(--md-ink)" : "var(--md-ink-muted)" }}
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
