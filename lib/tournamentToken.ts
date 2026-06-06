// Signed roll receipts — lightweight, stateless provenance for the tournament.
//
// /api/slot issues receipts bound to the (TEAM, DECADE) it rolled — and it hands
// out a RANDOM team you can't choose, so a valid receipt is real proof the server
// rolled that team+decade to you. Binding the decade (not just the team) means a
// receipt rolled for one era can't be paired with a different era's player on
// submit. The decade-skip doesn't mint from nothing: /api/team-decades EXCHANGES
// a valid (team, oldDecade) receipt for fresh (team, newDecade) receipts (only
// for eras that team actually has), so you can still skip eras but only for a
// team you genuinely rolled — a caller can't name an arbitrary team+decade.
//
// /api/tournament/submit verifies every pick's receipt against its (team, decade).
// This blocks POSTing arbitrary team/era/player combos — each must have been
// randomly rolled (or decade-skipped from a real roll). (A script can still
// re-roll until it sees good teams; closing that needs state/rate limits, beyond
// the intended vibe. No logins required.)
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

/** Issue a receipt for a server roll of `team` in `decade`: `<issuedAt>.<hmac>`.
 *  The receipt is bound to BOTH team AND decade — a receipt rolled for one decade
 *  can't be paired with a different decade's player on submit (the decade-skip
 *  EXCHANGES it for a new-decade receipt; see /api/team-decades). */
export function signRoll(team: string, decade: number): string {
  const issuedAt = Date.now();
  return `${issuedAt}.${hmac(`${issuedAt}.${team}.${decade}`)}`;
}

/** True iff `receipt` is a valid, unexpired signature for exactly `(team, decade)`. */
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
  const expected = hmac(`${issuedAt}.${team}.${decade}`);
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
