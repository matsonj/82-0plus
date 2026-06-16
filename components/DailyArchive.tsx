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

/** The net-rating "score", optionally ringed: a single circle for a top-10% finish,
 *  a double circle for a champion — the Masters-scorecard convention. `gap` is the
 *  cell fill, so the double ring reads as a clean concentric circle. */
function Score({
  value,
  annotate,
  color,
  gap,
}: {
  value: string;
  annotate: Annotate;
  color: string;
  gap: string;
}) {
  if (!value) return null;
  if (annotate === "none")
    return (
      <span className="font-display text-[12px] font-bold leading-none tabular-nums sm:text-[13px]" style={{ color }}>
        {value}
      </span>
    );
  // A contained ring, centred in the cell. The double ring is drawn INSET (rings
  // inside the circle, gap = cell fill) so its footprint is exactly the circle and
  // never bleeds onto the corner day-number or cell edge — the outward variant
  // overflowed the small mobile cells. Sizes up a touch at sm+ for the bigger grid.
  return (
    <span
      className="inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border-2 border-[var(--md-ink)] font-display text-[11px] font-bold leading-none tabular-nums sm:h-[30px] sm:w-[30px] sm:text-[13px]"
      style={{
        color,
        boxShadow:
          annotate === "double"
            ? `inset 0 0 0 1.5px ${gap}, inset 0 0 0 3px var(--md-ink)`
            : undefined,
      }}
    >
      {value}
    </span>
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
              className="relative flex aspect-square items-center justify-center p-1 transition-transform enabled:hover:-translate-y-0.5 disabled:cursor-default"
              style={{ background: s.bg, border: s.border }}
            >
              {/* Day number tucked into the corner so the ringed score gets the
                  whole cell — keeps the champion double-ring clear of it on mobile. */}
              <span
                className="absolute right-1 top-1 font-display text-[9px] font-bold leading-none sm:text-[10px]"
                style={{ color: s.day }}
              >
                {c.day}
              </span>
              <Score value={score} annotate={s.annotate} color={s.text} gap={s.bg} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
