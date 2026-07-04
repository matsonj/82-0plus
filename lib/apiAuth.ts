import type { NextRequest, NextResponse } from "next/server";
import { authenticate, type AuthOptions } from "./dailyResults";
import { jsonWithSessionHint, type SessionHint } from "./sessionHint";
import {
  attemptKeys,
  checkThrottle,
  recordFailure,
  recordSuccess,
  type ThrottleDecision,
} from "./authRateLimit";
import { pgThrottleStore } from "./authThrottleStore";

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

// ── Trusted client IP ────────────────────────────────────────────────────────
//
// Next 16 removed `request.ip`; on Vercel the docs point to `@vercel/functions`
// `ipAddress()`, which reads the platform-set `x-real-ip` header. We read that
// header directly (no extra dependency) and trust ONLY it:
//   • `x-real-ip` is set by Vercel's edge to the real connecting client address
//     and OVERWRITES any client-supplied value, so it can't be spoofed.
//   • We deliberately do NOT read `x-forwarded-for`: Vercel appends the real IP to
//     the RIGHT of any hops a client prepends, so its leftmost value is
//     attacker-controlled — trusting it would allow throttle bypass (rotate a fake
//     leftmost IP) and victim-IP forgery (frame someone else's IP).
// The value is validated as a real IPv4/IPv6 literal before use; anything else is
// treated as "unknown" (null), which degrades to name-only throttling.

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function isIpLiteral(v: string): boolean {
  const m = IPV4_RE.exec(v);
  if (m) return m.slice(1).every((o) => Number(o) <= 255);
  // IPv6: hex groups + colons only (loose, but rejects junk / injected separators).
  return v.length <= 45 && v.includes(":") && /^[0-9a-fA-F:.]+$/.test(v);
}

export function clientIp(req: NextRequest): string | null {
  const raw = req.headers.get("x-real-ip")?.trim();
  if (!raw) return null;
  return isIpLiteral(raw) ? raw.toLowerCase() : null;
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

// ── Best-effort throttle for the PUBLIC (create-free) name+PIN lookup routes ──
//
// These routes read through the RO pool and must NOT run schema DDL (review
// P2#4), so they use the narrow pgThrottleStore writer (no ensureSchema) and
// these wrappers FAIL OPEN: a not-yet-provisioned auth_throttle table or a
// transient DB blip degrades to "no throttle for this request" rather than 500ing
// a public read. In steady state the table is always present (authenticated
// traffic provisions it via ensureSchema), so this window is negligible.

/** Gate keys + the subject key(s) to clear on a public-lookup success. */
export function publicAttemptKeys(subject: string, ip: string | null) {
  return attemptKeys(subject, ip);
}

/** Pre-attempt gate for a public lookup; fails open on any store error. */
export async function publicThrottleCheck(gateKeys: string[]): Promise<ThrottleDecision> {
  try {
    return await checkThrottle(pgThrottleStore, gateKeys);
  } catch (err) {
    console.warn("[throttle] public check failed open:", err);
    return { allowed: true, retryAfterMs: 0 };
  }
}

/** Record a public-lookup miss; never throws. */
export async function publicThrottleFail(gateKeys: string[]): Promise<void> {
  try {
    await recordFailure(pgThrottleStore, gateKeys);
  } catch (err) {
    console.warn("[throttle] public failure record failed open:", err);
  }
}

/** Reset the subject after a public-lookup hit; never throws. */
export async function publicThrottleSuccess(subjectKeys: string[]): Promise<void> {
  try {
    await recordSuccess(pgThrottleStore, subjectKeys);
  } catch (err) {
    console.warn("[throttle] public success reset failed open:", err);
  }
}
