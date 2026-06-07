import { describe, it, expect } from "vitest";
import { paceAdj, leaguePace, REF_PACE } from "./pace";

describe("paceAdj", () => {
  it("is ~1.0 at the reference season (2010 pace == REF_PACE)", () => {
    expect(leaguePace(2010)).toBe(REF_PACE);
    expect(paceAdj(2010)).toBeCloseTo(1, 5);
  });

  it("pulls high-pace eras DOWN so they fit (Wilt's 1962)", () => {
    // 1962 pace 131.3 ≫ reference → possessions scaled well below 1.
    expect(paceAdj(1962)).toBeLessThan(0.85);
    expect(paceAdj(1962)).toBeGreaterThan(0.78 - 1e-9); // respects the clamp floor
  });

  it("modern seasons stay near 1.0", () => {
    expect(paceAdj(2005)).toBeGreaterThan(0.95);
    expect(paceAdj(2015)).toBeGreaterThan(0.95);
    expect(paceAdj(2015)).toBeLessThanOrEqual(1.0 + 1e-9);
  });

  it("clamps out-of-range / unknown seasons gracefully", () => {
    expect(paceAdj(1900)).toBeGreaterThan(0); // pre-coverage snaps to earliest
    expect(paceAdj(3000)).toBeGreaterThan(0); // future snaps to latest
    expect(paceAdj(0)).toBe(1);
    expect(paceAdj(NaN)).toBe(1);
  });
});
