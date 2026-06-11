// Canonical public origin. Prefer the Vercel-provided URL in deploys, fall back
// to the production domain (and localhost in dev is fine for relative links).
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://daily82.com";

// MotherDuck homepage, UTM-tagged so referrals from this app are attributable.
export const MOTHERDUCK_URL = "https://motherduck.com/?utm_source=82-0plus";
