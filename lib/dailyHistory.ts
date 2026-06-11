// Shared state + colour language for the Daily history views (the 7-day strip and
// the 30-day archive grid), so both read as one system.
//
// Visual model is a Masters-style scorecard: understated cells with black numerals
// (the day's net rating is the "score"), and achievement shown by an annotation ring
// — a single circle for an 82-0 perfect season, a double circle for a champion —
// rather than a loud fill. Played days carry a soft teal wash that black sits on top
// of cleanly.

import { recentDailyDates, DAILY_HISTORY_DAYS } from "@/lib/dailyDate";

const DAY = 86_400_000;

export type DayEntry = {
  wins: number;
  losses: number;
  /** Net rating (the team's "score"). */
  margin?: number;
  /** Went 82-0. */
  perfect?: boolean;
  /** Won the day's tournament bracket. */
  champion?: boolean;
};

export type DayState =
  | "played"
  | "perfect"
  | "champion"
  | "missed"
  | "today"
  | "future"
  | "out";

export function dayState(
  date: string,
  today: string,
  entry: DayEntry | undefined,
  inWindow: boolean,
): DayState {
  if (date > today) return "future";
  if (!inWindow) return "out";
  // Any finished day is just "played" — you never lose a daily, you post a record
  // out of 82 and rank against the field. The score (net) says how you did; the
  // circle/double-circle flags the standout days.
  if (entry) {
    if (entry.champion) return "champion";
    if (entry.perfect) return "perfect";
    return "played";
  }
  return date === today ? "today" : "missed";
}

/** The day's net rating, formatted like a golf score: "+11", "0", "-4". */
export function fmtNet(margin: number | undefined): string {
  if (margin == null) return "";
  const r = Math.round(margin);
  return r > 0 ? `+${r}` : `${r}`;
}

export type Annotate = "none" | "single" | "double";

export type CellStyle = {
  bg: string;
  border: string;
  /** Colour for the centred net-rating score. */
  text: string;
  /** Colour for the small day-number in the corner. */
  day: string;
  /** Ring drawn around the score: a perfect 82-0 (single) or a champion (double). */
  annotate: Annotate;
};

// Played days take the sky blue from the Private Tournament button (opaque, so it
// sits cleanly over the strip's chain line and black numerals stay legible). Plain
// white for missed, faint dashed for out-of-window. Gridlines are paper-3, like a
// printed scorecard; "today" is the only other accent (yellow border).
export const PLAYED_FILL = "var(--md-sky)"; // #6fc2ff
const GRID = "#E1D6CB"; // --md-paper-3
const FAINT = "#B8AB9C";
const DASH = "#C9BCAE";

export function cellStyle(state: DayState): CellStyle {
  switch (state) {
    case "played":
      return { bg: PLAYED_FILL, border: `2px solid ${GRID}`, text: "var(--md-ink)", day: "var(--md-ink-muted)", annotate: "none" };
    case "perfect":
      return { bg: PLAYED_FILL, border: `2px solid ${GRID}`, text: "var(--md-ink)", day: "var(--md-ink-muted)", annotate: "single" };
    case "champion":
      return { bg: PLAYED_FILL, border: `2px solid ${GRID}`, text: "var(--md-ink)", day: "var(--md-ink-muted)", annotate: "double" };
    case "missed":
      return { bg: "var(--md-white)", border: `2px solid ${GRID}`, text: FAINT, day: "var(--md-ink-muted)", annotate: "none" };
    case "today":
      return { bg: "var(--md-white)", border: "3px solid var(--md-yellow)", text: "var(--md-ink)", day: "var(--md-ink)", annotate: "none" };
    default: // future | out
      return { bg: "var(--md-paper)", border: `2px dashed ${DASH}`, text: FAINT, day: FAINT, annotate: "none" };
  }
}

export type HistoryCell = { iso: string; day: number; inWindow: boolean };

const toMs = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, dd);
};
const isoOf = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

/** A Sun→Sat grid spanning the last `days` (rolling window ending today). Leading
 *  cells (older than the window) and trailing cells (future) are real dates marked
 *  out-of-window, so the grid always reads as clean, full weeks. */
export function historyGrid(
  today: string,
  days: number = DAILY_HISTORY_DAYS,
): HistoryCell[] {
  const window = recentDailyDates(days); // newest-first, includes today
  const set = new Set(window);
  const oldestMs = toMs(window[window.length - 1]);
  const startMs = oldestMs - new Date(oldestMs).getUTCDay() * DAY;
  const todayMs = toMs(today);
  const endMs = todayMs + (6 - new Date(todayMs).getUTCDay()) * DAY;

  const cells: HistoryCell[] = [];
  for (let ms = startMs; ms <= endMs; ms += DAY) {
    const iso = isoOf(ms);
    cells.push({ iso, day: new Date(ms).getUTCDate(), inWindow: set.has(iso) });
  }
  return cells;
}
