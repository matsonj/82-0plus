import type { NextRequest, NextResponse } from "next/server";
import { authenticate, type AuthOptions } from "./dailyResults";
import { jsonWithSessionHint, type SessionHint } from "./sessionHint";

// Shared credential gate for the authenticated daily / private-tournament routes.
// Every one of those routes previously copy-pasted the same three lines:
//
//   const auth = await authenticate(name, pin);
//   if (!auth.ok) return jsonWithSessionHint(sessionHint, { error: auth.reason }, { status: 401 });
//
// requireAuth() folds that boilerplate into one call AND wires the per-request
// client IP into the throttle (#107), so adopting it is what actually opts a route
// into per-IP rate limiting. Behavior on the happy path and on a bad-credential
// 401 is unchanged; the only new response is a 429 when the shared limiter locks
// an account/IP out (auth.retryAfterMs set).

/**
 * Best-effort client IP for the per-IP throttle key. Next.js dropped
 * `request.ip`; on Vercel the real client address is the FIRST hop in
 * `x-forwarded-for` (Vercel appends the proxy chain), with `x-real-ip` as a
 * fallback. Returns null when neither header is present (the throttle then keys on
 * the account name only) — a null IP is never used as a shared bucket.
 */
export function clientIp(req: NextRequest): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip")?.trim();
  return real || null;
}

export type AuthSuccess = {
  ok: true;
  userId: string;
  name: string;
  nameNorm: string;
};

/**
 * Authenticate (name, PIN) for an API route, threading the client IP into the
 * throttle. Returns the resolved account on success, or a ready-to-return
 * NextResponse on failure:
 *   • 429 (with Retry-After) when the shared limiter has locked the account/IP;
 *   • 401 otherwise (bad shape / wrong PIN) — same status + body as before.
 *
 * Usage:
 *   const auth = await requireAuth(req, sessionHint, body?.name, body?.pin);
 *   if (!auth.ok) return auth.response;
 *   // …use auth.userId / auth.name…
 */
export async function requireAuth(
  req: NextRequest,
  sessionHint: SessionHint,
  rawName: unknown,
  rawPin: unknown,
  extra: Omit<AuthOptions, "ip"> = {},
): Promise<AuthSuccess | { ok: false; response: NextResponse }> {
  const auth = await authenticate(String(rawName ?? ""), String(rawPin ?? ""), {
    ip: clientIp(req),
    ...extra,
  });
  if (auth.ok) {
    return { ok: true, userId: auth.userId, name: auth.name, nameNorm: auth.nameNorm };
  }
  if (auth.retryAfterMs != null) {
    return {
      ok: false,
      response: jsonWithSessionHint(
        sessionHint,
        { error: auth.reason },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(auth.retryAfterMs / 1000)) },
        },
      ),
    };
  }
  return {
    ok: false,
    response: jsonWithSessionHint(sessionHint, { error: auth.reason }, { status: 401 }),
  };
}
