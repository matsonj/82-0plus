import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// requireAuth() delegates the actual credential check to authenticate(); we mock
// it to exercise the RESPONSE mapping (429 vs 401) and the IP threading. The
// throttle store is never touched here.
vi.mock("./dailyResults", () => ({
  authenticate: vi.fn(),
}));

import { clientIp, requireAuth } from "./apiAuth";
import { authenticate } from "./dailyResults";

const req = (headers: Record<string, string>) =>
  ({ headers: new Headers(headers) }) as unknown as NextRequest;
const sessionHint = { value: "s", isNew: false };

describe("clientIp (trusted source = x-real-ip; XFF ignored)", () => {
  it("returns a valid x-real-ip", () => {
    expect(clientIp(req({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("IGNORES x-forwarded-for (client-spoofable leftmost hop)", () => {
    // Even a well-formed XFF must not be trusted — only the platform's x-real-ip.
    expect(clientIp(req({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBeNull();
  });

  it("returns null for a missing header", () => {
    expect(clientIp(req({}))).toBeNull();
  });

  it("rejects a non-IP value (e.g. an injected key separator)", () => {
    expect(clientIp(req({ "x-real-ip": "not-an-ip|user:victim" }))).toBeNull();
    expect(clientIp(req({ "x-real-ip": "999.999.999.999" }))).toBeNull();
  });

  it("accepts and lowercases IPv6", () => {
    expect(clientIp(req({ "x-real-ip": "2001:DB8::1" }))).toBe("2001:db8::1");
  });
});

describe("requireAuth response mapping", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the account on success", async () => {
    vi.mocked(authenticate).mockResolvedValue({
      ok: true,
      userId: "u1",
      name: "Bob",
      nameNorm: "bob",
    });
    const auth = await requireAuth(req({ "x-real-ip": "1.1.1.1" }), sessionHint, "Bob", "1234");
    expect(auth.ok).toBe(true);
    if (auth.ok) expect(auth.userId).toBe("u1");
    // The trusted IP is threaded into authenticate().
    expect(vi.mocked(authenticate)).toHaveBeenCalledWith("Bob", "1234", {
      ip: "1.1.1.1",
    });
  });

  it("maps a plain credential failure to 401 (no Retry-After)", async () => {
    vi.mocked(authenticate).mockResolvedValue({ ok: false, reason: "bad" });
    const auth = await requireAuth(req({}), sessionHint, "Bob", "0000");
    expect(auth.ok).toBe(false);
    if (!auth.ok) {
      expect(auth.response.status).toBe(401);
      expect(auth.response.headers.get("Retry-After")).toBeNull();
      expect(await auth.response.json()).toEqual({ error: "bad" });
    }
  });

  it("maps a throttle lockout to 429 with a Retry-After (seconds)", async () => {
    vi.mocked(authenticate).mockResolvedValue({
      ok: false,
      reason: "Too many attempts — wait a moment and try again.",
      retryAfterMs: 30_000,
    });
    const auth = await requireAuth(req({}), sessionHint, "Bob", "0000");
    expect(auth.ok).toBe(false);
    if (!auth.ok) {
      expect(auth.response.status).toBe(429);
      expect(auth.response.headers.get("Retry-After")).toBe("30");
    }
  });
});
