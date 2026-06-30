import { describe, expect, it } from "vitest";
import {
  EXPIRY_HOURS,
  formatPublicSpots,
  isExpired,
  needsAttention,
  normalizeTournamentName,
  privateModeLabel,
  validateCreateParams,
  type CreatePrivateParams,
} from "./privateTournament";

describe("privateModeLabel", () => {
  it("maps hoopiq → Ranked and classic → Classic", () => {
    expect(privateModeLabel("hoopiq")).toBe("Ranked");
    expect(privateModeLabel("classic")).toBe("Classic");
  });
});

describe("normalizeTournamentName", () => {
  it("trims, uppercases and collapses whitespace", () => {
    expect(normalizeTournamentName("  phil   jackson ")).toBe("PHIL JACKSON");
  });
});

describe("validateCreateParams", () => {
  const valid: CreatePrivateParams = {
    name: "Finals 2026",
    pin: "1234",
    mode: "hoopiq",
    size: 8,
    boardMode: "blind",
  };

  it("accepts a valid set and normalizes the name", () => {
    const res = validateCreateParams(valid);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toEqual({
        name: "FINALS 2026",
        pin: "1234",
        mode: "hoopiq",
        size: 8,
        boardMode: "blind",
      });
    }
  });

  it("rejects a bad name", () => {
    expect(validateCreateParams({ ...valid, name: "" }).ok).toBe(false);
    expect(validateCreateParams({ ...valid, name: "no_symbols!" }).ok).toBe(false);
  });

  it("rejects a bad PIN", () => {
    expect(validateCreateParams({ ...valid, pin: "12" }).ok).toBe(false);
    expect(validateCreateParams({ ...valid, pin: "abcd" }).ok).toBe(false);
  });

  it("rejects a bad mode", () => {
    expect(validateCreateParams({ ...valid, mode: "daily" }).ok).toBe(false);
    expect(validateCreateParams({ ...valid, mode: 1 }).ok).toBe(false);
  });

  it("rejects a bad size", () => {
    expect(validateCreateParams({ ...valid, size: 10 }).ok).toBe(false);
    expect(validateCreateParams({ ...valid, size: "8" }).ok).toBe(false);
  });

  it("rejects a bad board mode", () => {
    expect(validateCreateParams({ ...valid, boardMode: "auto" }).ok).toBe(false);
  });

  it("accepts every legal size and both board/scoring modes", () => {
    for (const size of [4, 8, 12, 16, 20]) {
      expect(validateCreateParams({ ...valid, size }).ok).toBe(true);
    }
    expect(validateCreateParams({ ...valid, mode: "classic" }).ok).toBe(true);
    expect(validateCreateParams({ ...valid, boardMode: "manual" }).ok).toBe(true);
  });
});

describe("needsAttention", () => {
  it("pending-open (registered/partial/submitted) → true", () => {
    for (const entryStatus of ["registered", "partial", "submitted"] as const) {
      expect(
        needsAttention({ tournamentStatus: "open", entryStatus, viewedFinalAt: null }),
      ).toBe(true);
    }
  });

  it("open + bot_replaced → false (nothing for the user to do)", () => {
    expect(
      needsAttention({
        tournamentStatus: "open",
        entryStatus: "bot_replaced",
        viewedFinalAt: null,
      }),
    ).toBe(false);
  });

  it("completed-unviewed → true", () => {
    expect(
      needsAttention({
        tournamentStatus: "completed",
        entryStatus: "submitted",
        viewedFinalAt: null,
      }),
    ).toBe(true);
  });

  it("completed-viewed → false", () => {
    expect(
      needsAttention({
        tournamentStatus: "completed",
        entryStatus: "submitted",
        viewedFinalAt: "2026-06-09T00:00:00.000Z",
      }),
    ).toBe(false);
  });
});

describe("isExpired", () => {
  const base = Date.parse("2026-06-09T00:00:00.000Z");
  const expiresAt = new Date(base + EXPIRY_HOURS * 3600_000).toISOString();

  it("is not expired at creation (now + window equals expiry)", () => {
    expect(isExpired(expiresAt, base)).toBe(false);
  });

  it("is not expired exactly at the boundary (exclusive)", () => {
    expect(isExpired(expiresAt, Date.parse(expiresAt))).toBe(false);
  });

  it("is expired one millisecond past the boundary", () => {
    expect(isExpired(expiresAt, Date.parse(expiresAt) + 1)).toBe(true);
  });

  it("is not expired one millisecond before the boundary", () => {
    expect(isExpired(expiresAt, Date.parse(expiresAt) - 1)).toBe(false);
  });
});

describe("formatPublicSpots", () => {
  it("renders 'joined / size' and is not full below capacity", () => {
    expect(formatPublicSpots(5, 8)).toEqual({ text: "5 / 8", full: false });
    expect(formatPublicSpots(0, 4)).toEqual({ text: "0 / 4", full: false });
  });

  it("is full INCLUSIVELY — at and beyond the field size", () => {
    expect(formatPublicSpots(8, 8)).toEqual({ text: "8 / 8", full: true });
    // Defensive: an over-count (shouldn't happen) still reads full.
    expect(formatPublicSpots(9, 8).full).toBe(true);
  });

  it("clamps a negative count to 0", () => {
    expect(formatPublicSpots(-3, 16)).toEqual({ text: "0 / 16", full: false });
  });
});
