import { describe, expect, it } from "vitest";
import {
  signDailyShare,
  verifyDailyShare,
  toDailyShareRoster,
  type DailyShare,
} from "./dailyShareToken";

const SHARE: DailyShare = {
  d: "2026-06-01",
  u: "Hooper",
  w: 70,
  l: 12,
  n: 8.4,
  p: false,
};

describe("dailyShareToken — date-bound share receipts", () => {
  it("verifies a signed share (signature-only, no date binding)", () => {
    const v = verifyDailyShare(signDailyShare(SHARE));
    expect(v).not.toBeNull();
    expect(v?.d).toBe("2026-06-01");
    expect(v?.u).toBe("Hooper");
    expect(v?.w).toBe(70);
    expect(v?.l).toBe(12);
    expect(v?.n).toBeCloseTo(8.4, 5);
  });

  it("accepts a valid token whose date matches the viewed (route) date", () => {
    const tok = signDailyShare(SHARE);
    expect(verifyDailyShare(tok, "2026-06-01")).not.toBeNull();
  });

  it("rejects a valid token pasted onto a DIFFERENT day's route (mis-bound)", () => {
    const tok = signDailyShare(SHARE);
    expect(verifyDailyShare(tok, "2026-06-08")).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const tok = signDailyShare(SHARE);
    const dot = tok.lastIndexOf(".");
    const sig = tok.slice(dot + 1);
    const flipped = sig.slice(0, -1) + (sig.endsWith("0") ? "1" : "0");
    expect(verifyDailyShare(`${tok.slice(0, dot)}.${flipped}`)).toBeNull();
    expect(verifyDailyShare(`${tok.slice(0, dot)}.${flipped}`, "2026-06-01")).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(verifyDailyShare(undefined)).toBeNull();
    expect(verifyDailyShare("")).toBeNull();
    expect(verifyDailyShare("no-dot")).toBeNull();
  });

  it("round-trips an optional tournament run", () => {
    const withTourn: DailyShare = {
      ...SHARE,
      t: { w: 12, l: 3, n: -2.5, r: 3 },
    };
    const v = verifyDailyShare(signDailyShare(withTourn), "2026-06-01");
    expect(v?.t).toBeDefined();
    expect(v?.t?.w).toBe(12);
    expect(v?.t?.l).toBe(3);
    expect(v?.t?.n).toBeCloseTo(-2.5, 5);
    expect(v?.t?.r).toBe(3);
  });

  it("omits the tournament run when not provided (no `t`)", () => {
    const v = verifyDailyShare(signDailyShare(SHARE));
    expect(v?.t).toBeUndefined();
  });

  it("still verifies a tournament-bearing token bound to the wrong date as null", () => {
    const tok = signDailyShare({ ...SHARE, t: { w: 1, l: 0, n: 1.1, r: 0 } });
    expect(verifyDailyShare(tok, "2026-06-09")).toBeNull();
  });

  const ROSTER = [
    { name: "Stephen Curry", team: "GSW", season: 2016, gq: 92.4 },
    { name: "Kevin Durant", team: "OKC", season: 2014, gq: 88.0 },
    { name: "Scottie Pippen", team: "CHI", season: 1996, gq: 74.6 },
    { name: "James Worthy", team: "LAL", season: 1987, gq: 71.1 },
    { name: "Wilt Chamberlain", team: "PHI", season: 1967, gq: 96.1 },
  ];

  it("round-trips the sharer's roster (no tournament)", () => {
    const tok = signDailyShare({ ...SHARE, r: toDailyShareRoster(ROSTER) });
    const v = verifyDailyShare(tok, "2026-06-01");
    expect(v?.t).toBeUndefined();
    expect(v?.r).toHaveLength(5);
    expect(v?.r?.[0]).toEqual({ n: "Stephen Curry", tm: "GSW", s: 2016, gq: 92.4 });
    expect(v?.r?.[4].gq).toBeCloseTo(96.1, 5);
  });

  it("round-trips roster AND tournament together", () => {
    const tok = signDailyShare({
      ...SHARE,
      t: { w: 12, l: 3, n: -2.5, r: 3 },
      r: toDailyShareRoster(ROSTER),
    });
    const v = verifyDailyShare(tok, "2026-06-01");
    expect(v?.t?.w).toBe(12);
    expect(v?.t?.r).toBe(3);
    expect(v?.r).toHaveLength(5);
    expect(v?.r?.[2].n).toBe("Scottie Pippen");
  });

  it("omits the roster when not provided, and for an empty roster (no `r`)", () => {
    expect(verifyDailyShare(signDailyShare(SHARE))?.r).toBeUndefined();
    expect(verifyDailyShare(signDailyShare({ ...SHARE, r: [] }))?.r).toBeUndefined();
  });

  it("decodes a legacy 10-entry tournament token (no trailing roster array) unchanged", () => {
    // A token minted before rosters existed: tournament present, no roster. The
    // last element is a number, so it must NOT be mistaken for a roster.
    const tok = signDailyShare({ ...SHARE, t: { w: 5, l: 2, n: 3.3, r: 2 } });
    const v = verifyDailyShare(tok, "2026-06-01");
    expect(v?.t).toEqual({ w: 5, l: 2, n: 3.3, r: 2 });
    expect(v?.r).toBeUndefined();
  });
});
