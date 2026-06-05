// Tournament identity is a NAME + PIN — no accounts, no email. This module is the
// single source of truth for what a legal name/PIN looks like, and it is PURE on
// purpose: it imports nothing Node-only (no `next`, `pg`, `crypto`, `fs`) so the
// exact same checks run in the React client (instant form feedback) AND in the
// route handler (the real gate). Plain TS + regex + constant data only.
//
// Style mirrors lib/positions.ts: small exported functions, heavy comments.

// ── Names ────────────────────────────────────────────────────────────────────

// Allowed characters are ONLY: uppercase A–Z, digits 0–9, and the shift-symbols
// of the number row 1–0, i.e. ! @ # $ % ^ & * ( ). Nothing else — no lowercase,
// no spaces, no emoji, no other punctuation. Length 1–8.
//
// (The symbols are listed explicitly rather than via a range so the intent is
// obvious and we don't accidentally let in neighbours like `+ - = [ ]`.)
export const NAME_ALLOWED = /^[A-Z0-9!@#$%^&*()]{1,8}$/;

export const NAME_MAX_LEN = 8;

/**
 * Canonical storage form of a name: trim surrounding whitespace, then UPPERCASE.
 * The form can be case-insensitive on input ("mj23" === "MJ23"); callers persist
 * this normalized value as `name_norm` and dedupe / look up against it.
 */
export function normalizeName(s: string): string {
  return s.trim().toUpperCase();
}

/** Friendly result type — a reason string is only present on failure. */
export type ValidationResult = { ok: true } | { ok: false; reason: string };

/**
 * Validate a display name. Normalizes first, then checks (in order):
 *   1. non-empty,
 *   2. length ≤ 8,
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
    return { ok: false, reason: "too long — 8 characters max" };
  }
  if (!NAME_ALLOWED.test(name)) {
    return { ok: false, reason: "only A–Z, 0–9 and !@#$%^&*() allowed" };
  }
  if (isProfane(name)) {
    return { ok: false, reason: "please choose another name" };
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
