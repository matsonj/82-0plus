import { NextResponse } from "next/server";

// Public JSON responses that are safe to cache at the edge. Use this ONLY for
// deterministic, shared (non-personalized) GET success responses — never for
// errors, anything that mints a receipt, or anything that sets a cookie.
//
// Two layered windows:
//   - Vercel-CDN-Cache-Control drives the Vercel edge specifically (it takes
//     precedence over CDN-Cache-Control and Cache-Control there, and Vercel
//     strips it before the response reaches the browser). 10-min fresh + 1-day
//     stale-while-revalidate: the edge always answers instantly and refreshes in
//     the background, so a rebuilt app-cache snapshot propagates within ~10 min
//     instead of being pinned behind a day-long entry.
//   - Cache-Control: public, max-age=60 is the conservative fallback for the
//     browser and any intermediary that doesn't understand the Vercel header.
//
// Crucially this helper sets NO cookie: Vercel will not cache a response that
// carries Set-Cookie, so routing a response through here is what keeps it
// cacheable in the first place. (Contrast lib/sessionHint.ts, which sets the
// read-pool affinity cookie and must stay uncached.)
const PUBLIC_CACHE_HEADERS: Record<string, string> = {
  "Cache-Control": "public, max-age=60",
  "Vercel-CDN-Cache-Control": "max-age=600, stale-while-revalidate=86400",
};

export function jsonPublicCacheable(
  body: unknown,
  init?: ResponseInit,
): NextResponse {
  const res = NextResponse.json(body, init);
  for (const [name, value] of Object.entries(PUBLIC_CACHE_HEADERS)) {
    res.headers.set(name, value);
  }
  return res;
}
