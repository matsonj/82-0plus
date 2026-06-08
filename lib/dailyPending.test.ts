import { describe, it, expect } from "vitest";
import { pendingOwnedBy, accountTag, type PendingDaily } from "./dailyPending";

const lock = (name: string, pin: string): PendingDaily => ({
  date: "2026-06-07",
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

describe("accountTag (per-account lock namespace)", () => {
  it("is stable for the same account", () => {
    expect(accountTag("PHIL JACKSON", "1234")).toBe(accountTag("PHIL JACKSON", "1234"));
  });

  it("is case- and spacing-insensitive on the name (normalizeName)", () => {
    expect(accountTag("phil  jackson", "1234")).toBe(accountTag("PHIL JACKSON", "1234"));
  });

  it("differs for a different name — so B can't clobber A's lock for the same day", () => {
    expect(accountTag("STEVE KERR", "1234")).not.toBe(accountTag("PHIL JACKSON", "1234"));
  });

  it("differs for the same name with a different PIN", () => {
    expect(accountTag("PHIL JACKSON", "1234")).not.toBe(accountTag("PHIL JACKSON", "9999"));
  });

  it("does not collide across a name/pin boundary shift", () => {
    // "AB" + "1" vs "A" + "B1" must not map to the same tag.
    expect(accountTag("AB", "1")).not.toBe(accountTag("A", "B1"));
  });
});
