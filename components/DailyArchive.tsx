"use client";

import { useMemo } from "react";
import { recentDailyDates } from "@/lib/dailyDate";
import {
  historyGrid,
  dayState,
  fmtNet,
  type DayEntry,
} from "@/lib/dailyHistory";
import { Stamp as PressStamp } from "@/components/ui";

// SLAM scorecard tints. Anything with an equivalent --md-* token now points at it
// via var(--md-*) (kept as named constants so the semantics stay legible and the
// on-light vs on-dark ground choice is explicit). The remaining literals are the
// warm scorecard grounds and the two faintest numeral greys — newsprint values
// that sit BETWEEN the brand spots and have no token of their own. Source of
// truth: Paper artboards G9N-0 / GZ5-0 (page 5-0).
const CELL_FILL = "#F3EEE2"; // played-cell stock: a hair warmer than --md-white
const CHAMP_WASH = "#FBF0C8"; // champion cell wash (press-yellow at ~12%)
const HAIRLINE = "var(--md-paper-3)"; // played-cell border / dashed + dotted gridlines
const NUM_MUTED = "var(--md-ink-muted)"; // small date numerals on a played (light) cell
const NUM_FAINT = "#C2B8A4"; // missed-cell "—" and its date
const NUM_DOTTED = "#CFC6B3"; // future-cell date (lightest)
const DARK_DIVIDER = "var(--md-ink-line)"; // hairlines inside the ink box-score strip
const DARK_LABEL = "var(--md-cream-muted)"; // muted labels on the ink strip (AA-safe on dark)
const WORST_RED = "var(--md-coral-deep)"; // flame-deep — marks the worst day

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

// A 5-pointed star (TOP 10% stamp, TITLES would-be) and a 5-point crown (CHAMPION),
// drawn on a 24×24 viewBox so they scale from an 8px mobile glyph to the desktop
// strip cleanly.
function StarPath({ fill }: { fill: string }) {
  return <path d="M12 2l2.6 6.5L21 9l-5 4.3L17.6 20 12 16.2 6.4 20 8 13.3 3 9l6.4-.5L12 2z" fill={fill} />;
}
function CrownPath({ fill }: { fill: string }) {
  return <path d="M3 6l4.5 4 4.5-6 4.5 6 4.5-4-2 12H5L3 6z" fill={fill} />;
}

/** Box-score summary line over the rolling window, computed from the same results
 *  map the cells use — no extra data source. Net-derived stats only; we never invent
 *  a field the API doesn't return. */
type Summary = {
  played: number;
  total: number;
  bestDay: number | null;
  worstDay: number | null;
  avgNet: number | null;
  streak: number;
  titles: number;
};

function summarize(results: Record<string, DayEntry>): Summary {
  const window = recentDailyDates(); // newest-first, includes today
  const total = window.length;
  let played = 0;
  let titles = 0;
  let best: number | null = null;
  let worst: number | null = null;
  let sum = 0;
  let nets = 0;
  let streak = 0;
  let streakLive = true; // count consecutive played days from most-recent backward
  for (const d of window) {
    const r = results[d];
    if (!r) {
      streakLive = false;
      continue;
    }
    played++;
    if (r.champion) titles++;
    if (streakLive) streak++;
    if (r.margin != null) {
      const m = Math.round(r.margin);
      best = best == null ? m : Math.max(best, m);
      worst = worst == null ? m : Math.min(worst, m);
      sum += r.margin;
      nets++;
    }
  }
  return {
    played,
    total,
    bestDay: best,
    worstDay: worst,
    avgNet: nets > 0 ? sum / nets : null,
    streak,
    titles,
  };
}

/** A net rating with an explicit sign and a fixed decimal (for AVG NET, e.g. "+8.4").
 *  Whole nets keep the golf-score shape ("+13", "-17", "0") via fmtNet. */
function fmtAvg(n: number): string {
  const r = Math.round(n * 10) / 10;
  const s = r.toFixed(1);
  return r > 0 ? `+${s}` : s;
}

/** One column of the black SEASON AT A GLANCE strip. Figures render in neutral
 *  cream mono (House Rule — spot color never touches the numbers); the worst-day
 *  column is the one label-backed flame-deep figure, and TITLES is the single
 *  press-yellow hero cell (crown-backed). The right border is the dark hairline
 *  between columns (the last column omits it). */
function StatCell({
  label,
  labelFull,
  children,
  labelAccent,
  border = true,
}: {
  /** Short label for the narrow mobile strip (e.g. "BEST"). */
  label: string;
  /** Fuller label for the roomy desktop strip (e.g. "BEST DAY"); falls back to `label`. */
  labelFull?: string;
  children: React.ReactNode;
  labelAccent?: boolean;
  border?: boolean;
}) {
  return (
    <div
      className="flex grow basis-0 flex-col items-center gap-1.5 px-2 py-3.5 sm:items-start sm:gap-2.5 sm:px-5 sm:py-5"
      style={border ? { borderRight: `1px solid ${DARK_DIVIDER}` } : undefined}
    >
      <span
        className="font-cond text-[8px] font-semibold uppercase tracking-[0.12em] sm:text-[11px] sm:tracking-[0.16em]"
        style={{ color: labelAccent ? "var(--md-yellow)" : DARK_LABEL }}
      >
        <span className="sm:hidden">{label}</span>
        <span className="hidden sm:inline">{labelFull ?? label}</span>
      </span>
      {children}
    </div>
  );
}

function StatValue({ value, color }: { value: string; color: string }) {
  return (
    <span
      className="font-mono text-[17px] font-bold leading-none tabular-nums sm:text-[28px]"
      style={{ color }}
    >
      {value}
    </span>
  );
}

/** An off-angle sticker stamp that overlaps the cell's top-left corner. CHAMPION =
 *  tilted press-yellow stamp + crown (riso-magenta misregistration shadow), tilted
 *  one way; TOP 10% = smaller flame stamp + star, tilted the other. The parent cell
 *  uses overflow-visible so the stamp can hang past the edge without covering the
 *  centred net (which lives behind it on its own row). */
function Stamp({ kind }: { kind: "champion" | "top10" }) {
  if (kind === "champion") {
    // Press-yellow misregistration stamp (magenta+ink double shadow via <Stamp
    // shadow="double">); tilt clamped from -11° into the -4°..+5° range.
    return (
      <PressStamp
        background="var(--md-yellow)"
        color="var(--md-ink)"
        shadow="double"
        tilt={false}
        className="pointer-events-none absolute -left-2.5 -top-3 origin-top-left gap-1 px-1.5 py-0.5 sm:-left-3.5 sm:-top-4 sm:gap-1.5 sm:px-2.5 sm:py-1"
        style={{ transform: "rotate(-4deg)" }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" className="sm:h-[15px] sm:w-[15px]" style={{ flexShrink: 0 }}>
          <CrownPath fill="var(--md-ink)" />
        </svg>
        <span className="font-marker text-[9px] leading-none text-[var(--md-ink)] sm:text-[17px]">CHAMP</span>
      </PressStamp>
    );
  }
  // Smaller flame stamp, single hard ink offset (no misregistration); tilt clamped
  // from 8° to the +5° ceiling.
  return (
    <PressStamp
      background="var(--md-coral)"
      color="var(--md-white)"
      shadow="sm"
      tilt={false}
      className="pointer-events-none absolute -left-2 -top-2.5 origin-top-left gap-0.5 px-1 py-0.5 sm:-left-2.5 sm:-top-3 sm:gap-1 sm:px-2.5 sm:py-1"
      style={{ transform: "rotate(5deg)", boxShadow: "var(--md-ink) 4px 4px 0" }}
    >
      <svg width="8" height="8" viewBox="0 0 24 24" className="sm:h-[11px] sm:w-[11px]" style={{ flexShrink: 0 }}>
        <StarPath fill="var(--md-white)" />
      </svg>
      <span className="font-marker text-[8px] leading-none text-[var(--md-white)] sm:text-[13px]">TOP 10%</span>
    </PressStamp>
  );
}

/** The Daily archive's 30-day tray, revealed by the 7-day strip's "View all" toggle
 *  (`open` is parent-controlled). A clean cream scorecard — one cell per day, the net
 *  rating as a bold Space Mono numeral (black if up, flame if down, muted at 0).
 *  CHAMPION / TOP-10% days get an off-angle sticker stamp and the champion cell a
 *  press-yellow wash; missed days dash out, future days dot out, today wears a flame
 *  ring. A "SEASON AT A GLANCE" box-score strip totals the window. The click still
 *  routes through onPlay → playDaily, so the server stays the gate even if this map
 *  is stale.
 *
 *  NOTE on per-cell rank ("#N"): the results map carries only {wins, losses, margin,
 *  perfect, champion, top10} per day — there is no historical per-day rank (the API's
 *  todayRank is today-only and not threaded here, by design: it moves as others
 *  finish). So the small "#N" the mock shows in each cell's bottom-right is omitted
 *  rather than fabricated. */
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
  const summary = useMemo(() => summarize(results), [results]);

  if (!open) return null;

  return (
    <div className="mt-5 w-full text-left">
      {/* Header: red eyebrow, heavy Anton headline + tilted flame slab, marker scrawl */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2.5 sm:gap-4">
          <span className="font-cond text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--md-coral)] sm:text-[13px] sm:tracking-[0.16em]">
            Daily Challenge · Archive
          </span>
          <div className="flex items-center gap-3 sm:gap-4.5">
            <span className="font-cover pt-0.5 text-[36px] leading-[0.95] tracking-[0.01em] text-[var(--md-ink)] sm:pt-1 sm:text-[50px]">
              LAST 30 DAYS
            </span>
            <span
              className="h-6 w-11 shrink-0 sm:h-8 sm:w-16"
              style={{ background: "var(--md-coral)", boxShadow: "var(--md-shadow-sm)" }}
            />
          </div>
        </div>
        <div className="flex flex-col items-start gap-1.5 pb-0.5 sm:items-end">
          <span className="font-marker text-[16px] leading-[1.1] text-[var(--md-coral)] sm:text-[21px]" style={{ rotate: "-3deg" }}>
            one month, one streak.
          </span>
          <span className="hidden font-byline text-[13px] tracking-[0.02em] text-[var(--md-ink-muted)] sm:block">
            every draft, logged &amp; graded
          </span>
        </div>
      </div>

      {/* SEASON AT A GLANCE — black box-score strip */}
      <div className="mt-5 flex w-full flex-col bg-[var(--md-ink)]">
        <div
          className="flex items-center justify-between px-3.5 pb-2.5 pt-3 sm:px-5 sm:pb-3 sm:pt-3"
          style={{ borderBottom: `1px solid ${DARK_DIVIDER}` }}
        >
          <span className="font-cond text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--md-yellow)] sm:text-[13px] sm:tracking-[0.18em]">
            Season at a glance
          </span>
          <span className="font-mono text-[9px] font-bold tracking-[0.04em] text-[var(--md-ink-muted)] sm:text-[11px]">
            <span className="hidden sm:inline">Last 30 · </span>{summary.played} played
          </span>
        </div>
        <div className="flex w-full">
          <StatCell label="Best" labelFull="Best Day">
            <StatValue value={summary.bestDay != null ? fmtNet(summary.bestDay) : "—"} color="var(--md-paper)" />
          </StatCell>
          <StatCell label="Worst" labelFull="Worst Day">
            <StatValue value={summary.worstDay != null ? fmtNet(summary.worstDay) : "—"} color={WORST_RED} />
          </StatCell>
          <StatCell label="Avg" labelFull="Avg Net">
            <StatValue value={summary.avgNet != null ? fmtAvg(summary.avgNet) : "—"} color="var(--md-paper)" />
          </StatCell>
          <StatCell label="Streak" labelFull="Current Streak">
            <span className="flex items-baseline gap-1 sm:gap-1.5">
              <StatValue value={String(summary.streak)} color="var(--md-paper)" />
              <span className="hidden font-cond text-xs font-semibold uppercase tracking-[0.14em] text-[var(--md-ink-muted)] sm:inline">
                Days
              </span>
            </span>
          </StatCell>
          <StatCell label="Titles" labelAccent border={false}>
            <span className="flex items-center gap-1 sm:gap-2">
              <svg width="13" height="13" viewBox="0 0 24 24" className="sm:h-[22px] sm:w-[22px]" style={{ flexShrink: 0 }}>
                <CrownPath fill="var(--md-yellow)" />
              </svg>
              <StatValue value={String(summary.titles)} color="var(--md-yellow)" />
            </span>
          </StatCell>
        </div>
      </div>

      {/* Weekday header */}
      <div className="mt-4 flex w-full gap-1.5 sm:mt-5 sm:gap-2.5">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="grow basis-0 text-center font-cond text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--md-ink-muted)] sm:text-xs"
          >
            {w}
          </div>
        ))}
      </div>

      {/* 30-day calendar */}
      <div className="mt-1.5 grid grid-cols-7 gap-1.5 sm:mt-2.5 sm:gap-2.5">
        {cells.map((c) => {
          const r = results[c.iso];
          const st = dayState(c.iso, today, r, c.inWindow);
          const interactive = st !== "future" && st !== "out";
          const isFuture = st === "future" || st === "out";
          const isMissed = st === "missed";
          const isToday = st === "today";
          const isChampion = st === "champion";
          const isTop10 = st === "top10";

          // Net colour: flame if down, muted if zero, ink if up.
          let netColor = "var(--md-ink)";
          if (r?.margin != null) {
            const m = Math.round(r.margin);
            if (m < 0) netColor = "var(--md-coral)";
            else if (m === 0) netColor = NUM_MUTED;
          }
          const net = r ? fmtNet(r.margin) : "";

          // Border / fill per state. Played + standout cells take the ink hairline;
          // missed dashes, future dots, today gets a 2px flame inset ring.
          let bg = CELL_FILL;
          let border = `1.5px solid ${HAIRLINE}`;
          let boxShadow: string | undefined;
          if (isChampion) bg = CHAMP_WASH;
          if (isMissed) border = `1.5px dashed ${HAIRLINE}`;
          if (isFuture) border = `1.5px dotted ${HAIRLINE}`;
          if (st === "played" || isChampion || isTop10) border = `1.5px solid var(--md-ink)`;
          if (isToday) {
            border = "none";
            boxShadow = "var(--md-coral) 0 0 0 2px inset";
          }

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
                    : isToday
                      ? "Play today’s challenge"
                      : "Play this day"
                  : undefined
              }
              className="relative flex h-13 grow basis-0 items-center justify-center overflow-visible transition-transform enabled:hover:-translate-y-0.5 disabled:cursor-default sm:h-22"
              style={{ background: isFuture ? "transparent" : bg, border, boxShadow }}
            >
              {/* TODAY label, top-left (above the centred net) */}
              {isToday && (
                <span className="absolute left-1.5 top-1 font-cond text-[7px] font-semibold uppercase tracking-[0.16em] text-[var(--md-coral)] sm:left-2.5 sm:top-2.25 sm:text-[10px]">
                  Today
                </span>
              )}

              {/* Date, top-right */}
              <span
                className="absolute right-1.5 top-1 font-mono text-[8px] font-bold tabular-nums sm:right-2.5 sm:top-2 sm:text-[11px]"
                style={{ color: isFuture ? NUM_DOTTED : isMissed ? NUM_FAINT : NUM_MUTED }}
              >
                {c.day}
              </span>

              {/* Net rating, centred. Missed = faint dash; future = empty. */}
              {r ? (
                <span
                  className="font-mono text-[15px] font-bold leading-none tabular-nums tracking-[0.01em] sm:text-[26px]"
                  style={{ color: netColor }}
                >
                  {net}
                </span>
              ) : isMissed ? (
                <span className="font-mono text-[15px] font-bold leading-none sm:text-[26px]" style={{ color: NUM_FAINT }}>
                  —
                </span>
              ) : null}

              {/* Off-angle achievement stamp (overlaps the corner, never the numeral) */}
              {isChampion && <Stamp kind="champion" />}
              {isTop10 && <Stamp kind="top10" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
