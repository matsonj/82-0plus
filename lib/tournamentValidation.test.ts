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
    expect(normalizeName("  mj23  ")).toBe("MJ23");
    expect(normalizeName("ballers")).toBe("BALLERS");
  });
});

describe("NAME_ALLOWED charset", () => {
  it("accepts uppercase, digits and the number-row shift symbols", () => {
    expect(NAME_ALLOWED.test("MJ23")).toBe(true);
    expect(NAME_ALLOWED.test("!@#$%^&*")).toBe(true); // all 8 shift-symbols
    expect(NAME_ALLOWED.test("GOAT")).toBe(true);
    expect(NAME_ALLOWED.test("$$$")).toBe(true);
    expect(NAME_ALLOWED.test("mj23")).toBe(false); // raw regex rejects lowercase
  });
});

describe("validateName — charset", () => {
  it("allowed names pass", () => {
    expect(validateName("MJ23")).toEqual({ ok: true });
    expect(validateName("GOAT")).toEqual({ ok: true });
    expect(validateName("$WISH$")).toEqual({ ok: true });
    expect(validateName("&*()")).toEqual({ ok: true });
  });

  it("is case-insensitive on input (normalizes first)", () => {
    expect(validateName("mj23")).toEqual({ ok: true });
    expect(validateName("  baller ")).toEqual({ ok: true });
  });

  it("rejects lowercase, space, emoji and stray punctuation", () => {
    // After normalize, lowercase is uppercased — so to truly test "lowercase
    // rejected" we use a char with no uppercase form is not possible; instead
    // test chars that survive uppercasing and are illegal.
    expect(validateName("MJ 23").ok).toBe(false); // space
    expect(validateName("MJ-23").ok).toBe(false); // hyphen
    expect(validateName("MJ.23").ok).toBe(false); // dot
    expect(validateName("MJ+23").ok).toBe(false); // plus
    expect(validateName("MJ😀").ok).toBe(false); // emoji
    expect(validateName("MJ_23").ok).toBe(false); // underscore
  });

  it("the illegal-charset failure carries the friendly reason", () => {
    const r = validateName("MJ-23");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("!@#$%^&*()");
  });
});

describe("validateName — length bounds", () => {
  it("empty fails", () => {
    const r = validateName("   ");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("enter a name");
  });

  it("8 chars ok, 9 chars too long", () => {
    expect(validateName("ABCD1234")).toEqual({ ok: true }); // 8
    const r = validateName("ABCD12345"); // 9
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
  it("rejects profane names (raw and leet) with the friendly reason", () => {
    for (const bad of ["CRAP", "CR@P", "CR4P", "$HIT"]) {
      const r = validateName(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toContain("another name");
    }
  });

  it("clean names pass end-to-end", () => {
    expect(validateName("HOOPS")).toEqual({ ok: true });
    expect(validateName("BALLER")).toEqual({ ok: true });
  });
});
