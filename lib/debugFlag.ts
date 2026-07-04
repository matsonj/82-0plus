import "server-only";

// Shared gate for the tournament API routes' verbose "include the full scoring
// breakdown" debug mode. NEXT_PUBLIC_DEBUG is a build-time public env var, so
// requiring it ALONE is not safe: a production build accidentally shipped with
// NEXT_PUBLIC_DEBUG=1 baked in would leak per-game scoring internals to every
// caller.
//
// This is an ALLOWLIST on NODE_ENV (only "development"/"test" opt in), NOT a
// denylist on "production" — mirroring getTournamentSecret in lib/secret.ts. A
// denylist fails OPEN for NODE_ENV unset or "staging" (self-hosted/non-Vercel
// builds), which would leak the breakdown exactly where it's least expected.
//
// IMPORTANT: keep this the single place that reads NEXT_PUBLIC_DEBUG for
// server-side response shaping — do not re-derive the flag inline in routes.
const DEBUG_ALLOWED_ENVS = new Set(["development", "test"]);

export function isDebugEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_DEBUG === "1" &&
    DEBUG_ALLOWED_ENVS.has(process.env.NODE_ENV ?? "")
  );
}
