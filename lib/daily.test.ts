import { describe, it, expect } from "vitest";
import { weightingForDailyDate } from "./daily";

// The flat→byTeamCount cutoff is the one moment the board's pick math changes.
// Since the daily board is re-derived on every read (and the submit route
// re-derives it to verify picks), any date the OLD flat build may have served
// must stay flat under the new build — otherwise in-progress entries for that
// day fail verification. These pin the boundary behavior with an explicit cutoff
// so it can't drift.
describe("weightingForDailyDate", () => {
  const CUTOFF = "2026-06-28";

  it("stays flat strictly before the cutoff (played boards never re-roll)", () => {
    expect(weightingForDailyDate("2026-06-27", CUTOFF)).toBe("flat");
    expect(weightingForDailyDate("2026-05-31", CUTOFF)).toBe("flat");
    expect(weightingForDailyDate("2019-12-31", CUTOFF)).toBe("flat");
  });

  it("switches to byTeamCount on and after the cutoff", () => {
    expect(weightingForDailyDate("2026-06-28", CUTOFF)).toBe("byTeamCount");
    expect(weightingForDailyDate("2026-06-29", CUTOFF)).toBe("byTeamCount");
    expect(weightingForDailyDate("2027-01-01", CUTOFF)).toBe("byTeamCount");
  });

  it("compares lexicographically across month/year boundaries", () => {
    expect(weightingForDailyDate("2026-12-31", "2027-01-01")).toBe("flat");
    expect(weightingForDailyDate("2027-01-01", "2026-12-31")).toBe("byTeamCount");
  });
});
