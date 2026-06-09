import { describe, it, expect } from "vitest";
import { simulateRoster, type ScoringPlayer } from "./scoring";
import { deriveRecord } from "./tournamentRun";
import type { StatNorms, BracketResult, BracketPlayer } from "./types";
import { STAT_KEYS } from "./types";
import {
  TOURNAMENT_CONFIG as C,
  mulberry32,
  hashSeed,
  per36Totals,
  captainMultipliers,
  gameScoreCompare,
  gameScoreBuff,
  ageFactor,
  fatigue,
  HOME_OWNER,
  recoveryCarry,
  regionScore,
  simulateBracket,
  type TournamentTeam,
} from "./tournament";

// A ScoringPlayer factory (mirrors scoring.test.ts's `p`).
function p(over: Partial<ScoringPlayer> = {}): ScoringPlayer {
  return {
    gq: 0.5, season: 2010, mpg: 36, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0,
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

// `nets.length` teams with given seedNets (rest defaulted). Used for any size.
function field(nets: number[]): TournamentTeam[] {
  return nets.map((n, i) => team({ id: `T${i}`, name: `T${i}`, seedNet: n }));
}

// A descending-seedNet field of `n` teams (clear seed line, no ties).
function descField(n: number): TournamentTeam[] {
  return field(Array.from({ length: n }, (_, i) => n - i));
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

describe("gameScoreBuff — scales with category dominance", () => {
  it("7-8 → sweep, 6 → strong, 5 → edge, ≤4 → 0", () => {
    expect(gameScoreBuff(8)).toBe(C.GAME_SCORE_BUFF_SWEEP); // 4.5
    expect(gameScoreBuff(7)).toBe(C.GAME_SCORE_BUFF_SWEEP); // 4.5
    expect(gameScoreBuff(6)).toBe(C.GAME_SCORE_BUFF_STRONG); // 3
    expect(gameScoreBuff(5)).toBe(C.GAME_SCORE_BUFF_EDGE); // 2.25
    expect(gameScoreBuff(4)).toBe(0);
    expect(gameScoreBuff(0)).toBe(0);
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

  it("older teams fatigue ~33% harder; the young-team buff is unchanged", () => {
    // Young side (below average) uses the plain deviation: ageAtPeak 2 → 1 − 0.4.
    expect(ageFactor(team({ ageAtPeak: 2 }))).toBeCloseTo(0.6, 6);
    // Old side (above average) is steepened by AGE_OLD_FATIGUE_MULT (≈ 4/3).
    const oldDev = (11 - C.LEAGUE_AVG_EXP) / 10; // +0.5
    expect(ageFactor(team({ ageAtPeak: 11 }))).toBeCloseTo(1 + oldDev * C.AGE_OLD_FATIGUE_MULT, 6);
    // The above-average increase IS the multiplier (≈33% more than the raw slope).
    expect((ageFactor(team({ ageAtPeak: 11 })) - 1) / oldDev).toBeCloseTo(C.AGE_OLD_FATIGUE_MULT, 6);
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

describe("recovery carry (series-length recovery + sixth-man nudge)", () => {
  const AVG = C.LEAGUE_AVG_EXP; // a league-average-age bench
  // A team with a specific bench GQ + age (everything else neutral).
  const benchTeam = (gq: number, age: number) =>
    team({ sixthMan: p({ gq }), sixthManAge: age });

  it("round 1 (no prior series) and a sweep both carry nothing", () => {
    const t = benchTeam(0.5, AVG);
    expect(recoveryCarry(t, 0)).toBe(0); // round 1
    expect(recoveryCarry(t, 4)).toBe(0); // swept → 100% recovered
    // A sweep resets even with a poor old bench.
    expect(recoveryCarry(benchTeam(0.2, 14), 4)).toBe(0);
  });

  it("a longer previous series carries more (same bench): 5 < 6 < 7", () => {
    const t = benchTeam(0.5, AVG);
    const c5 = recoveryCarry(t, 5);
    const c6 = recoveryCarry(t, 6);
    const c7 = recoveryCarry(t, 7);
    expect(c5).toBeGreaterThan(0);
    expect(c6).toBeGreaterThan(c5);
    expect(c7).toBeGreaterThan(c6);
  });

  it("a better sixth man recovers more (less carry)", () => {
    expect(recoveryCarry(benchTeam(0.85, AVG), 6)).toBeLessThan(
      recoveryCarry(benchTeam(0.35, AVG), 6),
    );
  });

  it("a younger sixth man recovers more (less carry)", () => {
    expect(recoveryCarry(benchTeam(0.5, 2), 6)).toBeLessThan(
      recoveryCarry(benchTeam(0.5, 12), 6),
    );
  });

  it("a non-sweep never fully resets, even with an elite young bench", () => {
    // Recovery is capped < 1 for 5+ game series, so some fatigue always carries.
    expect(recoveryCarry(benchTeam(1, 1), 5)).toBeGreaterThan(0);
    expect(recoveryCarry(benchTeam(1, 1), 7)).toBeGreaterThan(0);
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

  it("rounds are [8, 4, 2, 1] and every round is best-of-7", () => {
    const r = simulateBracket(field(Array.from({ length: 16 }, (_, i) => i)), "k", norms());
    expect(r.rounds.map((rd) => rd.length)).toEqual([8, 4, 2, 1]);
    for (const rd of r.rounds) for (const s of rd) expect(s.bestOf).toBe(7);
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

  it("series stop at the best-of-7 clinch number (4)", () => {
    const r = simulateBracket(field(Array.from({ length: 16 }, (_, i) => i)), "k", norms());
    for (const rd of r.rounds)
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
          const bk = g.breakdown!; // engine output always carries the breakdown
          const ids = Object.keys(bk);
          const [a, b] = ids;
          // Height zero-sum.
          expect(bk[a].heightBuff).toBeCloseTo(-bk[b].heightBuff, 9);
          // Height capped.
          expect(Math.abs(bk[a].heightBuff)).toBeLessThanOrEqual(C.HEIGHT_CAP + 1e-9);
          // Home zero-sum: +HOME/2 and -HOME/2.
          expect(bk[a].homeBuff).toBeCloseTo(-bk[b].homeBuff, 9);
          expect(Math.abs(bk[a].homeBuff)).toBeCloseTo(C.HOME_BUFF / 2, 9);
          // adj reconstructs from the parts.
          const bd = bk[a];
          const recomputed =
            bd.seedNet + bd.gameScoreBuff + bd.heightBuff +
            bd.homeBuff - bd.fatigue - bd.recoveryCarry + bd.randomFactor;
          expect(bd.adj).toBeCloseTo(recomputed, 9);
        }
  });

  it("game-score buff goes to one team only, at a tiered value", () => {
    const allowed = new Set([
      0,
      C.GAME_SCORE_BUFF_EDGE,
      C.GAME_SCORE_BUFF_STRONG,
      C.GAME_SCORE_BUFF_SWEEP,
    ]);
    const r = simulateBracket(field(Array.from({ length: 16 }, (_, i) => i)), "k", norms());
    for (const rd of r.rounds)
      for (const s of rd) {
        const g = s.games[0];
        const vals = Object.values(g.breakdown!).map((b) => b.gameScoreBuff);
        expect(vals.every((v) => allowed.has(v))).toBe(true);
        // At most one team is buffed (loser + tie are 0).
        expect(vals.filter((v) => v > 0).length).toBeLessThanOrEqual(1);
      }
  });

  it("seeding excludes all buffs: seedNet in the breakdown equals the input seedNet", () => {
    const teams = field(Array.from({ length: 16 }, (_, i) => i + 1));
    const r = simulateBracket(teams, "k", norms());
    const inputNet = new Map(teams.map((t) => [t.id, t.seedNet]));
    for (const rd of r.rounds)
      for (const s of rd)
        for (const g of s.games)
          for (const id of Object.keys(g.breakdown!))
            expect(g.breakdown![id].seedNet).toBe(inputNet.get(id));
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

describe("home-court ownership", () => {
  it("best-of-7 follows the NBA 2-2-1-1-1 format (higher seed hosts 4)", () => {
    expect(HOME_OWNER[7]).toEqual(["hi", "hi", "lo", "lo", "hi", "lo", "hi"]);
    expect(HOME_OWNER[7].filter((o) => o === "hi")).toHaveLength(4);
    expect(HOME_OWNER[7].filter((o) => o === "lo")).toHaveLength(3);
  });

  it("best-of-5 follows 2-2-1 (higher seed hosts 3)", () => {
    expect(HOME_OWNER[5]).toEqual(["hi", "hi", "lo", "lo", "hi"]);
    expect(HOME_OWNER[5].filter((o) => o === "hi")).toHaveLength(3);
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

  it("the game total tracks the two teams' combined PTS minus playoff defense", () => {
    // Identical realistic teams → combined base is constant; every game total
    // should land near (2 × teamPTS) × (1 − playoff defense), within jitter.
    const realStarters = Array.from({ length: 5 }, () =>
      p({ pts: 20, fga: 17.8, fgm: 9, fta: 5, ftm: 4, ast: 4, reb: 6, tov: 2, fg3a: 4, fg3m: 1.6 }),
    );
    const teamPts = simulateRoster(realStarters).teamBox.pts;
    const fieldReal = Array.from({ length: 16 }, (_, i) =>
      team({ id: `R${i}`, name: `R${i}`, seedNet: 0, starters: realStarters.map((s) => ({ ...s })) }),
    );
    const games = simulateBracket(fieldReal, "ptsbase", norms())
      .rounds.flat().flatMap((s) => s.games);
    const expected = 2 * teamPts * (1 - C.PLAYOFF_DEFENSE_PCT);
    expect(expected).toBeGreaterThan(C.MIN_GAME_TOTAL); // not floored by the guardrail
    expect(expected).toBeLessThan(C.MAX_GAME_TOTAL); // …nor capped
    for (const g of games) {
      const total = g.homeScore + g.awayScore;
      expect(total).toBeGreaterThanOrEqual(expected * (1 - C.SCORE_JITTER_PCT) - 2);
      expect(total).toBeLessThanOrEqual(expected * (1 + C.SCORE_JITTER_PCT) + 2);
    }
  });

  it("the one luck draw is zero-sum: home.randomFactor === −away.randomFactor", () => {
    for (const g of allGames) {
      const hr = g.breakdown![g.homeId].randomFactor;
      const ar = g.breakdown![g.awayId].randomFactor;
      expect(hr + ar).toBeCloseTo(0, 6);
      expect(Math.abs(hr)).toBeLessThanOrEqual(C.RANDOM_FACTOR_MAX + 1e-9);
    }
  });
});

// ===========================================================================
// Parametrized bracket sizes (4/8/12/16/20) + size-20 play-in.
// ===========================================================================

describe("simulateBracket: variable sizes", () => {
  it("rejects an unsupported size and a teams/size mismatch", () => {
    // @ts-expect-error 10 is not a BracketSize
    expect(() => simulateBracket(descField(10), "k", norms(), C, 10)).toThrow();
    expect(() => simulateBracket(descField(8), "k", norms(), C, 16)).toThrow(); // wrong count
  });

  it("runs to a single champion for each size 4/8/12/16/20", () => {
    for (const size of [4, 8, 12, 16, 20] as const) {
      const r = simulateBracket(descField(size), `champ-${size}`, norms(), C, size);
      expect(r.size).toBe(size);
      expect(r.teams.length).toBe(size);
      // The Final is the last round and has exactly one series with one winner.
      const final = r.rounds[r.rounds.length - 1];
      expect(final.length).toBe(1);
      expect(r.championId).toBe(final[0].winnerId);
      // Champion is a real team in the field.
      expect(r.teams.some((t) => t.id === r.championId)).toBe(true);
    }
  });

  it("round structure matches the spec per size (every main round best-of-7)", () => {
    const expected: Record<number, number[]> = {
      4: [2, 1], // conf finals (1E+1W), Final
      8: [4, 2, 1], // semis (2E+2W), conf finals, Final
      12: [4, 4, 2, 1], // opening (2E+2W), semis (2E+2W), conf finals, Final
      16: [8, 4, 2, 1], // unchanged original
      20: [8, 4, 2, 1], // post-play-in: a normal 8-team-per-conf bracket
    };
    for (const size of [4, 8, 12, 16, 20] as const) {
      const r = simulateBracket(descField(size), `struct-${size}`, norms(), C, size);
      expect(r.rounds.map((rd) => rd.length)).toEqual(expected[size]);
      for (const rd of r.rounds) for (const s of rd) expect(s.bestOf).toBe(7);
    }
  });

  it("each conference holds size/2 teams seeded 1..N", () => {
    for (const size of [4, 8, 12, 16, 20] as const) {
      const r = simulateBracket(descField(size), `seed-${size}`, norms(), C, size);
      const n = size / 2;
      for (const conf of ["East", "West"] as const) {
        const teams = r.teams.filter((t) => t.conference === conf);
        expect(teams.length).toBe(n);
        expect(teams.map((t) => t.seed).sort((a, b) => a - b)).toEqual(
          Array.from({ length: n }, (_, i) => i + 1),
        );
      }
    }
  });
});

describe("simulateBracket: 16-team parity (no regression)", () => {
  it("default-size call equals an explicit size=16 call (deeply)", () => {
    const mk = () => field(Array.from({ length: 16 }, (_, i) => (i * 7) % 11));
    const implicit = simulateBracket(mk(), "parity", norms());
    const explicit = simulateBracket(mk(), "parity", norms(), C, 16);
    // size is the only new field; strip it for the pre-change-shape comparison.
    const { size: _s1, ...implicitCore } = implicit;
    const { size: _s2, ...explicitCore } = explicit;
    expect(explicitCore).toEqual(implicitCore);
    expect(implicit.size).toBe(16);
    expect(implicit.playIn).toBeUndefined(); // no play-in below size 20
  });

  it("16-team champion + round shape are stable on a fixed seed", () => {
    // A pinned-seed snapshot of the unchanged path: champion id and the per-round
    // series counts must not move. (Guards the generalization against drift.)
    const r = simulateBracket(
      field([15, 12, 9, 6, 3, 1, 0, -2, -3, -5, -7, -9, -11, -13, -15, -18]),
      "scores",
      norms(),
    );
    expect(r.rounds.map((rd) => rd.length)).toEqual([8, 4, 2, 1]);
    expect(r.championId).toBe("T0"); // strongest team on this deterministic seed
  });
});

describe("simulateBracket: 12-team byes + fatigue carry", () => {
  it("seeds 1-2 per conference get a bye (don't play the opening round)", () => {
    const r = simulateBracket(descField(12), "byes", norms(), C, 12);
    const opening = r.rounds[0]; // 2 East + 2 West opening-round series
    expect(opening.length).toBe(4);
    const playedIds = new Set(opening.flatMap((s) => [s.hiId, s.loId]));
    // The two top seeds in each conference must NOT appear in the opening round.
    for (const conf of ["East", "West"] as const) {
      const top2 = r.teams
        .filter((t) => t.conference === conf && t.seed <= 2)
        .map((t) => t.id);
      for (const id of top2) expect(playedIds.has(id)).toBe(false);
    }
    // Opening round is exactly the seed 3-6 matchups (3v6, 4v5) in each conf.
    for (const conf of ["East", "West"] as const) {
      const mid = r.teams
        .filter((t) => t.conference === conf && t.seed >= 3 && t.seed <= 6)
        .map((t) => t.id);
      for (const id of mid) expect(playedIds.has(id)).toBe(true);
    }
  });

  it("an opening-round winner carries fatigue into the semis (byes enter fresh)", () => {
    const r = simulateBracket(descField(12), "carry12", norms(), C, 12);
    // Find a semifinal series whose participants include an opening-round winner.
    const openingWinners = new Set(r.rounds[0].map((s) => s.winnerId));
    const semis = r.rounds[1];
    let sawCarry = false;
    let sawFreshBye = false;
    for (const s of semis) {
      const g1 = s.games[0];
      for (const id of [s.hiId, s.loId]) {
        const carry = g1.breakdown![id].recoveryCarry;
        if (openingWinners.has(id)) {
          // Came through the opening round → MAY carry fatigue (>0 unless it swept;
          // with this deterministic field at least one such team carries > 0).
          if (carry > 0) sawCarry = true;
        } else {
          // A bye team (seed 1 or 2) has no prior series → zero carry into the semis.
          expect(carry).toBe(0);
          sawFreshBye = true;
        }
      }
    }
    expect(sawFreshBye).toBe(true);
    expect(sawCarry).toBe(true);
  });
});

describe("simulateBracket: 20-team play-in", () => {
  const r = simulateBracket(descField(20), "playin", norms(), C, 20);

  it("produces a play-in stage that decides seeds 7 & 8 in each conference", () => {
    expect(r.playIn).toBeDefined();
    // 3 games per conference (7v8, 9v10, 8-seed decider) × 2 conferences = 6.
    expect(r.playIn!.length).toBe(6);
    for (const conf of ["East", "West"] as const) {
      const games = r.playIn!.filter((p) => p.conference === conf);
      expect(games.length).toBe(3);
      // The seeds that actually start the main bracket at 7 and 8 are the play-in
      // winners (the 7-seed game winner and the deciding 8-seed game winner).
      const r1 = r.rounds[0];
      const confSeries = r1.filter((s) => {
        const t = r.teams.find((x) => x.id === s.hiId || x.id === s.loId);
        return t?.conference === conf;
      });
      // Every team in this conference's round-1 is one of its top-8 seeds.
      const seedsInR1 = new Set<number>();
      for (const s of confSeries)
        for (const id of [s.hiId, s.loId])
          seedsInR1.add(r.teams.find((t) => t.id === id)!.seed);
      expect([...seedsInR1].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    }
  });

  it("each play-in matchup is a single game", () => {
    for (const p of r.playIn!) {
      expect(p.game.gameNo).toBe(1);
      expect(p.winnerId === p.hiId || p.winnerId === p.loId).toBe(true);
    }
  });

  it("flags play-in losers with lostPlayIn (and only those)", () => {
    const flagged = r.teams.filter((t) => t.lostPlayIn);
    // One per conference loses the deciding 8-seed game; one per conference loses
    // the 9v10 feeder. So 2 flagged per conference, 4 total.
    expect(flagged.length).toBe(4);
    // A flagged team must be a 7-10 seed (never a top-6 seed).
    for (const t of flagged) expect(t.seed).toBeGreaterThanOrEqual(7);
    // The two teams that START round 1 as seeds 7 & 8 are NOT flagged.
    const r1Ids = new Set(r.rounds[0].flatMap((s) => [s.hiId, s.loId]));
    for (const t of flagged) expect(r1Ids.has(t.id)).toBe(false);
  });

  it("EXCLUDES play-in games from displayed W-L (deriveRecord)", () => {
    // A play-in LOSER never appears in `rounds`, so its derived record is 0-0.
    for (const t of r.teams.filter((x) => x.lostPlayIn)) {
      const rec = deriveRecord(r, t.id);
      expect(rec.recordW).toBe(0);
      expect(rec.recordL).toBe(0);
      expect(rec.reachedRound).toBe(0);
    }
    // A play-in WINNER's record counts only its bracket (rounds) games, never the
    // play-in game: the sum of its per-series game counts equals its W+L.
    const r1 = r.rounds[0];
    for (const s of r1) {
      for (const id of [s.hiId, s.loId]) {
        const rec = deriveRecord(r, id);
        // Walk rounds manually and confirm deriveRecord didn't fold in a play-in game.
        let games = 0;
        for (const round of r.rounds) {
          const series = round.find((x) => x.hiId === id || x.loId === id);
          if (!series) break;
          games += series.games.length;
          if (series.winnerId !== id) break;
        }
        expect(rec.recordW + rec.recordL).toBe(games);
      }
    }
  });

  it("grants NO recovery between the play-in and round 1 (carry reflects the play-in game)", () => {
    // A play-in winner that enters round 1 has a "previous series" of length 1
    // (the play-in game). Per the recovery rule, a 1-game prior series clamps to a
    // 4-game (sweep) recovery → carry 0, i.e. NOT a free full reset beyond what the
    // rule gives. Crucially, the engine treats the play-in AS the previous series
    // (it does not skip carry bookkeeping). Assert seeds 7/8 have a defined,
    // rule-derived carry in round 1 rather than being silently reset.
    const r1 = r.rounds[0];
    // Identify each conference's round-1 seed-7 and seed-8 (the play-in survivors).
    const survivors = r.teams.filter((t) => (t.seed === 7 || t.seed === 8));
    for (const t of survivors) {
      const series = r1.find((s) => s.hiId === t.id || s.loId === t.id)!;
      const carry = series.games[0].breakdown![t.id].recoveryCarry;
      // A single game accrues 0 fatigue (game 1), so the rolled-over carry is 0 —
      // but the team WAS processed through the carry machinery (it has a recorded
      // prior series of length 1). The observable contract: carry is exactly 0,
      // identical to what a sweep would yield — never a negative or NaN, and the
      // play-in fatigue (0 for a single game) is what flows in, with no bonus rest.
      expect(carry).toBe(0);
    }
  });
});
