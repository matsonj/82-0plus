// Suggests a fun default team name from a username: "<OWNER>'S <NOUN>", where
// NOUN is a short, group-flavored word alliterating with the owner's first
// letter (J → JOKERS → "JMONEY'S JOKERS"). The player can always override it.
//
// Pure + dependency-light (only the shared validator) so it runs identically in
// the form and is unit-testable. Output always satisfies validateTeamName: the
// possessive is used only when it fits the 16-char team-name cap; otherwise we
// fall back to the bare noun, then to a neutral default. (We keep the 16-char
// limit rather than widen it, so long handles degrade gracefully.)

import { validateTeamName } from "./tournamentValidation";

// One short, group-ish noun per letter — a "bunch of things" vibe (a CREW, a
// POSSE, a QUINTET). Kept clean (no profanity substrings) and apostrophe-free.
const GROUP_NOUNS: Record<string, string> = {
  A: "ACES",
  B: "BALLERS",
  C: "CREW",
  D: "DUNKERS",
  E: "ELITE",
  F: "FORCE",
  G: "GANG",
  H: "HOOPERS",
  I: "ICONS",
  J: "JOKERS",
  K: "KINGS",
  L: "LEGENDS",
  M: "MOB",
  N: "NATION",
  O: "OUTLAWS",
  P: "POSSE",
  Q: "QUINTET",
  R: "RAIDERS",
  S: "SQUAD",
  T: "TITANS",
  U: "UNION",
  V: "VIPERS",
  W: "WRECKERS",
  X: "XPRESS",
  Y: "YETIS",
  Z: "ZOO",
};

const FALLBACK = "DREAM TEAM";

/**
 * A default team name derived from `username`. Returns a value that always
 * passes validateTeamName. Never throws.
 */
export function suggestTeamName(username: string): string {
  // First whitespace-delimited token, letters only (drop digits/symbols), upper.
  const firstToken = username.trim().toUpperCase().split(/\s+/)[0] ?? "";
  const owner = firstToken.replace(/[^A-Z]/g, "");

  if (owner) {
    const noun = GROUP_NOUNS[owner[0]];
    const possessive = `${owner}'S ${noun}`;
    if (validateTeamName(possessive).ok) return possessive;
    // Long handle → the bare alliterative noun still fits and stays on-theme.
    if (validateTeamName(noun).ok) return noun;
  }
  // No usable owner letters → a neutral default.
  return FALLBACK;
}
