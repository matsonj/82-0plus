import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { isUuidStrict } from "./uuid";

const COOKIE_NAME = "md820_session_hint";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export interface SessionHint {
  value: string;
  isNew: boolean;
}

export function getSessionHint(req: NextRequest): SessionHint {
  const existing = req.cookies.get(COOKIE_NAME)?.value;
  // Use the STRICT check here (version + variant nibble constrained), not the
  // loose isUuid() used elsewhere: this value came back from the client in a
  // cookie, so it's untrusted input we're about to trust as a session
  // identifier. See lib/uuid.ts for why the two checks intentionally differ.
  if (existing && isUuidStrict(existing)) {
    return { value: existing, isNew: false };
  }
  return { value: randomUUID(), isNew: true };
}

export function jsonWithSessionHint(
  sessionHint: SessionHint,
  body: unknown,
  init?: ResponseInit,
): NextResponse {
  const res = NextResponse.json(body, init);
  if (sessionHint.isNew) {
    res.cookies.set(COOKIE_NAME, sessionHint.value, {
      httpOnly: true,
      maxAge: COOKIE_MAX_AGE,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }
  return res;
}
