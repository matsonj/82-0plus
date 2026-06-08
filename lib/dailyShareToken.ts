import { createHmac, timingSafeEqual } from "node:crypto";

// A signed, tamper-proof token for a daily share link. The sharer's record is
// minted SERVER-SIDE from their stored daily_results row, so a recipient page can
// trust it without re-auth — and a hand-edited link can't forge a fake record
// (no secret → no valid signature). Server-only (node:crypto).

const SECRET =
  process.env.TOURNAMENT_SECRET ||
  process.env.MOTHERDUCK_RW_TOKEN ||
  process.env.MOTHERDUCK_TOKEN ||
  "82-0plus-dev-secret";

export interface DailyShare {
  d: string; // date YYYY-MM-DD
  u: string; // sharer name
  w: number; // wins
  l: number; // losses
  n: number; // projected scoring margin (one decimal)
  p: boolean; // perfect
}

function b64url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string): string {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}
const sig = (body: string) =>
  createHmac("sha256", SECRET).update(body).digest("hex").slice(0, 24);

export function signDailyShare(p: DailyShare): string {
  const body = b64url(
    JSON.stringify([p.d, p.u, p.w, p.l, Math.round(p.n * 10), p.p ? 1 : 0]),
  );
  return `${body}.${sig(body)}`;
}

export function verifyDailyShare(token: unknown): DailyShare | null {
  if (typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const got = token.slice(dot + 1);
  const want = sig(body);
  if (got.length !== want.length) return null;
  if (!timingSafeEqual(Buffer.from(got), Buffer.from(want))) return null;
  try {
    const a = JSON.parse(fromB64url(body)) as [string, string, number, number, number, number];
    return {
      d: String(a[0]), u: String(a[1]),
      w: Number(a[2]), l: Number(a[3]), n: Number(a[4]) / 10, p: a[5] === 1,
    };
  } catch {
    return null;
  }
}
