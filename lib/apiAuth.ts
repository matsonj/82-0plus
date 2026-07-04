import { isIP } from "node:net";
import type { NextRequest, NextResponse } from "next/server";
import { authenticate, type AuthOptions } from "./dailyResults";
import { jsonWithSessionHint, type SessionHint } from "./sessionHint";
import {
  attemptKeys,
  guardAttempt,
  recordFailure,
  recordSuccess,
  type AttemptKeys,
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
// The value is validated with node's net.isIP() (a real IPv4/IPv6 literal) before
// use; anything else is treated as "unknown" (null), which degrades to per-name
// (delay-only) throttling.
//
// IMPORTANT (best-effort, not a security boundary): even x-real-ip should be
// treated as best-effort defense-in-depth — the per-IP layer is NOT the sole
// brake. If a deployment's IP header were spoofable, the failure mode degrades to
// the per-name escalating-delay + scrypt brakes (bounded per-account guessing),
// not an unbounded bypass. See lib/authRateLimit and the PR notes; adopting
// @vercel/functions `ipAddress()` is the recommended follow-up if we want the
// per-IP layer treated as authoritative.

export function clientIp(req: NextRequest): string | null {
  const raw = req.headers.get("x-real-ip")?.trim();
  if (!raw) return null;
  return isIP(raw) !== 0 ? raw.toLowerCase() : null;
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

/** Layered attempt keys for a public lookup (see attemptKeys). */
export function publicAttemptKeys(subject: string, ip: string | null): AttemptKeys {
  return attemptKeys(subject, ip);
}

/** Pre-attempt gate (hard-lock + escalating name delay) for a public lookup;
 *  fails open on any store error (public route must never 500 on a throttle blip). */
export async function publicGuardAttempt(keys: AttemptKeys): Promise<ThrottleDecision> {
  try {
    return await guardAttempt(pgThrottleStore, keys);
  } catch (err) {
    console.warn("[throttle] public gate failed open:", err);
    return { allowed: true, retryAfterMs: 0 };
  }
}

/** Record a public-lookup miss against all fail keys; never throws. */
export async function publicThrottleFail(failKeys: string[]): Promise<void> {
  try {
    await recordFailure(pgThrottleStore, failKeys);
  } catch (err) {
    console.warn("[throttle] public failure record failed open:", err);
  }
}

/** Reset the subject keys after a public-lookup hit; never throws. */
export async function publicThrottleSuccess(subjectKeys: string[]): Promise<void> {
  try {
    await recordSuccess(pgThrottleStore, subjectKeys);
  } catch (err) {
    console.warn("[throttle] public success reset failed open:", err);
  }
}
