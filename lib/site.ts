// Canonical public origin. Prefer the configured URL in deploys, fall back to the
// production domain. Use `|| ` (not `??`) and trim so an EMPTY/whitespace value
// also falls back — `vercel pull` returns a Sensitive `NEXT_PUBLIC_SITE_URL` as ""
// in CI, and `new URL("")` (via layout's metadataBase) would crash the build.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://daily82.com";

// MotherDuck homepage, UTM-tagged so referrals from this app are attributable.
export const MOTHERDUCK_URL = "https://motherduck.com/?utm_source=82-0plus";

// PlanetScale homepage, same UTM tag — the transactional store runs on PlanetScale.
export const PLANETSCALE_URL = "https://planetscale.com/?utm_source=82-0plus";
