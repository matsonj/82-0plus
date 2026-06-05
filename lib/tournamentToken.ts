// Signed roll receipts — lightweight, stateless provenance for the tournament.
//
// Every server-issued roll (/api/slot, and the decade-skip via /api/team-decades)
// returns a `receipt`: an HMAC over the (team, decade) it handed out plus an
// issue time. The client keeps the receipt with the drafted player, and
// /api/tournament/submit verifies every pick's receipt matches its team+decade
// and is recent. This blocks the trivial exploit — POSTing five arbitrary
// team/decade picks straight to the tournament — because each combo must have
// actually been rolled by the server. (A determined script can still re-roll
// until it sees good teams; fully closing that needs state/rate limits, which is
// beyond the intended vibe. No logins required.)
//
// Server-only (node:crypto). The secret is shared by the issuing routes and the
// verifying route — all run server-side with the same env.

import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET =
  process.env.TOURNAMENT_SECRET ||
  process.env.MOTHERDUCK_RW_TOKEN ||
  process.env.MOTHERDUCK_TOKEN ||
  "82-0plus-dev-secret";

// How long a roll stays redeemable — generous, to cover a full draft + entry.
const TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function hmac(data: string): string {
  return createHmac("sha256", SECRET).update(data).digest("hex");
}

/** Issue a receipt for a server roll of (team, decade): `<issuedAt>.<hmac>`. */
export function signRoll(team: string, decade: number): string {
  const issuedAt = Date.now();
  return `${issuedAt}.${hmac(`${issuedAt}.${team}:${decade}`)}`;
}

/** True iff `receipt` is a valid, unexpired signature for exactly (team, decade). */
export function verifyRoll(
  receipt: unknown,
  team: string,
  decade: number,
): boolean {
  if (typeof receipt !== "string") return false;
  const dot = receipt.indexOf(".");
  if (dot <= 0) return false;
  const issuedAt = Number(receipt.slice(0, dot));
  const sig = receipt.slice(dot + 1);
  if (!Number.isFinite(issuedAt)) return false;
  const now = Date.now();
  if (now - issuedAt > TTL_MS) return false; // expired
  if (issuedAt - now > 60_000) return false; // future-dated (clock-skew guard)
  const expected = hmac(`${issuedAt}.${team}:${decade}`);
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
