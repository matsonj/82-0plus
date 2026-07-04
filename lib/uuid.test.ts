import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";
import { isUuid, isUuidStrict } from "./uuid";

describe("isUuid", () => {
  it("accepts a freshly generated randomUUID()", () => {
    expect(isUuid(randomUUID())).toBe(true);
  });

  it("accepts known-good UUIDs (mixed case, v1 and v4)", () => {
    expect(isUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isUuid("550E8400-E29B-41D4-A716-446655440000")).toBe(true);
    expect(isUuid("6fa459ea-ee8a-3ca4-894e-db77e160355e")).toBe(true);
  });

  it("rejects malformed, empty, wrong-length, and non-string input", () => {
    expect(isUuid("")).toBe(false);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("550e8400-e29b-41d4-a716-44665544000")).toBe(false); // one char short
    expect(isUuid("550e8400-e29b-41d4-a716-4466554400000")).toBe(false); // one char long
    expect(isUuid("550e8400e29b41d4a716446655440000")).toBe(false); // missing dashes
    expect(isUuid(null)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(12345)).toBe(false);
    expect(isUuid({})).toBe(false);
  });
});

describe("isUuidStrict", () => {
  it("accepts a freshly generated randomUUID() (always v4/variant 1)", () => {
    expect(isUuidStrict(randomUUID())).toBe(true);
  });

  it("accepts a valid v4 UUID and rejects a bad version/variant nibble", () => {
    expect(isUuidStrict("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    // version nibble '9' is not a valid RFC 4122 version (1-5)
    expect(isUuidStrict("550e8400-e29b-91d4-a716-446655440000")).toBe(false);
    // variant nibble '7' is not a valid RFC 4122 variant (8/9/a/b)
    expect(isUuidStrict("550e8400-e29b-41d4-7716-446655440000")).toBe(false);
  });

  it("rejects malformed, empty, and non-string input", () => {
    expect(isUuidStrict("")).toBe(false);
    expect(isUuidStrict("not-a-uuid")).toBe(false);
    expect(isUuidStrict(undefined)).toBe(false);
  });
});
