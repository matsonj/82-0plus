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

// The standout-day glyph drawn inside the corner fold: a star for a top-10%
// finish, a trophy for a tournament champion. Drawn on a 28×28 viewBox so it
// scales crisply from a ~16px fold on a 320px cell up to the big desktop grid.
function FoldGlyph({ champ }: { champ: boolean }) {
  return champ ? (
    <g fill="var(--md-ink)">
      <path d="M4.3 2.8h7.2v2.1a3.6 3.6 0 0 1-7.2 0V2.8z" />
      <path d="M3 3.4H1.4v.7a2 2 0 0 0 2 2" fill="none" stroke="var(--md-ink)" strokeWidth="1.1" />
      <rect x="7.2" y="8.2" width="1.4" height="2.4" />
      <rect x="5" y="10.6" width="5.8" height="1.7" />
    </g>
  ) : (
    <path
      d="M7.5 3.4l1.25 2.7 2.95.32-2.2 2 .64 2.9L7.5 11.8 4.86 13.3l.64-2.9-2.2-2 2.95-.32z"
      fill="var(--md-white)"
    />
  );
}

/** A folded-corner ribbon flagging a standout day — an ink fold + white star for a
 *  top-10% finish, a gold fold + trophy for a tournament champion. It hugs the
 *  TOP-LEFT corner (opposite the right-aligned day number, above the centred score),
 *  so all three coexist even in a ~31px cell at 320px. Colour alone (ink vs gold)
 *  distinguishes the two; the glyph reinforces it as the cell grows. */
function CornerFold({ annotate }: { annotate: Annotate }) {
  if (annotate === "none") return null;
  const champ = annotate === "double";
  return (
    <svg
      aria-hidden
      viewBox="0 0 28 28"
      className="pointer-events-none absolute left-0 top-0 h-4 w-4 sm:h-6 sm:w-6"
    >
      <path d="M0 0H28L0 28Z" fill={champ ? "var(--md-yellow)" : "var(--md-ink)"} />
      <FoldGlyph champ={champ} />
    </svg>
  );
}

/** Legend swatch: a small played-cell square wearing the corner fold, so the key
 *  matches what the calendar cells show. */
function FoldSwatch({ champ }: { champ?: boolean }) {
  return (
    <span
      className="relative inline-block h-3.5 w-3.5 shrink-0 overflow-hidden border border-[var(--md-paper-3)]"
      style={{ background: PLAYED_FILL }}
    >
      <svg aria-hidden viewBox="0 0 28 28" className="absolute left-0 top-0 h-2.5 w-2.5">
        <path d="M0 0H28L0 28Z" fill={champ ? "var(--md-yellow)" : "var(--md-ink)"} />
        <FoldGlyph champ={!!champ} />
      </svg>
    </span>
  );
}

/** The Daily archive: the last ~30 daily challenges as a compact scorecard grid,
 *  opened via the 7-day strip's "View all" toggle (`open` is parent-controlled). Each
 *  cell shows that day's net rating; a top-10% finish gets an ink corner fold, a
 *  champion a gold one (shared language with lib/dailyHistory). A finished day taps through
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
          <FoldSwatch />
          <span className="font-display text-[11px] text-[var(--md-ink-muted)]">Top 10%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <FoldSwatch champ />
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
                  never collide, even in a ~31px cell. The achievement is a corner
                  fold hugging the opposite (top-left) corner. */}
              <span
                className="text-right font-display text-[10px] font-bold leading-none"
                style={{ color: s.day }}
              >
                {c.day}
              </span>
              <span className="flex grow items-center justify-center">
                <Score value={score} color={s.text} />
              </span>
              <CornerFold annotate={s.annotate} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
