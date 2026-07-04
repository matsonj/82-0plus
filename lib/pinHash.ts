import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

// The single canonical PIN crypto for the arcade (name + PIN) auth. Every
// credential path — account auth (lib/dailyResults), the public tournament
// lookup, the private-tournament name+PIN lookup, and the create-time PIN
// collision check — verifies through verifyPin() so the scrypt + per-row-salt +
// constant-time-compare recipe lives in exactly ONE place. Previously each site
// re-implemented the same scryptSync/Buffer/timingSafeEqual dance, which is both
// a duplication hazard and a place a subtle timing bug could slip in.

// scrypt work parameters. 32-byte derived key with the library defaults; the salt
// is per-row (16 random bytes, hex-encoded) so two accounts with the same PIN get
// different hashes. Kept identical to the values every call site used before this
// consolidation so existing stored hashes keep verifying.
const KEYLEN = 32;

/**
 * Constant-time verify a plaintext PIN against a stored (hash, salt) pair.
 * timingSafeEqual throws on length-mismatched buffers, so the length is guarded
 * first (a mismatch is simply "no match", never an exception).
 */
export function verifyPin(
  pin: string,
  pinHash: string,
  pinSalt: string,
): boolean {
  const candidate = scryptSync(pin, pinSalt, KEYLEN);
  const stored = Buffer.from(pinHash, "hex");
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

/** Hash a fresh PIN with a new random salt (for account / tournament creation). */
export function hashPin(pin: string): { pinHash: string; pinSalt: string } {
  const pinSalt = randomBytes(16).toString("hex");
  const pinHash = scryptSync(pin, pinSalt, KEYLEN).toString("hex");
  return { pinHash, pinSalt };
}
