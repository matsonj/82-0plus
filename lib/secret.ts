// Single source of truth for the app's HMAC signing secret (roll receipts +
// daily share tokens). It is DELIBERATELY decoupled from the database tokens:
// signing must not be backed by a high-privilege credential (that would turn the
// app into a signing oracle for the RW token). Production REQUIRES an explicit
// TOURNAMENT_SECRET; only dev/test fall back to a fixed placeholder.
//
// Resolve at call time (not module load) so a missing prod secret fails the
// individual request cleanly rather than crashing the cold start.

const DEV_FALLBACK = "82-0plus-dev-secret";

export function getTournamentSecret(): string {
  const secret = process.env.TOURNAMENT_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "TOURNAMENT_SECRET is required in production (no DB-token fallback).",
    );
  }
  return DEV_FALLBACK;
}
