// Canonical public origin. Prefer the configured URL in deploys, fall back to the
// production domain.
//
// The fallback must survive a GARBAGE value, not just a missing one, because
// `app/layout.tsx` feeds SITE_URL straight to `new URL()` for metadataBase — and
// that runs at page-data collection, so a bad value fails the BUILD (not a
// request). `NEXT_PUBLIC_SITE_URL` is marked Sensitive/Encrypted in Vercel, and
// what `vercel pull` writes for a Sensitive var has changed over time:
//   • Vercel CLI ≤ 54 wrote an EMPTY string      → caught by a plain `||`
//   • Vercel CLI ≥ 57 writes the literal `[SENSITIVE]` → NOT empty, so `||` let it
//     through and `new URL("[SENSITIVE]")` threw ERR_INVALID_URL, breaking the
//     production build in CI (which installs `vercel@latest`).
// So we don't pattern-match either sentinel: we PARSE the value and fall back
// unless it is a real absolute http(s) origin. Any future placeholder is covered.
const FALLBACK_SITE_URL = "https://daily82.com";

/** The configured origin if it's a usable absolute http(s) URL, else the
 *  production domain. Exported for tests; prefer the SITE_URL constant. */
export function resolveSiteUrl(raw: string | undefined): string {
  const trimmed = raw?.trim();
  if (!trimmed) return FALLBACK_SITE_URL;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return FALLBACK_SITE_URL; // "[SENSITIVE]", a bare host, any non-URL
  }
  // Reject a well-formed but unusable scheme (file:, data:, …) — metadataBase and
  // every share link need an http(s) origin.
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return FALLBACK_SITE_URL;
  }
  return trimmed;
}

export const SITE_URL = resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);

// MotherDuck homepage, UTM-tagged so referrals from this app are attributable.
export const MOTHERDUCK_URL = "https://motherduck.com/?utm_source=82-0plus";

// PlanetScale homepage, same UTM tag — the transactional store runs on PlanetScale.
export const PLANETSCALE_URL = "https://planetscale.com/?utm_source=82-0plus";
