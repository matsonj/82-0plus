import { describe, it, expect } from "vitest";
import type { ScoringPlayer } from "./scoring";
import type { StatNorms, BracketResult, BracketPlayer } from "./types";
import { STAT_KEYS } from "./types";
import {
  TOURNAMENT_CONFIG as C,
  mulberry32,
  hashSeed,
  per36Totals,
  captainMultipliers,
  gameScoreCompare,
  fatigue,
  recoveryCarry,
  regionScore,
  simulateBracket,
  type TournamentTeam,
} from "./tournament";

// A ScoringPlayer factory (mirrors scoring.test.ts's `p`).
function p(over: Partial<ScoringPlayer> = {}): ScoringPlayer {
  return {
    gq: 0.5, mpg: 36, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0,
    fga: 0, fg3a: 0, fg3m: 0, fta: 0, tov: 0, fgm: 0, ftm: 0, tsplus: 1.0,
    height_in: 79, pos: null, allDef: 0,
    ...over,
  };
}

// A TournamentTeam factory. Defaults give a neutral, league-average team.
let nextId = 0;
function team(over: Partial<TournamentTeam> = {}): TournamentTeam {
  const id = over.id ?? `t${nextId++}`;
  const captainSlot = over.captainSlot ?? 0;
  // Default display roster: 5 slot-ordered starters with the captain flagged,
  // mirroring what buildTournamentTeam produces.
  const roster: BracketPlayer[] =
    over.roster ??
    Array.from({ length: 5 }, (_, i) => ({
      name: `${id}-p${i}`,
      team: "ABC",
      season: 1996,
      ...(i === captainSlot ? { captain: true } : {}),
    }));
  const sixthManInfo: BracketPlayer =
    over.sixthManInfo ?? { name: `${id}-p6`, team: "ABC", season: 1996 };
  return {
    id,
    name: over.name ?? id,
    isGhost: over.isGhost ?? false,
    starters: over.starters ?? Array.from({ length: 5 }, () => p()),
    sixthMan: over.sixthMan ?? p(),
    captainSlot,
    ageAtPeak: over.ageAtPeak ?? C.LEAGUE_AVG_EXP,
    sixthManAge: over.sixthManAge ?? C.LEAGUE_AVG_EXP,
    seedNet: over.seedNet ?? 0,
    roster,
    sixthManInfo,
    ...over,
  };
}

// Simple StatNorms: mean 0, std 1 → a per-36 value IS its own z-score.
function norms(): StatNorms {
  const mean = {} as StatNorms["mean"];
  const std = {} as StatNorms["std"];
  for (const k of STAT_KEYS) { mean[k] = 0; std[k] = 1; }
  return { mean, std };
}

// 16 teams with given seedNets (rest defaulted).
function field(nets: number[]): TournamentTeam[] {
  return nets.map((n, i) => team({ id: `T${i}`, name: `T${i}`, seedNet: n }));
}

describe("PRNG (mulberry32 / hashSeed)", () => {
  it("is deterministic and in [0,1)", () => {
    const a = mulberry32(hashSeed("abc"));
    const b = mulberry32(hashSeed("abc"));
    for (let i = 0; i < 5; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    // Different seeds diverge.
    expect(mulberry32(hashSeed("abc"))()).not.toBe(mulberry32(hashSeed("abd"))());
  });
});

describe("captain multipliers", () => {
  it("2 highest-z categories get ×1.05, the single lowest-z gets ×0.95", () => {
    // pts is far above the mean (high z), blk far below (low z); others 0.
    const captain = p({ mpg: 36, pts: 50, reb: 10 }); // pts huge, reb medium
    const m = captainMultipliers(captain, norms());
    // pts is clearly the top; with std=1 per-36 pts=50, reb=10 are the two highest.
    expect(m.pts).toBeCloseTo(1 + C.CAPTAIN_BUFF_PCT, 10);
    expect(m.reb).toBeCloseTo(1 + C.CAPTAIN_BUFF_PCT, 10);
    // Exactly one category gets the down-multiplier.
    const downs = STAT_KEYS.filter((k) => m[k] < 1);
    expect(downs.length).toBe(1);
    const ups = STAT_KEYS.filter((k) => m[k] > 1);
    expect(ups.length).toBe(2);
  });

  it("tov sign is inverted in the z-pick: a LOW-tov captain treats tov as a strength", () => {
    // Everything zero except tov, which is NEGATIVE (below mean 0). After sign
    // flip, low tov → high z → among the top categories (boosted, not cut).
    const captain = p({ mpg: 36, tov: -3 }); // below-mean turnovers (synthetic)
    const m = captainMultipliers(captain, norms());
    expect(m.tov).toBeGreaterThan(1); // boosted, because flipped z is high
  });
});

describe("per36Totals", () => {
  it("normalizes to per-36 and SUMS counting stats over all six players", () => {
    // 6 players (5 + sixth), each 18 pts in 36 mpg → 18 per-36 each → 108 total.
    const t = team({
      starters: Array.from({ length: 5 }, () => p({ mpg: 36, pts: 18 })),
      sixthMan: p({ mpg: 36, pts: 18 }),
    });
    const totals = per36Totals(t); // no norms → no captain buff
    expect(totals.pts).toBeCloseTo(108, 6);
  });

  it("includes the sixth man in the totals", () => {
    const withBench = team({
      starters: Array.from({ length: 5 }, () => p({ mpg: 36, reb: 5 })),
      sixthMan: p({ mpg: 36, reb: 5 }),
    });
    const withoutBenchContribution = team({
      starters: Array.from({ length: 5 }, () => p({ mpg: 36, reb: 5 })),
      sixthMan: p({ mpg: 36, reb: 0 }),
    });
    expect(per36Totals(withBench).reb).toBeGreaterThan(
      per36Totals(withoutBenchContribution).reb,
    );
  });

  it("computes GQ-style volume-weighted shooting value (fgV)", () => {
    const t = team({
      starters: Array.from({ length: 5 }, () => p({ mpg: 36, fgm: 8, fga: 16 })),
      sixthMan: p({ mpg: 36, fgm: 8, fga: 16 }),
    });
    // team fg% = 0.5; per-36 attempts = 16 each × 6 = 96; fgV = (0.5 − 0.47)·96.
    expect(per36Totals(t).fgV).toBeCloseTo((0.5 - 0.47) * 96, 5);
  });

  it("applies the captain category multipliers team-wide", () => {
    // Captain's top category is pts; every player scores, so team pts gets ×1.05.
    const starters = Array.from({ length: 5 }, () => p({ mpg: 36, pts: 20, reb: 5 }));
    const t = team({ starters, sixthMan: p({ mpg: 36, pts: 20, reb: 5 }), captainSlot: 0 });
    const base = per36Totals(t).pts;       // no norms → no buff
    const buffed = per36Totals(t, norms()).pts; // captain buff applied
    expect(buffed).toBeCloseTo(base * (1 + C.CAPTAIN_BUFF_PCT), 6);
  });
});

describe("gameScoreCompare", () => {
  it("awards each category to the better team; tov is lower-is-better", () => {
    const a = {} as Record<string, number>;
    const b = {} as Record<string, number>;
    for (const k of STAT_KEYS) { a[k] = 0; b[k] = 0; }
    a.pts = 10; // A wins pts
    b.reb = 10; // B wins reb
    a.tov = 1; b.tov = 5; // A has fewer turnovers → A wins tov
    const r = gameScoreCompare(a as never, b as never);
    expect(r.aWins).toBe(2); // pts + tov
    expect(r.bWins).toBe(1); // reb
  });

  it("ties award the category to neither", () => {
    const a = {} as Record<string, number>;
    const b = {} as Record<string, number>;
    for (const k of STAT_KEYS) { a[k] = 1; b[k] = 1; }
    const r = gameScoreCompare(a as never, b as never);
    expect(r.aWins).toBe(0);
    expect(r.bWins).toBe(0);
  });
});

describe("fatigue", () => {
  it("is zero in game 1 and grows with game number", () => {
    const t = team({ ageAtPeak: C.LEAGUE_AVG_EXP });
    expect(fatigue(t, 1)).toBe(0);
    expect(fatigue(t, 3)).toBeGreaterThan(fatigue(t, 2));
  });

  it("a higher age-at-peak team decays faster", () => {
    const young = team({ ageAtPeak: 2 });
    const old = team({ ageAtPeak: 14 });
    expect(fatigue(old, 5)).toBeGreaterThan(fatigue(young, 5));
  });

  it("the sixth-man multiplier halves the slope", () => {
    // fatigue uses SIXTH_MAN_FATIGUE_MULT = 0.5, so it's half the unmultiplied slope.
    const t = team({ ageAtPeak: C.LEAGUE_AVG_EXP });
    const g = 5;
    const expected =
      C.FATIGUE_PER_GAME * 1 * C.SIXTH_MAN_FATIGUE_MULT * (g - 1);
    expect(fatigue(t, g)).toBeCloseTo(expected, 10);
    // And it's exactly half of what a full (×1) slope would be.
    const full = C.FATIGUE_PER_GAME * 1 * 1 * (g - 1);
    expect(fatigue(t, g)).toBeCloseTo(full / 2, 10);
  });
});

describe("recovery carry (driven by the sixth man's quality + age)", () => {
  const AVG = C.LEAGUE_AVG_EXP; // a league-average-age bench

  it("swept → 0 regardless of the bench", () => {
    expect(recoveryCarry(0, 0.5, AVG)).toBe(0);
    expect(recoveryCarry(0, 0.9, 1)).toBe(0);
  });

  it("an average bench at league age relieves half the base carry", () => {
    // recoveryFactor = BASE (0.5) → carry = base × 0.5.
    expect(recoveryCarry(1, 0.5, AVG)).toBeCloseTo(0.5 * 0.5, 6);
    expect(recoveryCarry(2, 0.5, AVG)).toBeCloseTo(1.2 * 0.5, 6);
    expect(recoveryCarry(3, 0.5, AVG)).toBeCloseTo(2.0 * 0.5, 6);
  });

  it("a longer previous series carries more (same bench)", () => {
    expect(recoveryCarry(3, 0.5, AVG)).toBeGreaterThan(recoveryCarry(1, 0.5, AVG));
  });

  it("a better sixth man recovers more (less carry)", () => {
    expect(recoveryCarry(3, 0.8, AVG)).toBeLessThan(recoveryCarry(3, 0.4, AVG));
  });

  it("a younger sixth man recovers more (less carry)", () => {
    expect(recoveryCarry(3, 0.5, 2)).toBeLessThan(recoveryCarry(3, 0.5, 12));
  });

  it("an elite, young bench fully recovers; a poor, old bench gets no relief", () => {
    expect(recoveryCarry(3, 0.9, 1)).toBe(0); // recoveryFactor clamps to 1
    expect(recoveryCarry(3, 0.35, 14)).toBeCloseTo(2.0, 6); // factor clamps to 0 → full base
  });
});

describe("simulateBracket: structure", () => {
  it("requires exactly 16 teams", () => {
    expect(() => simulateBracket(field([0, 0, 0]), "k", norms())).toThrow();
  });

  it("produces 8E + 8W, seeds 1..8 each, deterministically for a fixed seedKey", () => {
    const r = simulateBracket(field(Array.from({ length: 16 }, (_, i) => i)), "season-1", norms());
    const east = r.teams.filter((t) => t.conference === "East");
    const west = r.teams.filter((t) => t.conference === "West");
    expect(east.length).toBe(8);
    expect(west.length).toBe(8);
    expect([...east].map((t) => t.seed).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...west].map((t) => t.seed).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // Within a conference, seed 1 has the highest seedNet.
    const e1 = east.find((t) => t.seed === 1)!;
    for (const t of east) expect(e1.seedNet).toBeGreaterThanOrEqual(t.seedNet);

    // Deterministic split: same seedKey → same conference assignment.
    const r2 = simulateBracket(field(Array.from({ length: 16 }, (_, i) => i)), "season-1", norms());
    const conf = (b: BracketResult) =>
      Object.fromEntries(b.teams.map((t) => [t.id, t.conference]));
    expect(conf(r2)).toEqual(conf(r));
  });

  it("rounds are [8, 4, 2, 1] with best-of-5 R1 and best-of-7 after", () => {
    const r = simulateBracket(field(Array.from({ length: 16 }, (_, i) => i)), "k", norms());
    expect(r.rounds.map((rd) => rd.length)).toEqual([8, 4, 2, 1]);
    for (const s of r.rounds[0]) expect(s.bestOf).toBe(5);
    for (const rd of r.rounds.slice(1))
      for (const s of rd) expect(s.bestOf).toBe(7);
  });

  it("threads each team's display roster (5 + captain flag) and sixth man into the bracket", () => {
    // field() builds teams via the factory, which sets roster/sixthManInfo.
    const r = simulateBracket(field(Array.from({ length: 16 }, (_, i) => i)), "k", norms());
    expect(r.teams.length).toBe(16);
    for (const t of r.teams) {
      expect(t.roster).toBeDefined();
      expect(t.roster!.length).toBe(5);
      const captains = t.roster!.filter((pl) => pl.captain === true);
      expect(captains.length).toBe(1); // exactly one captain
      expect(t.sixthMan).toBeDefined();
      expect(typeof t.sixthMan!.name).toBe("string");
    }
  });

  it("series stop at the clinch number (3 of 5, 4 of 7)", () => {
    const r = simulateBracket(field(Array.from({ length: 16 }, (_, i) => i)), "k", norms());
    for (const s of r.rounds[0]) {
      expect(Math.max(s.scoreHi, s.scoreLo)).toBe(3); // best-of-5 clinch
      expect(s.games.length).toBeLessThanOrEqual(5);
      expect(s.games.length).toBeGreaterThanOrEqual(3);
    }
    for (const rd of r.rounds.slice(1))
      for (const s of rd) {
        expect(Math.max(s.scoreHi, s.scoreLo)).toBe(4); // best-of-7 clinch
        expect(s.games.length).toBeLessThanOrEqual(7);
        expect(s.games.length).toBeGreaterThanOrEqual(4);
      }
  });
});

describe("simulateBracket: buffs in the breakdown", () => {
  it("home & height buffs are zero-sum and capped", () => {
    // Make one team much taller; verify height buff is equal-and-opposite, capped.
    const tall = Array.from({ length: 5 }, () => p({ height_in: 90 }));
    const short = Array.from({ length: 5 }, () => p({ height_in: 60 }));
    const teams = field(Array.from({ length: 16 }, (_, i) => 16 - i));
    teams[0] = team({ id: "TALL", name: "TALL", seedNet: 100, starters: tall });
    teams[1] = team({ id: "SHORT", name: "SHORT", seedNet: 99, starters: short });
    // Force them into the same conference + a R1 matchup is unlikely; instead just
    // check any game's breakdown obeys zero-sum + cap + home split.
    const r = simulateBracket(teams, "zk", norms());
    for (const rd of r.rounds)
      for (const s of rd)
        for (const g of s.games) {
          const ids = Object.keys(g.breakdown);
          const [a, b] = ids;
          // Height zero-sum.
          expect(g.breakdown[a].heightBuff).toBeCloseTo(-g.breakdown[b].heightBuff, 9);
          // Height capped.
          expect(Math.abs(g.breakdown[a].heightBuff)).toBeLessThanOrEqual(C.HEIGHT_CAP + 1e-9);
          // Home zero-sum: +HOME/2 and -HOME/2.
          expect(g.breakdown[a].homeBuff).toBeCloseTo(-g.breakdown[b].homeBuff, 9);
          expect(Math.abs(g.breakdown[a].homeBuff)).toBeCloseTo(C.HOME_BUFF / 2, 9);
          // adj reconstructs from the parts.
          const bd = g.breakdown[a];
          const recomputed =
            bd.seedNet + bd.gameScoreBuff + bd.heightBuff +
            bd.homeBuff - bd.fatigue - bd.recoveryCarry + bd.randomFactor;
          expect(bd.adj).toBeCloseTo(recomputed, 9);
        }
  });

  it("game-score buff is +1.5 to the pairwise winner only (0 to the loser)", () => {
    const r = simulateBracket(field(Array.from({ length: 16 }, (_, i) => i)), "k", norms());
    for (const rd of r.rounds)
      for (const s of rd) {
        const g = s.games[0];
        const vals = Object.values(g.breakdown).map((b) => b.gameScoreBuff);
        // Either one team has the buff and the other 0, or both 0 (a tie).
        const set = new Set(vals);
        expect([...set].every((v) => v === 0 || v === C.GAME_SCORE_BUFF)).toBe(true);
        const buffed = vals.filter((v) => v === C.GAME_SCORE_BUFF);
        expect(buffed.length).toBeLessThanOrEqual(1);
      }
  });

  it("seeding excludes all buffs: seedNet in the breakdown equals the input seedNet", () => {
    const teams = field(Array.from({ length: 16 }, (_, i) => i + 1));
    const r = simulateBracket(teams, "k", norms());
    const inputNet = new Map(teams.map((t) => [t.id, t.seedNet]));
    for (const rd of r.rounds)
      for (const s of rd)
        for (const g of s.games)
          for (const id of Object.keys(g.breakdown))
            expect(g.breakdown[id].seedNet).toBe(inputNet.get(id));
  });
});

describe("simulateBracket: determinism & competitive sanity", () => {
  it("same inputs + seedKey → deeply-equal BracketResult", () => {
    const mk = () => field(Array.from({ length: 16 }, (_, i) => (i * 7) % 11));
    const r1 = simulateBracket(mk(), "repro", norms());
    const r2 = simulateBracket(mk(), "repro", norms());
    expect(r2).toEqual(r1);
  });

  it("a dominant team (seedNet +15, rest 0) almost always wins the title", () => {
    let titles = 0;
    const trials = 40;
    for (let i = 0; i < trials; i++) {
      const nets = Array.from({ length: 16 }, (_, j) => (j === 0 ? 15 : 0));
      const teams = nets.map((n, j) => team({ id: `D${j}`, name: `D${j}`, seedNet: n }));
      const r = simulateBracket(teams, `seed-${i}`, norms());
      if (r.championId === "D0") titles++;
    }
    expect(titles / trials).toBeGreaterThan(0.9);
  });

  it("a flat field (~all equal) produces varied champions across fields", () => {
    // In a perfectly flat field home court is decisive (the higher seed wins
    // almost every series), and the seed line is a deterministic function of
    // seedNet → id, so a single team would always be #1 and run the table. A
    // realistic "flat" field is teams of NEAR-equal strength: tiny per-team
    // noise reshuffles which team is strongest, so the champion varies across
    // fields. (Each trial is its own 16-team field, as in real seasons.)
    const champs = new Set<string>();
    for (let i = 0; i < 30; i++) {
      // Deterministic small noise so a different team tops each field.
      const rng = mulberry32(hashSeed(`flatfield-${i}`));
      const teams = Array.from({ length: 16 }, (_, j) =>
        team({ id: `F${i}_${j}`, name: `F${j}`, seedNet: rng() * 0.5 }),
      );
      champs.add(simulateBracket(teams, `flat-${i}`, norms()).championId);
    }
    expect(champs.size).toBeGreaterThan(3);
  });
});

describe("region affinity", () => {
  const ros = (teams: string[], captainIdx: number) =>
    teams.map((t, i) => ({
      name: `p${i}`,
      team: t,
      season: 1996,
      ...(i === captainIdx ? { captain: true } : {}),
    }));

  it("scores +7 for an all-West six (captain doubled) and −7 for all-East", () => {
    const west = team({
      roster: ros(["LAL", "GSW", "DEN", "PHX", "DAL"], 0),
      sixthManInfo: { name: "s", team: "POR", season: 1996 },
    });
    expect(regionScore(west)).toBe(7); // 5 starters +1, captain +1 again, sixth +1
    const east = team({
      roster: ros(["BOS", "NYK", "MIA", "CHI", "PHI"], 0),
      sixthManInfo: { name: "s", team: "TOR", season: 1996 },
    });
    expect(regionScore(east)).toBe(-7);
  });

  it("counts the captain twice", () => {
    const capWest = team({
      roster: ros(["LAL", "BOS", "NYK", "MIA", "CHI"], 0), // captain = LAL (West)
      sixthManInfo: { name: "s", team: "ABC", season: 1996 }, // unknown → 0
    });
    // starters: +1 −1 −1 −1 −1 = −3, captain (LAL) +1 again = −2, sixth 0 = −2.
    expect(regionScore(capWest)).toBe(-2);
    const capEast = team({
      roster: ros(["BOS", "LAL", "GSW", "DEN", "PHX"], 0), // captain = BOS (East)
      sixthManInfo: { name: "s", team: "ABC", season: 1996 },
    });
    // starters: −1 +1 +1 +1 +1 = +3, captain (BOS) −1 again = +2.
    expect(regionScore(capEast)).toBe(2);
  });

  it("unknown franchises are neutral", () => {
    const neutral = team({
      roster: ros(["ABC", "XYZ", "QQQ", "ZZZ", "WWW"], 0),
      sixthManInfo: { name: "s", team: "ABC", season: 1996 },
    });
    expect(regionScore(neutral)).toBe(0);
  });

  it("the eight most-Western teams land in the West", () => {
    // 8 clearly-West teams + 8 clearly-East teams.
    const westRosters = Array.from({ length: 8 }, (_, i) =>
      team({
        id: `W${i}`,
        seedNet: i,
        roster: ros(["LAL", "GSW", "DEN", "PHX", "DAL"], 0),
        sixthManInfo: { name: "s", team: "POR", season: 1996 },
      }),
    );
    const eastRosters = Array.from({ length: 8 }, (_, i) =>
      team({
        id: `E${i}`,
        seedNet: i,
        roster: ros(["BOS", "NYK", "MIA", "CHI", "PHI"], 0),
        sixthManInfo: { name: "s", team: "TOR", season: 1996 },
      }),
    );
    const r = simulateBracket([...eastRosters, ...westRosters], "region", norms());
    const west = r.teams.filter((t) => t.conference === "West");
    const east = r.teams.filter((t) => t.conference === "East");
    expect(west).toHaveLength(8);
    expect(east).toHaveLength(8);
    expect(west.every((t) => t.id.startsWith("W"))).toBe(true);
    expect(east.every((t) => t.id.startsWith("E"))).toBe(true);
  });
});

describe("simulateBracket: per-game box scores", () => {
  const r = simulateBracket(
    field([15, 12, 9, 6, 3, 1, 0, -2, -3, -5, -7, -9, -11, -13, -15, -18]),
    "scores",
    norms(),
  );
  const allGames = r.rounds.flat().flatMap((s) => s.games);

  it("every game has a non-tied box score", () => {
    expect(allGames.length).toBeGreaterThan(0);
    for (const g of allGames) {
      expect(g.homeScore).not.toBe(g.awayScore);
    }
  });

  it("the game winner always has the higher score", () => {
    for (const g of allGames) {
      const winnerScore =
        g.winnerId === g.homeId ? g.homeScore : g.awayScore;
      const loserScore = g.winnerId === g.homeId ? g.awayScore : g.homeScore;
      expect(winnerScore).toBeGreaterThan(loserScore);
    }
  });

  it("scores sit in a believable arcade range", () => {
    for (const g of allGames) {
      expect(g.homeScore).toBeGreaterThan(70);
      expect(g.homeScore).toBeLessThan(135);
      expect(g.awayScore).toBeGreaterThan(70);
      expect(g.awayScore).toBeLessThan(135);
    }
  });

  it("the one luck draw is zero-sum: home.randomFactor === −away.randomFactor", () => {
    for (const g of allGames) {
      const hr = g.breakdown[g.homeId].randomFactor;
      const ar = g.breakdown[g.awayId].randomFactor;
      expect(hr + ar).toBeCloseTo(0, 6);
      expect(Math.abs(hr)).toBeLessThanOrEqual(C.RANDOM_FACTOR_MAX + 1e-9);
    }
  });
});
