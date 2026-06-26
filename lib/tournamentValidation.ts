// Tournament identity is a NAME + PIN — no accounts, no email. This module is the
// single source of truth for what a legal name/PIN looks like, and it is PURE on
// purpose: it imports nothing Node-only (no `next`, `pg`, `crypto`, `fs`) so the
// exact same checks run in the React client (instant form feedback) AND in the
// route handler (the real gate). Plain TS + regex + constant data only.
//
// Style mirrors lib/positions.ts: small exported functions, heavy comments.

// ── Names ────────────────────────────────────────────────────────────────────

// The USERNAME (account handle) allows uppercase A–Z, digits, and spaces — e.g.
// "PHIL JACKSON 11". No other symbols or emoji. Length 1–16. (Team names are
// looser still — they also allow apostrophes; see validateTeamName.)
export const NAME_ALLOWED = /^[A-Z0-9 ]{1,16}$/;

export const NAME_MAX_LEN = 16;

/**
 * Canonical storage form of a username: trim, UPPERCASE, and collapse internal
 * whitespace runs to a single space ("phil  jackson" === "PHIL JACKSON"). Callers
 * persist this as `name_norm` and dedupe / look up against it (case- and
 * spacing-insensitive).
 */
export function normalizeName(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, " ");
}

/** Friendly result type — a reason string is only present on failure. */
export type ValidationResult = { ok: true } | { ok: false; reason: string };

/**
 * Validate a display name. Normalizes first, then checks (in order):
 *   1. non-empty,
 *   2. length ≤ 16,
 *   3. matches the allowed charset,
 *   4. is not profane (best-effort, see isProfane).
 * Returns a short, player-facing `reason` on the first failure.
 */
export function validateName(s: string): ValidationResult {
  const name = normalizeName(s);

  if (name.length === 0) {
    return { ok: false, reason: "please enter a name" };
  }
  if (name.length > NAME_MAX_LEN) {
    return { ok: false, reason: "too long — 16 characters max" };
  }
  if (!NAME_ALLOWED.test(name)) {
    return {
      ok: false,
      reason: "letters, numbers and spaces only — no symbols",
    };
  }
  if (isProfane(name)) {
    return { ok: false, reason: "please choose another name" };
  }
  return { ok: true };
}

// A private TOURNAMENT name is the same charset as a username but roomier — up to
// 24 chars (e.g. "FRIDAY NIGHT HOOPS CUP"). It is NOT an account handle, so the
// tighter 16-char login limit doesn't apply.
export const TOURNAMENT_NAME_MAX_LEN = 24;

/** Charset without the length bound (length is checked separately per context). */
const NAME_CHARSET = /^[A-Z0-9 ]+$/;

/**
 * Validate a private-tournament name. Same normalization + charset + profanity
 * rule as a username, but allows up to TOURNAMENT_NAME_MAX_LEN (24) characters.
 */
export function validateTournamentName(s: string): ValidationResult {
  const name = normalizeName(s);

  if (name.length === 0) {
    return { ok: false, reason: "please enter a name" };
  }
  if (name.length > TOURNAMENT_NAME_MAX_LEN) {
    return { ok: false, reason: "too long — 24 characters max" };
  }
  if (!NAME_CHARSET.test(name)) {
    return {
      ok: false,
      reason: "letters, numbers and spaces only — no symbols",
    };
  }
  if (isProfane(name)) {
    return { ok: false, reason: "please choose another name" };
  }
  return { ok: true };
}

// ── Team names ─────────────────────────────────────────────────────────────────

// A team's (franchise) name is more expressive than the login handle: uppercase
// A–Z plus SPACES and APOSTROPHES, e.g. "MJ'S CREW". No digits or other symbols,
// profanity-checked, and it must START with a letter (no leading space/
// apostrophe); curly apostrophes fold to a straight one.
export const TEAM_NAME_ALLOWED = /^[A-Z][A-Z ']*$/;

// Team names get more room than the 16-char login handle (mirrors the private-
// tournament name cap) so a possessive default like "JMONEY'S JOKERS" fits.
export const TEAM_NAME_MAX_LEN = 24;

/**
 * Canonical team-name form: fold curly/back apostrophes to a straight `'`, trim,
 * uppercase, and collapse internal whitespace runs to a single space.
 */
export function normalizeTeamName(s: string): string {
  return s
    .replace(/[’`]/g, "'")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

/** Validate a team (franchise) name — like validateName but allows spaces and
 *  apostrophes. Same length cap and profanity check. */
export function validateTeamName(s: string): ValidationResult {
  const name = normalizeTeamName(s);
  if (name.length === 0) {
    return { ok: false, reason: "please enter a team name" };
  }
  if (name.length > TEAM_NAME_MAX_LEN) {
    return { ok: false, reason: "too long — 24 characters max" };
  }
  if (!TEAM_NAME_ALLOWED.test(name)) {
    return { ok: false, reason: "letters, spaces and apostrophes only" };
  }
  if (isProfane(name)) {
    return { ok: false, reason: "please choose another team name" };
  }
  return { ok: true };
}

// ── PIN ──────────────────────────────────────────────────────────────────────

// A 4-to-6 digit numeric PIN. This is a low-stakes arcade lock, not a password —
// it just keeps a casual player from stomping on someone else's name.
export const PIN_RE = /^\d{4,6}$/;

/** True iff `s` is a 4–6 digit all-numeric PIN. */
export function validatePin(s: string): boolean {
  return PIN_RE.test(s);
}

// ── Profanity (best-effort) ────────────────────────────────────────────────────

// This is a kids-friendly arcade game, so we reject obviously-bad names. This is
// a BEST-EFFORT substring filter, not a guarantee — a determined adult can still
// smuggle something past it, and conversely it may catch an innocent substring
// (the classic "Scunthorpe problem"). It is intentionally short and tasteful:
// only unambiguous English profanities/slurs belong here. Keep it lean.
const DENYLIST: readonly string[] = [
  // common profanities
  "ASS",
  "ASSHOLE",
  "BASTARD",
  "BITCH",
  "BOLLOCKS",
  "BUGGER",
  "CRAP",
  "DAMN",
  "DICK",
  "DOUCHE",
  "FART",
  "FUCK",
  "PISS",
  "PRICK",
  "SHIT",
  "SLUT",
  "TWAT",
  "WANK",
  "WHORE",
  // slurs (kept short; obviously-bad only)
  "COON",
  "FAG",
  "KIKE",
  "NIGGER",
  "NIGGA",
  "RETARD",
  "SPIC",
  "TRANNY",
] as const;

// Leet-fold: collapse the symbol/digit tricks players use to dodge the filter
// back to their letter (`CR@P`, `CR4P` → `CRAP`). Multi-char sequences (`()` → O,
// `|<` style is overkill here) are folded before single chars. Applied to the
// already-normalized (uppercase) name, so we only need uppercase mappings.
const LEET_MULTI: ReadonlyArray<readonly [string, string]> = [
  ["()", "O"], // parens around nothing read as an O
];
const LEET_SINGLE: Record<string, string> = {
  "@": "A",
  "4": "A",
  "$": "S",
  "5": "S",
  "0": "O",
  "1": "I",
  "!": "I",
  "|": "I",
  "3": "E",
  "7": "T",
};

/** Fold leet/symbol substitutions in an (already uppercased) string. */
function leetFold(s: string): string {
  let out = s;
  for (const [from, to] of LEET_MULTI) out = out.split(from).join(to);
  let folded = "";
  for (const ch of out) folded += LEET_SINGLE[ch] ?? ch;
  return folded;
}

/**
 * Best-effort profanity check. Normalizes the input, then looks for any denylist
 * word as a SUBSTRING of either the raw normalized name OR its leet-folded form.
 * Substring (not whole-word) matching is deliberate — names have no spaces, so a
 * banned word is usually embedded ("XFUCKX"). Exported so it's unit-testable.
 */
export function isProfane(s: string): boolean {
  const name = normalizeName(s);
  const folded = leetFold(name);
  return DENYLIST.some((w) => name.includes(w) || folded.includes(w));
}
