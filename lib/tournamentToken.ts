// Signed roll receipts — lightweight, stateless provenance for the tournament.
//
// Only /api/slot issues receipts, and it binds the receipt to the TEAM it rolled
// — crucially, /api/slot hands out a RANDOM team you can't choose, so a valid
// team receipt is real proof the server rolled that team to you. The receipt is
// deliberately NOT bound to the decade: the decade-skip keeps the SAME team (and
// reuses its receipt), and /api/team-decades issues nothing — otherwise a caller
// could mint a receipt for any team it names, bypassing the random roll.
//
// /api/tournament/submit verifies every pick's receipt against its team. This
// blocks POSTing arbitrary teams straight to the tournament — each must have been
// randomly rolled. (A script can still re-roll until it sees good teams; closing
// that needs state/rate limits, beyond the intended vibe. No logins required.)
//
// Server-only (node:crypto). The secret is shared by /api/slot and the verifying
// route — both run server-side with the same env.

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

/** Issue a receipt for a server roll of `team`: `<issuedAt>.<hmac>`. */
export function signRoll(team: string): string {
  const issuedAt = Date.now();
  return `${issuedAt}.${hmac(`${issuedAt}.${team}`)}`;
}

/** True iff `receipt` is a valid, unexpired signature for exactly `team`. */
export function verifyRoll(receipt: unknown, team: string): boolean {
  if (typeof receipt !== "string") return false;
  const dot = receipt.indexOf(".");
  if (dot <= 0) return false;
  const issuedAt = Number(receipt.slice(0, dot));
  const sig = receipt.slice(dot + 1);
  if (!Number.isFinite(issuedAt)) return false;
  const now = Date.now();
  if (now - issuedAt > TTL_MS) return false; // expired
  if (issuedAt - now > 60_000) return false; // future-dated (clock-skew guard)
  const expected = hmac(`${issuedAt}.${team}`);
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
