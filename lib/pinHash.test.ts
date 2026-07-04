import { describe, it, expect } from "vitest";
import { scryptSync } from "node:crypto";
import { hashPin, verifyPin } from "./pinHash";

describe("pinHash", () => {
  it("verifies a PIN against its own fresh hash", () => {
    const { pinHash, pinSalt } = hashPin("1234");
    expect(verifyPin("1234", pinHash, pinSalt)).toBe(true);
  });

  it("rejects the wrong PIN", () => {
    const { pinHash, pinSalt } = hashPin("1234");
    expect(verifyPin("9999", pinHash, pinSalt)).toBe(false);
  });

  it("uses a per-call random salt (same PIN → different hashes)", () => {
    const a = hashPin("1234");
    const b = hashPin("1234");
    expect(a.pinSalt).not.toBe(b.pinSalt);
    expect(a.pinHash).not.toBe(b.pinHash);
    // …but each still verifies against its own salt.
    expect(verifyPin("1234", a.pinHash, a.pinSalt)).toBe(true);
    expect(verifyPin("1234", b.pinHash, b.pinSalt)).toBe(true);
  });

  it("does not throw on a length-mismatched stored hash (returns false)", () => {
    const { pinSalt } = hashPin("1234");
    // A truncated hex hash decodes to a shorter buffer than the derived key; the
    // length guard must make this a clean `false`, never a timingSafeEqual throw.
    expect(verifyPin("1234", "abcd", pinSalt)).toBe(false);
  });

  it("verifies hashes produced with the historical recipe (scrypt, 32-byte key)", () => {
    // Guards the consolidation: verifyPin must accept hashes stored before it
    // existed. This is the exact scryptSync(pin, salt, 32) recipe the call sites
    // used inline, reproduced independently.
    const salt = "deadbeefdeadbeefdeadbeefdeadbeef";
    const legacyHash = scryptSync("4321", salt, 32).toString("hex");
    expect(verifyPin("4321", legacyHash, salt)).toBe(true);
    expect(verifyPin("0000", legacyHash, salt)).toBe(false);
  });
});
