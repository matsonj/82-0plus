// Split a full player name into { first, last } for the "last name in bold,
// first name as a subtitle" displays (THE FIVE, the draft roster). Trailing
// generational suffixes (Jr / Sr / II–V) are kept WITH the surname, so
// "Trey Murphy III" → { first: "Trey", last: "Murphy III" } instead of showing
// "III" as the last name.
const NAME_SUFFIXES = new Set([
  "jr", "jr.", "sr", "sr.", "ii", "iii", "iv", "v",
]);

export function splitPlayerName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first: "", last: full };

  let lastIdx = parts.length - 1;
  let suffix = "";
  if (NAME_SUFFIXES.has(parts[lastIdx].toLowerCase())) {
    suffix = parts[lastIdx];
    lastIdx -= 1;
  }
  // Degenerate "First Suffix" with no surname token — fall back to the full name.
  if (lastIdx < 0) return { first: "", last: full };

  const last = suffix ? `${parts[lastIdx]} ${suffix}` : parts[lastIdx];
  const first = parts.slice(0, lastIdx).join(" ");
  return { first, last };
}
