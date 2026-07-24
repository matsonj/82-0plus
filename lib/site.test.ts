import { describe, expect, it } from "vitest";
import { resolveSiteUrl } from "./site";

const FALLBACK = "https://daily82.com";

describe("resolveSiteUrl", () => {
  it("keeps a valid configured origin", () => {
    expect(resolveSiteUrl("https://daily82.com")).toBe("https://daily82.com");
    expect(resolveSiteUrl("https://staging.daily82.com")).toBe(
      "https://staging.daily82.com",
    );
    // http is allowed (local/preview origins).
    expect(resolveSiteUrl("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("trims surrounding whitespace", () => {
    expect(resolveSiteUrl("  https://daily82.com  ")).toBe("https://daily82.com");
  });

  it("falls back when unset, empty, or whitespace", () => {
    expect(resolveSiteUrl(undefined)).toBe(FALLBACK);
    expect(resolveSiteUrl("")).toBe(FALLBACK);
    expect(resolveSiteUrl("   ")).toBe(FALLBACK);
  });

  // The regression that broke the production build: Vercel CLI >= 57 writes this
  // literal string for a Sensitive env var, and it is NOT empty — so the old
  // `?.trim() || fallback` let it through and `new URL()` threw ERR_INVALID_URL
  // while collecting page data for /_not-found.
  it("falls back on the [SENSITIVE] placeholder vercel pull writes", () => {
    expect(resolveSiteUrl("[SENSITIVE]")).toBe(FALLBACK);
  });

  it("falls back on any other non-URL garbage", () => {
    expect(resolveSiteUrl("daily82.com")).toBe(FALLBACK); // no scheme
    expect(resolveSiteUrl("not a url")).toBe(FALLBACK);
    expect(resolveSiteUrl("***")).toBe(FALLBACK); // a masked CI value
  });

  it("falls back on a well-formed but unusable scheme", () => {
    expect(resolveSiteUrl("file:///tmp/x")).toBe(FALLBACK);
    expect(resolveSiteUrl("data:text/plain,hi")).toBe(FALLBACK);
  });

  // The whole point: whatever comes back must be safe to hand to new URL(), since
  // app/layout.tsx does exactly that for metadataBase at build time.
  it("always returns something new URL() accepts", () => {
    for (const raw of [
      undefined,
      "",
      "   ",
      "[SENSITIVE]",
      "***",
      "daily82.com",
      "file:///tmp/x",
      "https://daily82.com",
    ]) {
      expect(() => new URL(resolveSiteUrl(raw))).not.toThrow();
    }
  });
});
