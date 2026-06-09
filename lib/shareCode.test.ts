import { describe, it, expect } from "vitest";
import { encodeShare, decodeShare, type SharePayload } from "./shareCode";

const sample: SharePayload = {
  w: 82,
  l: 0,
  n: 15.2,
  p: true,
  m: "Daily 2026-06-03",
  r: [
    { t: "CHI", s: 1996, name: "Michael Jordan", pts: 30, reb: 7, ast: 4 },
    { t: "DEN", s: 2023, name: "Nikola Jokić", pts: 25, reb: 12, ast: 10 },
    { t: "LAL", s: 2010, name: "Kobe Bryant", pts: 27, reb: 5, ast: 5 },
    { t: "BOS", s: 1986, name: "Larry Bird", pts: 26, reb: 10, ast: 7 },
    { t: "ORL", s: 2001, name: "Shaquille O'Neal", pts: 29, reb: 13, ast: 3 },
  ],
};

describe("shareCode", () => {
  it("round-trips a payload", () => {
    const decoded = decodeShare(encodeShare(sample));
    expect(decoded).toEqual(sample);
  });

  it("produces URL-safe output (no +, /, or = padding)", () => {
    const code = encodeShare(sample);
    expect(code).not.toMatch(/[+/=]/);
  });

  it("preserves unicode names (accents)", () => {
    const decoded = decodeShare(encodeShare(sample));
    expect(decoded?.r[1].name).toBe("Nikola Jokić");
  });

  it("preserves a negative one-decimal net rating", () => {
    const decoded = decodeShare(encodeShare({ ...sample, p: false, n: -8.7 }));
    expect(decoded?.n).toBe(-8.7);
    expect(decoded?.p).toBe(false);
  });

  it("round-trips a daily-tournament payload (reg-season + playoff run)", () => {
    const tourn: SharePayload = {
      ...sample, w: 66, l: 16, n: 9.1, p: false, r: [], u: "JMONEY",
      tn: { w: 13, l: 11, n: -0.8, r: 4 },
    };
    const decoded = decodeShare(encodeShare(tourn));
    expect(decoded?.tn).toEqual({ w: 13, l: 11, n: -0.8, r: 4 });
    expect(decoded?.u).toBe("JMONEY");
    expect(decoded?.w).toBe(66);
  });

  it("returns null on garbage input", () => {
    expect(decodeShare("not-valid-base64!!")).toBeNull();
    expect(decodeShare("")).toBeNull();
  });
});
