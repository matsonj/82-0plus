import { describe, expect, it } from "vitest";
import {
  countsTowardPublicSpots,
  ENTRY_COMPLETION_MINUTES,
  entryDeadlineISO,
  EXPIRY_HOURS,
  formatPublicSpots,
  isEntryExpired,
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

describe("ENTRY_COMPLETION_MINUTES", () => {
  it("is 10 — the SQL intervals in the purge + browse-count queries assume this", () => {
    // A guard so the constant and the hardcoded `interval 'N minutes'` in
    // privateTournamentQueries.ts / privateTournamentRows.ts never silently drift.
    expect(ENTRY_COMPLETION_MINUTES).toBe(10);
  });
});

describe("isEntryExpired", () => {
  const created = Date.parse("2026-06-09T00:00:00.000Z");
  const deadline = created + ENTRY_COMPLETION_MINUTES * 60_000;
  const createdISO = new Date(created).toISOString();

  it("is not expired exactly at the deadline (exclusive)", () => {
    expect(isEntryExpired(createdISO, deadline, "registered")).toBe(false);
  });

  it("is expired one millisecond past the deadline", () => {
    expect(isEntryExpired(createdISO, deadline + 1, "registered")).toBe(true);
    expect(isEntryExpired(createdISO, deadline + 1, "partial")).toBe(true);
  });

  it("is not expired one millisecond before the deadline", () => {
    expect(isEntryExpired(createdISO, deadline - 1, "partial")).toBe(false);
  });

  it("is NEVER expired once locked (submitted / bot_replaced), even long after", () => {
    expect(isEntryExpired(createdISO, deadline + 3_600_000, "submitted")).toBe(false);
    expect(isEntryExpired(createdISO, deadline + 3_600_000, "bot_replaced")).toBe(false);
  });
});

describe("entryDeadlineISO", () => {
  const createdISO = "2026-06-09T00:00:00.000Z";
  const expected = new Date(
    Date.parse(createdISO) + ENTRY_COMPLETION_MINUTES * 60_000,
  ).toISOString();

  it("returns created_at + window for a public incomplete entry", () => {
    expect(
      entryDeadlineISO({ createdAtISO: createdISO, isPublic: true, status: "registered" }),
    ).toBe(expected);
    expect(
      entryDeadlineISO({ createdAtISO: createdISO, isPublic: true, status: "partial" }),
    ).toBe(expected);
  });

  it("is null for private tournaments (no per-entry window)", () => {
    expect(
      entryDeadlineISO({ createdAtISO: createdISO, isPublic: false, status: "registered" }),
    ).toBeNull();
  });

  it("is null once locked (submitted / bot_replaced)", () => {
    expect(
      entryDeadlineISO({ createdAtISO: createdISO, isPublic: true, status: "submitted" }),
    ).toBeNull();
    expect(
      entryDeadlineISO({ createdAtISO: createdISO, isPublic: true, status: "bot_replaced" }),
    ).toBeNull();
  });
});

describe("countsTowardPublicSpots", () => {
  const created = Date.parse("2026-06-09T00:00:00.000Z");
  const deadline = created + ENTRY_COMPLETION_MINUTES * 60_000;
  const createdISO = new Date(created).toISOString();

  it("counts locked entries regardless of age", () => {
    expect(
      countsTowardPublicSpots({ status: "submitted", createdAtISO: createdISO, nowMs: deadline + 1 }),
    ).toBe(true);
    expect(
      countsTowardPublicSpots({ status: "bot_replaced", createdAtISO: createdISO, nowMs: deadline + 1 }),
    ).toBe(true);
  });

  it("counts an incomplete entry still inside its window", () => {
    expect(
      countsTowardPublicSpots({ status: "registered", createdAtISO: createdISO, nowMs: deadline }),
    ).toBe(true);
  });

  it("drops a stale incomplete entry (mirrors the purge / browse FILTER)", () => {
    expect(
      countsTowardPublicSpots({ status: "registered", createdAtISO: createdISO, nowMs: deadline + 1 }),
    ).toBe(false);
    expect(
      countsTowardPublicSpots({ status: "partial", createdAtISO: createdISO, nowMs: deadline + 1 }),
    ).toBe(false);
  });
});
