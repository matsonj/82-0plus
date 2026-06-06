// The daily challenge resets at midnight Pacific (America/Los_Angeles, DST-aware).
// Both the server seed and the client lock/countdown derive "today" from here so
// everyone gets the same five rolls for the same Pacific calendar day.

const PACIFIC_TZ = "America/Los_Angeles";

/** Pacific calendar date as "YYYY-MM-DD" (en-CA formats ISO-style). */
export function pacificDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PACIFIC_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** How many past days (including today) the Daily archive is playable. */
export const DAILY_HISTORY_DAYS = 30;

/** The last `n` Pacific calendar dates, newest first (index 0 = today). Calendar
 *  dates are DST-agnostic, so plain UTC date arithmetic off today's Pacific date
 *  is correct across month/year boundaries. */
export function recentDailyDates(
  n: number = DAILY_HISTORY_DAYS,
  now: Date = new Date(),
): string[] {
  const [y, m, d] = pacificDate(now).split("-").map(Number);
  const base = Date.UTC(y, m - 1, d);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const dt = new Date(base - i * 86_400_000);
    const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(dt.getUTCDate()).padStart(2, "0");
    out.push(`${dt.getUTCFullYear()}-${mm}-${dd}`);
  }
  return out;
}

/** True iff `date` (YYYY-MM-DD) is a playable Daily: within the last
 *  DAILY_HISTORY_DAYS Pacific days and not in the future. */
export function isPlayableDailyDate(
  date: string,
  n: number = DAILY_HISTORY_DAYS,
  now: Date = new Date(),
): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) && recentDailyDates(n, now).includes(date)
  );
}

/** Milliseconds until the next Pacific midnight (when the daily rolls over). */
export function msUntilPacificMidnight(d: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const hour = get("hour") % 24; // some environments render midnight as "24"
  const elapsed = hour * 3600 + get("minute") * 60 + get("second");
  return (86400 - elapsed) * 1000;
}
