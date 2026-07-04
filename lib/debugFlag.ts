import "server-only";

// Shared gate for the tournament API routes' verbose "include the full scoring
// breakdown" debug mode. NEXT_PUBLIC_DEBUG is a build-time public env var, so
// requiring it ALONE is not safe: a production build accidentally shipped with
// NEXT_PUBLIC_DEBUG=1 baked in would leak per-game scoring internals to every
// caller. Require NODE_ENV to also be explicitly non-production, so debug
// output can never ship in a production build regardless of how
// NEXT_PUBLIC_DEBUG got set.
//
// IMPORTANT: keep this the single place that reads NEXT_PUBLIC_DEBUG for
// server-side response shaping — do not re-derive the flag inline in routes.
export function isDebugEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_DEBUG === "1" &&
    process.env.NODE_ENV !== "production"
  );
}
