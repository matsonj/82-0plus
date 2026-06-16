"use client";

import { useMemo } from "react";
import { recentDailyDates } from "@/lib/dailyDate";
import {
  historyGrid,
  dayState,
  cellStyle,
  fmtNet,
  PLAYED_FILL,
  type Annotate,
  type DayEntry,
} from "@/lib/dailyHistory";

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** The net-rating "score" — a plain, centred number ("+11", "0", "-4"). Achievement
 *  is shown by a separate corner RingBadge rather than by ringing the score, so the
 *  number stays legible even on a ~31px cell at a 320px viewport. */
function Score({ value, color }: { value: string; color: string }) {
  if (!value) return null;
  return (
    <span className="font-display text-[12px] font-bold leading-none tabular-nums sm:text-[13px]" style={{ color }}>
      {value}
    </span>
  );
}

/** A small corner ring flagging a standout day — a single ring for a top-10%
 *  finish, a double (concentric) ring for a tournament champion (the legend's
 *  language). It sits in the cell corner, clear of the day-number (top) and the
 *  centred score, so all three coexist even in the smallest cells. `gap` (the cell
 *  fill) is the double ring's middle band, so it reads as concentric. */
function RingBadge({ annotate, gap }: { annotate: Annotate; gap: string }) {
  if (annotate === "none") return null;
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute bottom-[3px] left-[3px] h-2 w-2 rounded-full sm:bottom-1 sm:left-1 sm:h-2.5 sm:w-2.5"
      style={{
        boxShadow:
          annotate === "double"
            ? `0 0 0 1.5px var(--md-ink), 0 0 0 3px ${gap}, 0 0 0 4.5px var(--md-ink)`
            : "0 0 0 1.5px var(--md-ink)",
      }}
    />
  );
}

const CircleSwatch = ({ double }: { double?: boolean }) => (
  <span
    className="inline-flex h-3.5 w-3.5 shrink-0 rounded-full"
    style={{
      border: "2px solid var(--md-ink)",
      boxShadow: double ? "0 0 0 1.5px var(--md-white), 0 0 0 3px var(--md-ink)" : undefined,
    }}
  />
);

/** The Daily archive: the last ~30 daily challenges as a compact scorecard grid,
 *  opened via the 7-day strip's "View all" toggle (`open` is parent-controlled). Each
 *  cell shows that day's net rating; a top-10% finish is circled, a champion double-circled
 *  (shared language with the strip via lib/dailyHistory). A finished day taps through
 *  to review it; an unplayed, in-window day offers play. The click still routes
 *  through playDaily, so the server stays the gate even if this map is stale. */
export function DailyArchive({
  today,
  results = {},
  onPlay,
  open,
}: {
  today: string;
  results?: Record<string, DayEntry>;
  onPlay: (date: string) => void;
  open: boolean;
}) {
  const cells = useMemo(() => historyGrid(today), [today]);

  const summary = useMemo(() => {
    const window = recentDailyDates();
    let played = 0;
    let trophies = 0; // tournament-bracket championships
    for (const d of window) {
      const r = results[d];
      if (!r) continue;
      played++;
      if (r.champion) trophies++;
    }
    return { played, total: window.length, trophies };
  }, [results]);

  if (!open) return null;

  return (
    <div
      className="mt-3 w-full border-2 border-[var(--md-ink)] bg-[var(--md-white)] p-4 text-left"
      style={{ boxShadow: "var(--md-shadow-md)" }}
    >
      {/* Header */}
      <div className="flex items-end justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <div className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--md-ink-muted)]">
            Daily Challenge · Archive
          </div>
          <div className="font-display text-[20px] font-bold leading-none">
            Last 30 days
          </div>
        </div>
        {summary.played > 0 && (
          <div
            className="shrink-0 border-2 border-[var(--md-ink)] bg-[var(--md-yellow)] px-2.5 py-1 font-display text-[12px] font-bold"
            style={{ boxShadow: "var(--md-shadow-sm)" }}
          >
            {summary.played}/{summary.total}
            {summary.trophies > 0 ? ` · 🏆 ${summary.trophies}` : ""}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
        <div className="flex items-center gap-1.5">
          <span className="h-3.5 w-3.5 shrink-0" style={{ background: PLAYED_FILL, border: "2px solid #E1D6CB" }} />
          <span className="font-display text-[11px] text-[var(--md-ink-muted)]">Net score</span>
        </div>
        <div className="flex items-center gap-1.5">
          <CircleSwatch />
          <span className="font-display text-[11px] text-[var(--md-ink-muted)]">Top 10%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <CircleSwatch double />
          <span className="font-display text-[11px] text-[var(--md-ink-muted)]">Champion</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-3.5 w-3.5 shrink-0" style={{ background: "var(--md-white)", border: "2px solid #E1D6CB" }} />
          <span className="font-display text-[11px] text-[var(--md-ink-muted)]">Missed</span>
        </div>
      </div>

      {/* Grid */}
      <div className="mt-3 grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="text-center font-display text-[10px] font-bold text-[var(--md-ink-muted)]"
          >
            {w}
          </div>
        ))}
        {cells.map((c) => {
          const r = results[c.iso];
          const st = dayState(c.iso, today, r, c.inWindow);
          const s = cellStyle(st);
          const interactive = st !== "future" && st !== "out";
          const score = r ? fmtNet(r.margin) : "";
          return (
            <button
              key={c.iso}
              type="button"
              disabled={!interactive}
              onClick={() => interactive && onPlay(c.iso)}
              title={
                interactive
                  ? r
                    ? `${c.iso} · ${r.wins}–${r.losses} · ${fmtNet(r.margin)} net`
                    : st === "today"
                      ? "Play today’s challenge"
                      : "Play this day"
                  : undefined
              }
              className="relative flex aspect-square flex-col p-1 transition-transform enabled:hover:-translate-y-0.5 disabled:cursor-default"
              style={{ background: s.bg, border: s.border }}
            >
              {/* Day number on its own top row, the score centred below — they
                  never collide, even in a ~31px cell. The achievement ring is a
                  separate corner badge. */}
              <span
                className="text-right font-display text-[10px] font-bold leading-none"
                style={{ color: s.day }}
              >
                {c.day}
              </span>
              <span className="flex grow items-center justify-center">
                <Score value={score} color={s.text} />
              </span>
              <RingBadge annotate={s.annotate} gap={s.bg} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
