import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getTournamentSecret } from "./secret";

// A signed, tamper-proof token for a daily share link. The sharer's record is
// minted SERVER-SIDE from their stored daily_results row, so a recipient page can
// trust it without re-auth — and a hand-edited link can't forge a fake record
// (no secret → no valid signature). Server-only (node:crypto).

/** The sharer's tournament/bracket run for this daily, if they entered one. */
export interface DailyShareTourn {
  w: number; // bracket record wins
  l: number; // bracket record losses
  n: number; // realized scoring margin (one decimal)
  r: number; // reached round: 0 = lost R1 … 4 = champion
}

export interface DailyShare {
  d: string; // date YYYY-MM-DD
  u: string; // sharer name
  w: number; // wins
  l: number; // losses
  n: number; // projected scoring margin (one decimal)
  p: boolean; // perfect
  t?: DailyShareTourn; // optional: the sharer's tournament run for a head-to-head
}

function b64url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string): string {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}
const sig = (body: string) =>
  createHmac("sha256", getTournamentSecret()).update(body).digest("hex").slice(0, 24);

export function signDailyShare(p: DailyShare): string {
  // Base = the reg-season head-to-head (always present). A tournament run, when
  // the sharer has one, appends 4 more entries — older 6-entry tokens stay valid.
  const arr: (string | number)[] = [p.d, p.u, p.w, p.l, Math.round(p.n * 10), p.p ? 1 : 0];
  if (p.t) {
    arr.push(p.t.w, p.t.l, Math.round(p.t.n * 10), p.t.r);
  }
  const body = b64url(JSON.stringify(arr));
  return `${body}.${sig(body)}`;
}

// `expectedDate` (the route date) binds a token to the daily it was minted for:
// a valid signed token from one day can't be pasted onto another day's URL to
// present a real result as a mismatched head-to-head opponent. A date mismatch is
// treated exactly like an invalid/missing token (returns null).
export function verifyDailyShare(
  token: unknown,
  expectedDate?: string,
): DailyShare | null {
  if (typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const got = token.slice(dot + 1);
  const want = sig(body);
  if (got.length !== want.length) return null;
  if (!timingSafeEqual(Buffer.from(got), Buffer.from(want))) return null;
  try {
    const a = JSON.parse(fromB64url(body)) as (string | number)[];
    const share: DailyShare = {
      d: String(a[0]), u: String(a[1]),
      w: Number(a[2]), l: Number(a[3]), n: Number(a[4]) / 10, p: a[5] === 1,
    };
    // A 10-entry token carries the sharer's tournament run too (see signDailyShare).
    if (a.length >= 10) {
      share.t = { w: Number(a[6]), l: Number(a[7]), n: Number(a[8]) / 10, r: Number(a[9]) };
    }
    // The signed date must equal the date being viewed — otherwise the token is
    // mis-bound (a real record from a different daily).
    if (expectedDate !== undefined && share.d !== expectedDate) return null;
    return share;
  } catch {
    return null;
  }
}
