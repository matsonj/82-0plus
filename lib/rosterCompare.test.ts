import { describe, expect, it } from "vitest";
import { pickKey, decadeLabel, slotWinner, gqDiffView } from "./rosterCompare";

describe("rosterCompare — pickKey / decadeLabel", () => {
  it("pickKey is name|team|season", () => {
    expect(pickKey({ name: "Wilt Chamberlain", team: "LAL", season: 1972 })).toBe(
      "Wilt Chamberlain|LAL|1972",
    );
  });

  it("decadeLabel floors the season to its decade", () => {
    expect(decadeLabel(1972)).toBe("1970s");
    expect(decadeLabel(1969)).toBe("1960s");
    expect(decadeLabel(1980)).toBe("1980s");
    expect(decadeLabel(2017)).toBe("2010s");
  });
});

describe("rosterCompare — slotWinner (who's the better pick)", () => {
  it("higher GQ wins; ties / shared / missing have no winner", () => {
    expect(slotWinner(80, 60, false)).toBe("you");
    expect(slotWinner(60, 80, false)).toBe("them");
    expect(slotWinner(70, 70, false)).toBeNull(); // exact tie, different players
    expect(slotWinner(80, 60, true)).toBeNull(); // shared pick → no winner
    expect(slotWinner(80, undefined, false)).toBeNull(); // no opponent
  });
});

describe("rosterCompare — gqDiffView (sign · thresholds · colour)", () => {
  it("dashes a push: shared, missing opponent, or a vanishing gap", () => {
    expect(gqDiffView(70, 70, true)).toEqual({ kind: "dash" });
    expect(gqDiffView(70, undefined, false)).toEqual({ kind: "dash" });
    expect(gqDiffView(70.02, 70.0, false)).toEqual({ kind: "dash" }); // < 0.05
  });

  it("shows a quiet, signed number for |gap| ≤ 10", () => {
    expect(gqDiffView(73.5, 70.0, false)).toEqual({ kind: "number", text: "+3.5" });
    expect(gqDiffView(66.5, 70.0, false)).toEqual({ kind: "number", text: "-3.5" });
    expect(gqDiffView(80, 70, false)).toEqual({ kind: "number", text: "+10.0" }); // exactly 10 stays a number
  });

  it("stamps a gap > 10, coloured by direction (ahead = yellow)", () => {
    expect(gqDiffView(83.6, 70.0, false)).toEqual({
      kind: "stamp",
      text: "+13.6",
      ahead: true,
      big: false,
    });
    expect(gqDiffView(56.4, 70.0, false)).toEqual({
      kind: "stamp",
      text: "-13.6",
      ahead: false,
      big: false,
    });
    // Just over the threshold is a (small) stamp, not a number.
    expect(gqDiffView(80.2, 70.0, false)).toMatchObject({ kind: "stamp", big: false });
  });

  it("uses the bigger stamp only when |gap| > 20", () => {
    expect(gqDiffView(90.5, 70.0, false)).toEqual({
      kind: "stamp",
      text: "+20.5",
      ahead: true,
      big: true,
    });
    expect(gqDiffView(36.0, 70.0, false)).toMatchObject({
      kind: "stamp",
      ahead: false,
      big: true,
    }); // big negative → inverted + large
    expect(gqDiffView(90.0, 70.0, false)).toMatchObject({ big: false }); // exactly 20 isn't "big"
  });
});
