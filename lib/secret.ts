import "server-only";

// Single source of truth for the app's HMAC signing secret (roll receipts +
// daily share tokens). It is DELIBERATELY decoupled from the database tokens:
// signing must not be backed by a high-privilege credential (that would turn the
// app into a signing oracle for the RW token). An explicit TOURNAMENT_SECRET is
// REQUIRED everywhere except NODE_ENV === "development" or "test", which fall
// back to a fixed placeholder for local-dev convenience.
//
// This is intentionally an allowlist (only "development"/"test" opt in to the
// fallback), not a denylist on "production": self-hosted/non-Vercel deploys
// frequently run with NODE_ENV unset or set to something else entirely, and a
// denylist would silently let those environments sign with a value that's
// committed to the repo (forgeable roll receipts + daily share tokens).
//
// `server-only` lives here (not just on the token modules) so the invariant
// travels with the secret boundary itself: a future client module that imports
// getTournamentSecret() directly still trips Next's build-time guard.
//
// Resolve at call time (not module load) so a missing secret fails the
// individual request cleanly rather than crashing the cold start.

const DEV_FALLBACK = "82-0plus-dev-secret";
const DEV_FALLBACK_ENVS = new Set(["development", "test"]);

export function getTournamentSecret(): string {
  const secret = process.env.TOURNAMENT_SECRET;
  if (secret) return secret;
  if (DEV_FALLBACK_ENVS.has(process.env.NODE_ENV ?? "")) {
    return DEV_FALLBACK;
  }
  throw new Error(
    'TOURNAMENT_SECRET is required outside NODE_ENV=development/test (no DB-token fallback, no implicit "production" allowlist).',
  );
}

/**
 * Throw NOW if signing isn't configured. Routes that MUTATE before they sign
 * (e.g. /api/daily/complete persists the canonical row, then mints a share token)
 * call this before the write so a misconfigured deploy fails closed — it never
 * persists a result it then can't return a token for.
 */
export function assertTournamentSecret(): void {
  getTournamentSecret();
}
