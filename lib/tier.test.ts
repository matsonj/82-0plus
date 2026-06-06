import { describe, expect, it } from "vitest";
import {
  MIN_ELIGIBLE_WINS,
  regWinsFromSeedNet,
  tierForSeedNet,
  tierForWins,
  isEligible,
} from "./tier";

describe("regWinsFromSeedNet", () => {
  it("matches the 41 + 2.7·net projection, clamped to [0, 82]", () => {
    expect(regWinsFromSeedNet(0)).toBe(41);
    expect(regWinsFromSeedNet(15.2)).toBe(82); // ~the 82-0 threshold
    expect(regWinsFromSeedNet(100)).toBe(82); // clamp high
    expect(regWinsFromSeedNet(-100)).toBe(0); // clamp low
  });
});

describe("tierForWins — band boundaries", () => {
  const cases: [number, string | null][] = [
    [82, "S"],
    [81, "AA"],
    [80, "AA"],
    [79, "A"],
    [70, "A"],
    [69, "B"],
    [60, "B"],
    [59, "C"],
    [50, "C"],
    [49, "D"],
    [40, "D"],
    [39, null], // ineligible
    [0, null],
  ];
  it.each(cases)("%i wins → %s", (wins, key) => {
    expect(tierForWins(wins)?.key ?? null).toBe(key);
  });
});

describe("eligibility", () => {
  it("MIN_ELIGIBLE_WINS is the D floor (40)", () => {
    expect(MIN_ELIGIBLE_WINS).toBe(40);
  });

  it("isEligible tracks the 40-win floor", () => {
    // 40 wins ⇔ round(41 + 2.7·net) ≥ 40 ⇔ net ≥ ~-0.55
    expect(isEligible(0)).toBe(true);
    expect(isEligible(-0.3)).toBe(true); // → 40 wins
    expect(isEligible(-1)).toBe(false); // → 38 wins
  });

  it("tierForSeedNet returns null below the floor", () => {
    expect(tierForSeedNet(-1)).toBeNull();
    expect(tierForSeedNet(20)?.key).toBe("S");
  });
});
