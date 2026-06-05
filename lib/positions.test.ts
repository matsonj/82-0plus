import { describe, it, expect } from "vitest";
import { positionRank } from "./positions";

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
