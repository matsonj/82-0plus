import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signRoll, verifyRoll } from "./tournamentToken";

describe("tournamentToken — signed roll receipts", () => {
  it("verifies a fresh receipt for the exact team it was signed for", () => {
    const r = signRoll("BOS");
    expect(verifyRoll(r, "BOS")).toBe(true);
  });

  it("rejects a receipt presented for a different team (no cross-team replay)", () => {
    const r = signRoll("BOS");
    expect(verifyRoll(r, "LAL")).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const r = signRoll("BOS");
    const [issuedAt, sig] = r.split(".");
    const flipped = sig.slice(0, -1) + (sig.endsWith("0") ? "1" : "0");
    expect(verifyRoll(`${issuedAt}.${flipped}`, "BOS")).toBe(false);
  });

  it("rejects a forged timestamp (re-signing with a moved issuedAt fails)", () => {
    const r = signRoll("BOS");
    const sig = r.slice(r.indexOf(".") + 1);
    expect(verifyRoll(`${Date.now() + 1}.${sig}`, "BOS")).toBe(false);
  });

  it("rejects malformed input", () => {
    expect(verifyRoll(undefined, "BOS")).toBe(false);
    expect(verifyRoll("", "BOS")).toBe(false);
    expect(verifyRoll("no-dot", "BOS")).toBe(false);
    expect(verifyRoll(".abc", "BOS")).toBe(false);
    expect(verifyRoll(12345, "BOS")).toBe(false);
  });

  describe("with fake timers", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("rejects an expired receipt (> 12h old)", () => {
      vi.setSystemTime(new Date("2026-06-05T00:00:00Z"));
      const r = signRoll("BOS");
      expect(verifyRoll(r, "BOS")).toBe(true);
      vi.advanceTimersByTime(12 * 60 * 60 * 1000 + 1);
      expect(verifyRoll(r, "BOS")).toBe(false);
    });

    it("rejects a future-dated receipt beyond the clock-skew guard", () => {
      vi.setSystemTime(new Date("2026-06-05T00:00:00Z"));
      const r = signRoll("BOS");
      // Rewind the clock so the receipt is now > 60s in the future.
      vi.setSystemTime(new Date("2026-06-04T23:58:00Z"));
      expect(verifyRoll(r, "BOS")).toBe(false);
    });

    it("two rolls of the same team at different times yield distinct receipts", () => {
      vi.setSystemTime(new Date("2026-06-05T00:00:00Z"));
      const a = signRoll("BOS");
      vi.advanceTimersByTime(1000);
      const b = signRoll("BOS");
      expect(a).not.toBe(b);
    });
  });
});
