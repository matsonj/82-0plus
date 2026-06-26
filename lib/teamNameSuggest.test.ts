import { describe, it, expect } from "vitest";
import { suggestTeamName } from "./teamNameSuggest";
import { validateTeamName } from "./tournamentValidation";

describe("suggestTeamName", () => {
  it("makes an alliterative possessive from the handle", () => {
    expect(suggestTeamName("JMONEY")).toBe("JMONEY'S JOKERS");
    expect(suggestTeamName("PHIL JACKSON")).toBe("PHIL'S POSSE"); // first token only
  });

  it("strips digits/symbols and uppercases", () => {
    expect(suggestTeamName("kobe24")).toBe("KOBE'S KINGS");
    expect(suggestTeamName("30curry")).toBe("CURRY'S CREW"); // leading digits dropped
  });

  it("uses the possessive when it fits the cap", () => {
    expect(suggestTeamName("DESMONDDBANE")).toBe("DESMONDDBANE'S DUNKERS"); // 22 ≤ 24
  });

  it("falls back to the bare noun when the possessive exceeds the cap", () => {
    // 16-letter handle + "'S " + "BALLERS" (7) = 26 > 24 → just the noun.
    expect(suggestTeamName("BANNERSEASONXOXO")).toBe("BALLERS");
  });

  it("falls back to a neutral default with no usable letters", () => {
    expect(suggestTeamName("")).toBe("DREAM TEAM");
    expect(suggestTeamName("123 456")).toBe("DREAM TEAM");
  });

  it("always returns a valid team name", () => {
    for (const u of ["JMONEY", "kobe24", "AVERYLONGHANDLE99", "", "Q", "ZED", "1"]) {
      expect(validateTeamName(suggestTeamName(u)).ok).toBe(true);
    }
  });
});
