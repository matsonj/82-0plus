import { describe, it, expect } from "vitest";
import {
  NAME_ALLOWED,
  normalizeName,
  validateName,
  validatePin,
  isProfane,
} from "./tournamentValidation";

describe("normalizeName", () => {
  it("trims and uppercases", () => {
    expect(normalizeName("  dreamteam  ")).toBe("DREAMTEAM");
    expect(normalizeName("ballers")).toBe("BALLERS");
  });
});

describe("NAME_ALLOWED charset", () => {
  it("accepts uppercase letters A–Z only", () => {
    expect(NAME_ALLOWED.test("DREAMTEAM")).toBe(true);
    expect(NAME_ALLOWED.test("GOAT")).toBe(true);
    expect(NAME_ALLOWED.test("ABCDEFGHIJKLMNOP")).toBe(true); // 16
    expect(NAME_ALLOWED.test("MJ23")).toBe(false); // digits rejected
    expect(NAME_ALLOWED.test("!@#$%^&*")).toBe(false); // symbols rejected
    expect(NAME_ALLOWED.test("mj")).toBe(false); // raw regex rejects lowercase
  });
});

describe("validateName — charset", () => {
  it("allowed names pass", () => {
    expect(validateName("DREAMTEAM")).toEqual({ ok: true });
    expect(validateName("GOAT")).toEqual({ ok: true });
    expect(validateName("BALLERS")).toEqual({ ok: true });
  });

  it("is case-insensitive on input (normalizes first)", () => {
    expect(validateName("dreamteam")).toEqual({ ok: true });
    expect(validateName("  baller ")).toEqual({ ok: true });
  });

  it("rejects digits, space, emoji and stray punctuation", () => {
    expect(validateName("MJ23").ok).toBe(false); // digits
    expect(validateName("DREAM TEAM").ok).toBe(false); // space
    expect(validateName("MJ-23").ok).toBe(false); // hyphen
    expect(validateName("MJ.23").ok).toBe(false); // dot
    expect(validateName("MJ+23").ok).toBe(false); // plus
    expect(validateName("GOAT😀").ok).toBe(false); // emoji
    expect(validateName("DREAM_TEAM").ok).toBe(false); // underscore
    expect(validateName("$WISH$").ok).toBe(false); // symbols
  });

  it("the illegal-charset failure carries the friendly reason", () => {
    const r = validateName("MJ23");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("letters A–Z only");
  });
});

describe("validateName — length bounds", () => {
  it("empty fails", () => {
    const r = validateName("   ");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("enter a name");
  });

  it("16 chars ok, 17 chars too long", () => {
    expect(validateName("ABCDEFGHIJKLMNOP")).toEqual({ ok: true }); // 16
    const r = validateName("ABCDEFGHIJKLMNOPQ"); // 17
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("too long");
  });
});

describe("validatePin", () => {
  it("4 to 6 digits pass", () => {
    expect(validatePin("1234")).toBe(true);
    expect(validatePin("12345")).toBe(true);
    expect(validatePin("123456")).toBe(true);
  });

  it("too short / too long fail", () => {
    expect(validatePin("123")).toBe(false);
    expect(validatePin("1234567")).toBe(false);
  });

  it("non-numeric fails", () => {
    expect(validatePin("12ab")).toBe(false);
    expect(validatePin("12 34")).toBe(false);
    expect(validatePin("")).toBe(false);
  });
});

describe("isProfane", () => {
  it("catches a denylisted word directly", () => {
    expect(isProfane("CRAP")).toBe(true);
    expect(isProfane("XCRAPX")).toBe(true); // substring
  });

  it("catches leet/symbol bypasses", () => {
    expect(isProfane("CR@P")).toBe(true); // @ → A
    expect(isProfane("CR4P")).toBe(true); // 4 → A
    expect(isProfane("$HIT")).toBe(true); // $ → S
    expect(isProfane("5HIT")).toBe(true); // 5 → S
    expect(isProfane("A$$")).toBe(true); // $$ → SS ⇒ ASS
  });

  it("clean names are not flagged", () => {
    expect(isProfane("MJ23")).toBe(false);
    expect(isProfane("GOAT")).toBe(false);
    expect(isProfane("HOOPS")).toBe(false);
  });
});

describe("validateName — profanity", () => {
  it("rejects letters-only profane names with the friendly reason", () => {
    for (const bad of ["CRAP", "XCRAPX", "SHIT", "ASS"]) {
      const r = validateName(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toContain("another name");
    }
  });

  it("leet/symbol profanity is rejected (on charset, before the filter)", () => {
    // Symbols/digits are no longer allowed, so these fail the charset gate. The
    // isProfane suite separately confirms the leet-fold still catches them.
    for (const bad of ["CR@P", "CR4P", "$HIT"]) {
      expect(validateName(bad).ok).toBe(false);
    }
  });

  it("clean names pass end-to-end", () => {
    expect(validateName("HOOPS")).toEqual({ ok: true });
    expect(validateName("BALLER")).toEqual({ ok: true });
  });
});
