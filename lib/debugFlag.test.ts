import { afterEach, describe, expect, it, vi } from "vitest";
import { isDebugEnabled } from "./debugFlag";

afterEach(() => vi.unstubAllEnvs());

describe("isDebugEnabled — scoring-breakdown debug gate", () => {
  it("fails closed in production even with NEXT_PUBLIC_DEBUG=1", () => {
    vi.stubEnv("NEXT_PUBLIC_DEBUG", "1");
    vi.stubEnv("NODE_ENV", "production");
    expect(isDebugEnabled()).toBe(false);
  });

  it("is enabled with NEXT_PUBLIC_DEBUG=1 in development", () => {
    vi.stubEnv("NEXT_PUBLIC_DEBUG", "1");
    vi.stubEnv("NODE_ENV", "development");
    expect(isDebugEnabled()).toBe(true);
  });

  it("is enabled with NEXT_PUBLIC_DEBUG=1 in test", () => {
    vi.stubEnv("NEXT_PUBLIC_DEBUG", "1");
    vi.stubEnv("NODE_ENV", "test");
    expect(isDebugEnabled()).toBe(true);
  });

  it("fails closed with NEXT_PUBLIC_DEBUG=1 when NODE_ENV is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_DEBUG", "1");
    vi.stubEnv("NODE_ENV", "");
    expect(isDebugEnabled()).toBe(false);
  });

  it("fails closed with NEXT_PUBLIC_DEBUG=1 in staging (allowlist, not denylist)", () => {
    vi.stubEnv("NEXT_PUBLIC_DEBUG", "1");
    vi.stubEnv("NODE_ENV", "staging");
    expect(isDebugEnabled()).toBe(false);
  });

  it("is disabled when NEXT_PUBLIC_DEBUG is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_DEBUG", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(isDebugEnabled()).toBe(false);
  });

  it("is disabled for any non-'1' NEXT_PUBLIC_DEBUG value", () => {
    vi.stubEnv("NEXT_PUBLIC_DEBUG", "true");
    vi.stubEnv("NODE_ENV", "development");
    expect(isDebugEnabled()).toBe(false);
  });
});
