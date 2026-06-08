import { describe, it, expect } from "vitest";
import { pendingOwnedBy, type PendingDaily } from "./dailyPending";

const lock = (name: string, pin: string): PendingDaily => ({
  wins: 70,
  losses: 12,
  perfect: false,
  picks: [],
  owner: { name, pin },
});

describe("pendingOwnedBy", () => {
  it("matches the account that created the lock", () => {
    expect(
      pendingOwnedBy(lock("PHIL JACKSON", "1234"), { username: "PHIL JACKSON", pin: "1234" }),
    ).toBe(true);
  });

  it("is case- and spacing-insensitive on the name (normalizeName)", () => {
    expect(
      pendingOwnedBy(lock("phil  jackson", "1234"), { username: "PHIL JACKSON", pin: "1234" }),
    ).toBe(true);
  });

  it("rejects a different account name (player B on the same browser)", () => {
    expect(
      pendingOwnedBy(lock("STEVE KERR", "1234"), { username: "PHIL JACKSON", pin: "1234" }),
    ).toBe(false);
  });

  it("rejects the same name with a different PIN (a different account)", () => {
    expect(
      pendingOwnedBy(lock("PHIL JACKSON", "1234"), { username: "PHIL JACKSON", pin: "9999" }),
    ).toBe(false);
  });
});
