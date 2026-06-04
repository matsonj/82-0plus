import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "md820_session_hint";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface SessionHint {
  value: string;
  isNew: boolean;
}

export function getSessionHint(req: NextRequest): SessionHint {
  const existing = req.cookies.get(COOKIE_NAME)?.value;
  if (existing && UUID_RE.test(existing)) {
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
