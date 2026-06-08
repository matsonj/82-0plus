import { afterEach, describe, expect, it, vi } from "vitest";
import { getTournamentSecret } from "./secret";

afterEach(() => vi.unstubAllEnvs());

describe("getTournamentSecret — no DB-token fallback", () => {
  it("returns the explicit TOURNAMENT_SECRET when set", () => {
    vi.stubEnv("TOURNAMENT_SECRET", "a-real-secret");
    expect(getTournamentSecret()).toBe("a-real-secret");
  });

  it("throws in production when TOURNAMENT_SECRET is unset", () => {
    vi.stubEnv("TOURNAMENT_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => getTournamentSecret()).toThrow(/required in production/i);
  });

  it("falls back to a dev placeholder outside production", () => {
    vi.stubEnv("TOURNAMENT_SECRET", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(getTournamentSecret()).toBe("82-0plus-dev-secret");
  });

  it("does NOT fall back to the database tokens", () => {
    vi.stubEnv("TOURNAMENT_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MOTHERDUCK_RW_TOKEN", "rw-token-value");
    vi.stubEnv("MOTHERDUCK_TOKEN", "read-token-value");
    expect(() => getTournamentSecret()).toThrow();
  });
});
