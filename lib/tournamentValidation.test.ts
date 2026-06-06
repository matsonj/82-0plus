import { describe, it, expect } from "vitest";
import {
  NAME_ALLOWED,
  normalizeName,
  validateName,
  validateTeamName,
  normalizeTeamName,
  validatePin,
  isProfane,
} from "./tournamentValidation";

describe("validateTeamName — allows spaces & apostrophes", () => {
  it("accepts letters, spaces and apostrophes", () => {
    expect(validateTeamName("MJ'S CREW").ok).toBe(true);
    expect(validateTeamName("THE DREAM TEAM").ok).toBe(true);
    expect(validateTeamName("showtime").ok).toBe(true); // normalized to upper
  });
  it("folds curly apostrophes and collapses whitespace", () => {
    expect(normalizeTeamName("  mj’s   crew ")).toBe("MJ'S CREW");
  });
  it("rejects digits and other symbols", () => {
    expect(validateTeamName("MJ23").ok).toBe(false);
    expect(validateTeamName("CREW!").ok).toBe(false);
    expect(validateTeamName("A-TEAM").ok).toBe(false);
  });
  it("must start with a letter and fit 16 chars", () => {
    expect(validateTeamName("'CREW").ok).toBe(false); // leading apostrophe
    expect(validateTeamName(" CREW").ok).toBe(true); // leading space trimmed
    expect(validateTeamName("A".repeat(17)).ok).toBe(false);
  });
  it("still rejects profanity", () => {
    expect(validateTeamName("SHIT KICKERS").ok).toBe(false);
  });
});

describe("normalizeName", () => {
  it("trims and uppercases", () => {
    expect(normalizeName("  dreamteam  ")).toBe("DREAMTEAM");
    expect(normalizeName("ballers")).toBe("BALLERS");
  });
});

describe("NAME_ALLOWED charset", () => {
  it("accepts uppercase letters, digits and spaces", () => {
    expect(NAME_ALLOWED.test("DREAMTEAM")).toBe(true);
    expect(NAME_ALLOWED.test("MJ23")).toBe(true); // digits allowed
    expect(NAME_ALLOWED.test("PHIL JACKSON")).toBe(true); // spaces allowed
    expect(NAME_ALLOWED.test("ABCDEFGHIJKLMNOP")).toBe(true); // 16
    expect(NAME_ALLOWED.test("!@#$%^&*")).toBe(false); // symbols rejected
    expect(NAME_ALLOWED.test("mj")).toBe(false); // raw regex rejects lowercase
  });
});

describe("validateName — charset", () => {
  it("allowed names pass (letters, digits, spaces)", () => {
    expect(validateName("DREAMTEAM")).toEqual({ ok: true });
    expect(validateName("MJ23")).toEqual({ ok: true });
    expect(validateName("PHIL JACKSON 11")).toEqual({ ok: true });
  });

  it("is case- and spacing-insensitive on input (normalizes first)", () => {
    expect(validateName("dreamteam")).toEqual({ ok: true });
    expect(validateName("  phil   jackson ")).toEqual({ ok: true });
  });

  it("rejects emoji and stray punctuation", () => {
    expect(validateName("MJ-23").ok).toBe(false); // hyphen
    expect(validateName("MJ.23").ok).toBe(false); // dot
    expect(validateName("MJ+23").ok).toBe(false); // plus
    expect(validateName("GOAT😀").ok).toBe(false); // emoji
    expect(validateName("DREAM_TEAM").ok).toBe(false); // underscore
    expect(validateName("$WISH$").ok).toBe(false); // symbols
    expect(validateName("MJ'S").ok).toBe(false); // apostrophe (team names only)
  });

  it("the illegal-charset failure carries the friendly reason", () => {
    const r = validateName("MJ_23");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("letters, numbers and spaces");
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

  it("leet/symbol profanity is rejected", () => {
    // Symbol leet (CR@P, $HIT) fails the charset gate; digit leet (CR4P) passes
    // charset now that digits are allowed, but the leet-fold catches it as profane.
    for (const bad of ["CR@P", "CR4P", "$HIT"]) {
      expect(validateName(bad).ok).toBe(false);
    }
  });

  it("clean names pass end-to-end", () => {
    expect(validateName("HOOPS")).toEqual({ ok: true });
    expect(validateName("BALLER")).toEqual({ ok: true });
  });
});
