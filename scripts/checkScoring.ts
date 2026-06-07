/**
 * checkScoring.ts — offline sanity harness for the roster→record model
 * (lib/scoring.ts). Builds a handful of named archetype rosters from synthetic
 * but realistic per-game lines and prints net rating, the Talent/Team-fit/Defense
 * split, win total and projected tier. NO database — pure `simulateRoster`, so it
 * runs anywhere and exercises the #16 talent-scaled floor and #21 era-pace fix.
 *
 *   npx tsx scripts/checkScoring.ts
 */
import { simulateRoster, type ScoringPlayer } from "../lib/scoring";
import { tierForSeedNet } from "../lib/tier";

function p(over: Partial<ScoringPlayer>): ScoringPlayer {
  return {
    gq: 0.5, season: 2010, mpg: 36, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0,
    fga: 0, fg3a: 0, fg3m: 0, fta: 0, tov: 0, fgm: 0, ftm: 0, tsplus: 1,
    height_in: 79, pos: null, allDef: 0,
    ...over,
  };
}

// A balanced, well-spaced, ball-moving five at a given GQ (mirrors the unit test).
// 2 guards / a wing / 2 bigs, FT% > .65, real 3s, assisted, on the usage budget.
function balanced(gq: number): ScoringPlayer[] {
  return [
    p({ gq, pos: "G", ast: 8, stl: 1.5, fga: 12, fgm: 6, fta: 3, ftm: 2, tov: 2, fg3a: 5, fg3m: 2.5, reb: 3, blk: 0.2, height_in: 75 }),
    p({ gq, pos: "G", ast: 5, stl: 1.2, fga: 13, fgm: 6, fta: 3, ftm: 2, tov: 1.5, fg3a: 5, fg3m: 2.5, reb: 4, blk: 0.4, height_in: 77 }),
    p({ gq, pos: "F", ast: 4, stl: 1.0, fga: 12, fgm: 6, fta: 4, ftm: 3, tov: 1.5, fg3a: 4, fg3m: 2.0, reb: 6, blk: 0.6, height_in: 80 }),
    p({ gq, pos: "F", ast: 3, stl: 0.8, fga: 12, fgm: 6, fta: 4, ftm: 3, tov: 1.5, fg3a: 3, fg3m: 1.5, reb: 8, blk: 1.0, height_in: 82 }),
    p({ gq, pos: "C", ast: 2, stl: 0.6, fga: 11, fgm: 5, fta: 5, ftm: 4, tov: 1.5, fg3a: 2, fg3m: 1.0, reb: 11, blk: 1.8, height_in: 84 }),
  ];
}

// The screenshot case: elite talent, but five ball-dominant non-passers, bad FT
// shooters, all frontcourt (no guard), one a high-pace-era monster (Wilt '63).
function brokenSuperteam(): ScoringPlayer[] {
  const hog = (over: Partial<ScoringPlayer>) =>
    p({ gq: 0.84, ast: 1.5, stl: 0.8, fga: 24, fgm: 12, fta: 9, ftm: 5, tov: 4, fg3a: 0, fg3m: 0, reb: 10, blk: 1.2, pos: "F", height_in: 82, ...over });
  return [
    hog({ pos: "F", height_in: 81 }),
    hog({ pos: "F", height_in: 82 }),
    hog({ pos: "C", height_in: 84, reb: 13, blk: 2 }),
    hog({ pos: "F", height_in: 80 }),
    // Wilt '63: extreme volume in a 131-pace season → #21 should pull his usage down.
    hog({ gq: 0.9, season: 1963, fga: 40, fgm: 20, fta: 17, ftm: 9, reb: 24, blk: 2, pos: "C", height_in: 85 }),
  ];
}

const ROSTERS: Record<string, ScoringPlayer[]> = {
  "Dream team (GQ .92, balanced)": balanced(0.92),
  "Strong team (GQ .80, balanced)": balanced(0.8),
  "Average team (GQ .50, balanced)": balanced(0.5),
  "Weak team (GQ .42, balanced)": balanced(0.42),
  "Broken superteam (hogs/bigs/Wilt)": brokenSuperteam(),
};

const pad = (s: string, n: number) => s.padEnd(n);
const num = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(1);

console.log(
  pad("ROSTER", 36) + pad("TALENT", 8) + pad("FIT", 8) + pad("DEF", 7) +
  pad("NET", 8) + pad("RECORD", 9) + "TIER",
);
console.log("-".repeat(82));
for (const [name, roster] of Object.entries(ROSTERS)) {
  const r = simulateRoster(roster);
  const tier = tierForSeedNet(r.netRating)?.label ?? "—";
  console.log(
    pad(name, 36) +
    pad(num(r.baseNet), 8) +
    pad(num(r.teamFit), 8) +
    pad(num(r.defBuff), 7) +
    pad(num(r.netRating), 8) +
    pad(`${r.wins}-${r.losses}`, 9) +
    tier,
  );
}
