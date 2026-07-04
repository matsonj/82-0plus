import { describe, it, expect } from "vitest";
import { ALL_ROLES, positionRank, ROLE_COLOR } from "./positions";

describe("ROLE_COLOR", () => {
  it("gives every role exactly one canonical color — the single source of\n     truth for the browse list, player-card modal, and lineup board chips\n     (issue #105: those three surfaces used to disagree)", () => {
    for (const role of ALL_ROLES) {
      expect(typeof ROLE_COLOR[role]).toBe("string");
      expect(ROLE_COLOR[role]).toMatch(/^var\(--md-[a-z-]+\)$/);
    }
    // No two roles should share a color.
    const values = ALL_ROLES.map((r) => ROLE_COLOR[r]);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("positionRank", () => {
  it("ranks pure and combo positions backcourt → frontcourt", () => {
    expect(positionRank("G")).toBe(1);
    expect(positionRank("G-F")).toBe(2);
    expect(positionRank("F")).toBe(3);
    expect(positionRank("F-C")).toBe(4);
    expect(positionRank("C")).toBe(5);
  });

  it("is order-insensitive for combo tokens", () => {
    expect(positionRank("F-G")).toBe(positionRank("G-F"));
    expect(positionRank("C-F")).toBe(positionRank("F-C"));
  });

  it("is case/whitespace tolerant", () => {
    expect(positionRank(" g-f ")).toBe(2);
  });

  it("falls back to a neutral rank when unknown", () => {
    expect(positionRank(null)).toBe(3);
    expect(positionRank("")).toBe(3);
    expect(positionRank("PG")).toBe(3);
  });

  it("orders a finished roster G → C", () => {
    const roster = [
      { name: "big", pos: "C" },
      { name: "wing", pos: "F" },
      { name: "guard", pos: "G" },
      { name: "stretch", pos: "F-C" },
      { name: "combo", pos: "G-F" },
    ];
    const order = [...roster]
      .sort((a, b) => positionRank(a.pos) - positionRank(b.pos))
      .map((p) => p.name);
    expect(order).toEqual(["guard", "combo", "wing", "stretch", "big"]);
  });
});
