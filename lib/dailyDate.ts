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
