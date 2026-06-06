import { describe, it, expect } from "vitest";
import { recentDailyDates, isPlayableDailyDate } from "./dailyDate";

// A fixed "now" well clear of a DST boundary; Pacific date is 2026-03-15.
const NOW = new Date("2026-03-15T20:00:00Z");

describe("recentDailyDates", () => {
  it("returns n dates, newest first, including today", () => {
    const ds = recentDailyDates(30, NOW);
    expect(ds).toHaveLength(30);
    expect(ds[0]).toBe("2026-03-15");
    expect(ds[1]).toBe("2026-03-14");
    expect(ds[29]).toBe("2026-02-14"); // crosses the month boundary correctly
  });
});

describe("isPlayableDailyDate", () => {
  it("accepts today and dates within the 30-day window", () => {
    expect(isPlayableDailyDate("2026-03-15", 30, NOW)).toBe(true);
    expect(isPlayableDailyDate("2026-02-14", 30, NOW)).toBe(true);
  });
  it("rejects future dates, too-old dates, and malformed input", () => {
    expect(isPlayableDailyDate("2026-03-16", 30, NOW)).toBe(false); // future
    expect(isPlayableDailyDate("2026-02-13", 30, NOW)).toBe(false); // 31 days back
    expect(isPlayableDailyDate("garbage", 30, NOW)).toBe(false);
    expect(isPlayableDailyDate("2026-3-5", 30, NOW)).toBe(false); // not zero-padded
  });
});
