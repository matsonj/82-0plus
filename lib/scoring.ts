import type { SimResult } from "./types";
import { primaryRole, type Role } from "./positions";
import { paceAdj } from "./pace";

/** A drafted player's box line plus their era-neutral Game Quality (peak-season median). */
export interface ScoringPlayer {
  gq: number;
  season: number; // drafted season's STARTING year — drives the era pace adjustment
  mpg: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  fga: number;
  fg3a: number;
  fg3m: number;
  fta: number;
  tov: number;
  fgm: number;
  ftm: number;
  tsplus: number; // era-relative true-shooting (player TS% / league TS% that season)
  height_in: number; // real height (inches)
  pos: string | null; // real b-ref position (drives balance/eligibility; null → derived)
  allDef: number; // All-Defensive team on the drafted season: 1 (1st), 2 (2nd), 0 (none)
}

/**
 * Roster → record model. Deliberately lean: talent dominates, and only the
 * construction factors that actually shape a five-star lineup modify it.
 *
 * Talent:  Game Quality (GQ) is the core — era-neutral by construction (each
 *   player-game is ranked only against contemporaries, and now only on the box
 *   categories the NBA actually tracked that era, so old-era greats aren't
 *   penalized for missing/fabricated stats). League-average ≈ .50.
 *
 * Construction factors that shape a five-star lineup (each shown on the result
 * as a net-rating adjustment off the GQ base, so the knobs are visible):
 *     • usage      — five ball-dominant stars can't all eat; possessions are a
 *                    fixed (~100) budget, and the penalty is CONVEX in how far the
 *                    lineup runs over it, so each extra shot-hungry star costs more
 *                    net than the last — stacking shooters can't be cruised through.
 *     • outside    — floor spacing by shooting QUALITY, not era-sensitive volume:
 *                    a "non-shooter" is FT% ≤ 65% (era-neutral touch tell) OR a
 *                    genuine bad 3pt shooter (shoots 3s and hits < 30%) who ALSO
 *                    lacks FT touch — a proven FT shooter spaces the floor, so a
 *                    cold low-volume 3P stretch doesn't flag him. One is fine;
 *                    each beyond the first taxes the team (clogged paint).
 *     • ball-hog   — winning basketball moves the ball: if too few of the team's
 *                    made shots are assisted (assisted-FG% below target), a tax
 *                    hits iso-heavy stat accumulators.
 *     • balance    — by REAL position (b-ref): no true guard (no ball-handler) or
 *                    a lopsided archetype (4+ sharing one spot).
 *     • size       — total real height vs a threshold: a team that's too short
 *                    gets penalized. All-Defense players add EFFECTIVE height (a
 *                    lockdown defender plays bigger), so a switchy small-ball five
 *                    isn't dinged for size the way a soft small lineup is.
 *     • defense    — All-Defensive selections add a net-rating margin bonus (GQ
 *                    undercounts defense, so elite stoppers are buffed back up).
 *     • synergy    — a small bonus when a roster spaces, shares, doesn't overload
 *                    usage AND is balanced: good construction is rewarded, not
 *                    just un-penalized. Gated so it can't manufacture net from a
 *                    flawed roster.
 *
 * GQ is deliberately weighted so talent doesn't swamp construction — a lineup of
 * high-GQ ball-dominant non-passers should NOT cruise to 82-0.
 *
 * Wins:  wins = 41 + 2.7 × netRating (nbastuffer projected win%). 82-0 ⇒ ≈ +15.2
 *   net — reachable only by an elite core that also spaces, shares, and fits.
 *
 * Penalty floor: the construction penalties are additive and could otherwise drag
 *   an elite-talent roster to ~0 wins. The net is floored by a talent-scaled value
 *   (see FLOOR_* config) so a high-talent but poorly-built team lands in B/A rather
 *   than cratering. The floor is clamped below AA, so penalties still gate the
 *   perfect season — they just can't ruin a great team.
 */
export const SCORING_CONFIG = {
  GAMES: 82,
  AVG_GQ: 0.5,
  NET_PER_GQ: 40, // GQ→net slope (talent weight)
  WINS_PER_NET: 2.7,
  BASE_WINS: 41,

  // ── Calibration (combined-max tuning) ───────────────────────────────────────
  // The construction constants below were retuned via scripts/calibrateTournament.ts
  // to stop tall frontcourt stacks from dominating the bracket (~88% → ~31% of
  // titles) while keeping elite bigs excellent (~66 projected wins): lighter
  // size/defense reward, a heavier frontcourt tax, more creation/ball-movement
  // upside, and a looser penalty floor so construction bites a stack's SEED, not
  // just its games. Legacy (pre-calibration) values are noted inline.

  // Fit penalties, in net-rating points subtracted at their worst.
  USAGE_MAX_PEN: 20, // shot-overlap: stars must sacrifice usage to fit together
  BALLHOG_MAX_PEN: 18, // iso-heavy, low assisted-FG% (was 11 — reward ball movement)
  // Outside shooting (stepped): 0–1 non-shooters is fine, 2 hurts, 3+ is brutal.
  OUTSIDE_PEN_2: 9, // exactly two non-shooters (was 5)
  OUTSIDE_PEN_3PLUS: 26, // three or more — the paint is hopelessly clogged (was 15)

  // Archetype-balance penalties (by REAL position).
  NO_GUARD_PEN: 16, // no true ball-handler / perimeter defender (was 9)
  SKEW_PEN: 7, // per player beyond 3 sharing one position (was 3)

  // Size (total real height of the five vs a threshold). All-Defense players add
  // effective inches (they defend bigger than they measure).
  SIZE_MAX_PEN: 2, // worst-case penalty for a far-too-short lineup (was 6)
  SIZE_TARGET_TOTAL: 393, // sum of 5 heights at/above which there's no penalty (~6'7" avg)
  SIZE_FLOOR_TOTAL: 373, // sum at/below which the full penalty applies (~6'2.6" avg)
  DEF_HEIGHT_1ST: 1, // effective inches an All-Def 1st-teamer adds to team height (was 4)
  DEF_HEIGHT_2ND: 0.5, // … 2nd-teamer (was 2)

  // Defense margin bonus (GQ undercounts defense): net rating added per All-Def
  // selection on the drafted season.
  DEF_MARGIN_1ST: 0.75, // (was 1.5)
  DEF_MARGIN_2ND: 0.4, // (was 0.75)
  DEF_MARGIN_CAP: 2, // soft cap on the total defensive buff (was 5)

  // Construction synergy: a well-spaced, ball-moving, non-overloaded AND balanced
  // roster amplifies talent — the upside that lets a great team reach 82-0.
  SYNERGY_FRAC: 0.22, // up to +22% of base net rating (was 0.12)

  // Talent-scaled penalty floor. The construction penalties stack additively and
  // could otherwise drag an elite-talent roster to ~0 wins. We floor the net so a
  // high-talent but poorly-built team lands in the B/A range rather than cratering
  // — penalties knock you out of contention for a perfect season, they don't ruin
  // the team. The floor only RESCUES teams whose talent earns it (baseNet above the
  // 60-win mark); weaker rosters feel the full penalty. It is clamped below the AA
  // band so a penalized team can never reach S/AA — construction still gates the top.
  FLOOR_MIN_WINS: 60, // net at this win total is the floor's base for elite talent
  FLOOR_TALENT_SHARE: 0.3, // each net point of talent past the 60-win mark lifts the floor by this (was 0.5)
  FLOOR_MAX_WINS: 79, // the floor can never exceed the top of A tier (no floored AA/S)
  // Absolute cap on the construction ("Team fit") penalty, in net-rating points,
  // for ANY team. The talent-scaled floor above only rescues ELITE talent; this
  // backstop keeps a sub-elite-but-real roster (recognizable stars who happen to
  // fit poorly) from being cratered purely by construction. Penalties still bite
  // hard — they just can't subtract more than this much net.
  MAX_FIT_PENALTY: 24, // (was 15 — let construction bite a stack's seed, not just games)

  // Fit targets.
  POSS_BUDGET_PER_SLOT: 22, // box-scale budget: possessions (fga + 0.44·fta + tov) one
  //   slot can absorb before the per-game box totals are discounted/bumped (cosmetic).
  // Usage PENALTY budget — deliberately tighter than the box budget (~real-NBA 100
  //   possessions/game) and convex, so stacking ball-dominant shooters compounds:
  //   the 2nd/3rd shot-hungry star costs far more net than the first.
  USAGE_PEN_BUDGET_PER_SLOT: 20, // penalty kicks in past n×20 = 100 team possessions
  USAGE_FULL_OVERAGE: 0.45, // overage fraction (totalPoss/budget − 1) at which the
  //   full USAGE_MAX_PEN applies — 0.45 ⇒ ~145 possessions; quadratic ramp below it.
  USAGE_BOX_MIN: 0.6, // floor on the box usage-scale (heavy overload can't zero scoring)
  USAGE_BOX_MAX: 1.4, // cap on the box usage-scale (under-usage bump is bounded)
  ASSIST_RATE_TARGET: 0.5, // assisted-FG% at/above which the ball-hog tax is zero (was 0.55)
  // Outside-shooting (spacing) thresholds.
  FT_LIABILITY_MAX: 0.65, // FT% at/below this → non-shooter (era-neutral touch tell)
  FG3_LIABILITY_MAX: 0.3, // 3P% below this → non-shooter (only if they shoot enough 3s)
  FG3_MIN_ATTEMPTS: 1.0, // 3PA/game needed before 3P% is judged (avoids era false-flags)
  FG3_SHOOTER_FT_FLOOR: 0.72, // FT% at/above this proves real shooting touch, so a cold
  //   low-volume 3P% doesn't brand a good shooter (Wilkins/Majerle) a non-shooter.
} as const;

// The runtime default above is `as const` (narrow literal types), but the
// calibration harness needs to override individual numeric knobs. Widen every
// numeric field to `number` so a candidate config (`{...SCORING_CONFIG, X: y}`)
// type-checks, without touching the frozen runtime default.
export type ScoringConfig = {
  -readonly [K in keyof typeof SCORING_CONFIG]: (typeof SCORING_CONFIG)[K] extends number
    ? number
    : (typeof SCORING_CONFIG)[K];
};

const clamp = (x: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, x));
const round1 = (x: number) => Math.round(x * 10) / 10;
const round2 = (x: number) => Math.round(x * 100) / 100;
// Whole-integer percentage from summed makes / summed attempts (attempt-weighted).
const pctOf = (made: number, att: number) =>
  att > 0 ? Math.round((100 * made) / att) : 0;

/** Net rating that, alone, would project to a perfect season. */
export function netRatingForPerfect(cfg: ScoringConfig = SCORING_CONFIG): number {
  return (cfg.GAMES - cfg.BASE_WINS) / cfg.WINS_PER_NET; // 41 / 2.7 ≈ 15.2
}

export function simulateRoster(
  roster: ScoringPlayer[],
  cfg: ScoringConfig = SCORING_CONFIG,
): SimResult {
  const n = roster.length;
  if (n === 0) {
    return {
      wins: 0, losses: cfg.GAMES, perfect: false, seedNet: 0, netRating: 0, baseNet: 0, teamFit: 0, meanGQ: 0,
      pf: 0, pa: 0,
      usageFactor: 1, assistFactor: 1, nonShooters: 0,
      totalAst: 0, assistedPct: 0,
      usagePen: 0, outsidePen: 0, ballhogPen: 0, balancePen: 0, synergyBonus: 0,
      sizePen: 0, defBuff: 0, avgHeight: 0, allDefCount: 0,
      roleCounts: { G: 0, W: 0, B: 0 },
      totalPoss: 0,
      teamBox: { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fgPct: 0, ftPct: 0, tov: 0, fg3m: 0 },
    };
  }

  const sum = (f: (p: ScoringPlayer) => number) =>
    roster.reduce((acc, p) => acc + f(p), 0);
  // Era-relative possessions: a player's box possessions are scaled to a reference
  // pace by season, so high-pace-era stars (Wilt's 39-FGA years) aren't punished on
  // usage for an era where everyone shot more. See lib/pace.ts.
  const poss = (p: ScoringPlayer) =>
    (p.fga + 0.44 * p.fta + p.tov) * paceAdj(p.season);

  const meanGQ = sum((p) => p.gq) / n;
  const totalPoss = sum(poss);
  const totalAst = sum((p) => p.ast);
  const totalFgm = sum((p) => p.fgm);

  // Era-neutral team quality → base net rating (before construction adjustments).
  const baseNet = cfg.NET_PER_GQ * (meanGQ - cfg.AVG_GQ);

  // Fit factors in [0, 1] (1 = no problem).
  const usageRatio =
    totalPoss > 0 ? (n * cfg.POSS_BUDGET_PER_SLOT) / totalPoss : 1;
  // Penalty/synergy only care about OVER-budget overlap (capped at 1).
  const usageFactor = Math.min(1, usageRatio);
  // The box uses the uncapped ratio (clamped): >1 bumps an under-used lineup's
  // scoring up to fill the spare possessions, <1 discounts an overloaded one.
  const usageScale = clamp(usageRatio, cfg.USAGE_BOX_MIN, cfg.USAGE_BOX_MAX);

  // Outside shooting: count "non-shooters" by quality. FT% ≤ threshold is the
  // era-neutral touch tell; a bad 3P% only counts if the player actually shoots
  // 3s (so old-era players with 0 attempts aren't false-flagged). One non-shooter
  // is fine; each one beyond the first taxes the team (paint gets clogged).
  const isNonShooter = (p: ScoringPlayer) => {
    const ftPct = p.fta >= 1 ? p.ftm / p.fta : 1; // assume touch when there's no FT data
    return (
      ftPct <= cfg.FT_LIABILITY_MAX ||
      // A genuine bad 3pt shooter — BUT a proven FT shooter has the touch to space
      // the floor, so good FT% exempts the 3pt-liability flag. A low-volume cold 3P
      // stretch shouldn't brand a real shooter (Wilkins/Majerle) a paint-clogger.
      (p.fg3a >= cfg.FG3_MIN_ATTEMPTS &&
        p.fg3m / p.fg3a < cfg.FG3_LIABILITY_MAX &&
        ftPct < cfg.FG3_SHOOTER_FT_FLOOR)
    );
  };
  const nonShooters = roster.reduce((c, p) => c + (isNonShooter(p) ? 1 : 0), 0);
  const outsidePen =
    nonShooters >= 3
      ? cfg.OUTSIDE_PEN_3PLUS
      : nonShooters === 2
        ? cfg.OUTSIDE_PEN_2
        : 0;
  const shootFactor = nonShooters <= 1 ? 1 : 0; // synergy needs ≤1 non-shooter

  // Ball movement: share of made FGs that were assisted. Below target → ball-hog
  // tax on iso-heavy stat accumulators who don't play winning basketball.
  const assistedPct = totalFgm > 0 ? Math.min(1, totalAst / totalFgm) : 0;
  const assistFactor = clamp(assistedPct / cfg.ASSIST_RATE_TARGET, 0, 1);

  // Usage penalty: convex in how far the lineup's combined possessions run OVER a
  // tighter, real-NBA budget (n × USAGE_PEN_BUDGET_PER_SLOT ≈ 100). A small overage
  // barely registers; a roster of ball-dominant shooters compounds quadratically up
  // to USAGE_MAX_PEN at USAGE_FULL_OVERAGE over budget. (The box-score usage scale
  // above keeps its own, looser POSS_BUDGET_PER_SLOT — that's cosmetic, not net.)
  const penBudget = n * cfg.USAGE_PEN_BUDGET_PER_SLOT;
  const usageOverage =
    totalPoss > 0 ? Math.max(0, totalPoss / penBudget - 1) : 0;
  const usagePen =
    cfg.USAGE_MAX_PEN *
    Math.min(1, (usageOverage / cfg.USAGE_FULL_OVERAGE) ** 2);
  const ballhogPen = cfg.BALLHOG_MAX_PEN * (1 - assistFactor);

  // Archetype balance by REAL position.
  const roleCounts = { G: 0, W: 0, B: 0 } as Record<Role, number>;
  for (const p of roster) roleCounts[primaryRole(p)] += 1;
  let balancePen = 0;
  if (roleCounts.G === 0) balancePen += cfg.NO_GUARD_PEN;
  const maxRole = Math.max(roleCounts.G, roleCounts.W, roleCounts.B);
  if (maxRole > 3) balancePen += cfg.SKEW_PEN * (maxRole - 3);

  // All-Defense: count selections on each drafted season.
  const n1st = roster.reduce((c, p) => c + (p.allDef === 1 ? 1 : 0), 0);
  const n2nd = roster.reduce((c, p) => c + (p.allDef === 2 ? 1 : 0), 0);
  const allDefCount = n1st + n2nd;

  // Size: total real height, with All-Defense players adding effective inches
  // (a stopper defends bigger than he measures). Too short → penalty.
  const heightTotal = sum((p) => p.height_in);
  const effectiveHeight =
    heightTotal + cfg.DEF_HEIGHT_1ST * n1st + cfg.DEF_HEIGHT_2ND * n2nd;
  const sizePen =
    cfg.SIZE_MAX_PEN *
    clamp(
      (cfg.SIZE_TARGET_TOTAL - effectiveHeight) /
        (cfg.SIZE_TARGET_TOTAL - cfg.SIZE_FLOOR_TOTAL),
      0,
      1,
    );

  // Defense margin bonus: GQ undercounts defense, so All-Def selections buff net.
  const defBuff = Math.min(
    cfg.DEF_MARGIN_CAP,
    cfg.DEF_MARGIN_1ST * n1st + cfg.DEF_MARGIN_2ND * n2nd,
  );

  // Synergy rewards a well-spaced, ball-moving, non-overloaded AND balanced
  // roster, scaled by talent — the only way to clear the bar for a perfect season.
  const fitRamp = Math.min(usageFactor, shootFactor, assistFactor);
  const synergyBonus =
    baseNet > 0 && balancePen === 0
      ? baseNet * cfg.SYNERGY_FRAC * fitRamp
      : 0;

  const rawNet =
    baseNet - usagePen - outsidePen - ballhogPen - balancePen - sizePen +
    defBuff + synergyBonus;

  // Talent-scaled floor: only elite-talent rosters (baseNet above the 60-win net)
  // are rescued, and only up to the top of A tier — so penalties still cost the
  // perfect season but can't ruin a great team.
  const netFor = (w: number) => (w - cfg.BASE_WINS) / cfg.WINS_PER_NET;
  const net60 = netFor(cfg.FLOOR_MIN_WINS);
  const netFloor =
    baseNet > net60
      ? Math.min(
          net60 + cfg.FLOOR_TALENT_SHARE * (baseNet - net60),
          netFor(cfg.FLOOR_MAX_WINS),
        )
      : -Infinity;
  // Absolute backstop (applies to EVERY team, not just elite talent): the
  // construction penalties can subtract at most MAX_FIT_PENALTY net. defBuff is a
  // talent/defense credit, not construction, so it sits outside the cap.
  const fitFloor = baseNet + defBuff - cfg.MAX_FIT_PENALTY;
  const netRating = Math.max(rawNet, netFloor, fitFloor);
  // Everything that isn't talent or the defensive margin buff, as one number — the
  // "Team fit" line shown on the result (negative when construction hurt the team,
  // positive when synergy + good fit helped). Reflects the floor.
  const teamFit = netRating - baseNet - defBuff;

  const wins = clamp(
    Math.round(cfg.BASE_WINS + cfg.WINS_PER_NET * netRating),
    0,
    cfg.GAMES,
  );

  // Minutes-extrapolated team box. Each starter's per-game line is taken per-36
  // and scaled to a full position: 36 starter minutes + the remaining 12 covered
  // by a bench player at 50% (= 6 effective minutes) → stat × 42 / mpg. Summed
  // across the five, this is a full-team per-game line; FG%/FT% derive from the
  // same minutes-weighted makes/attempts (the ×42 cancels in the ratio).
  //
  // Possession-consuming stats (scoring, assists, turnovers) are then scaled by
  // usageScale: an overloaded lineup of ball-dominant stars only realizes a
  // fraction of its combined shot diet, while an under-used lineup fills the
  // spare possessions and bumps up. Rebounds/steals/blocks aren't usage-
  // constrained, so they're left whole; FG%/FT% are unchanged (the scale would
  // cancel in the ratio, so it isn't applied to makes/attempts).
  const EFF_MIN = 42;
  const ext = (f: (p: ScoringPlayer) => number) =>
    roster.reduce((a, p) => a + (p.mpg > 0 ? (f(p) * EFF_MIN) / p.mpg : 0), 0);
  const u = usageScale;
  const teamBox = {
    pts: Math.round(ext((p) => p.pts) * u),
    reb: Math.round(ext((p) => p.reb)),
    ast: Math.round(ext((p) => p.ast) * u),
    stl: Math.round(ext((p) => p.stl)),
    blk: Math.round(ext((p) => p.blk)),
    fgPct: pctOf(ext((p) => p.fgm), ext((p) => p.fga)),
    ftPct: pctOf(ext((p) => p.ftm), ext((p) => p.fta)),
    tov: Math.round(ext((p) => p.tov) * u),
    fg3m: Math.round(ext((p) => p.fg3m) * u),
  };

  const displayNetRating = round1(netRating);

  return {
    wins,
    losses: cfg.GAMES - wins,
    perfect: wins === cfg.GAMES,
    seedNet: netRating,
    netRating: displayNetRating,
    baseNet: round1(baseNet),
    teamFit: round1(teamFit),
    meanGQ: Math.round(meanGQ * 1000) / 1000,
    pf: teamBox.pts,
    // Reconcile the implied scoreline with the DISPLAYED (rounded) net so that
    // pf − pa always equals the net rating shown on the card.
    pa: Math.round(teamBox.pts - displayNetRating),
    usageFactor: round2(usageFactor),
    assistFactor: round2(assistFactor),
    nonShooters,
    totalAst: round1(totalAst),
    assistedPct: round2(assistedPct),
    usagePen: round1(usagePen),
    outsidePen: round1(outsidePen),
    ballhogPen: round1(ballhogPen),
    balancePen: round1(balancePen),
    synergyBonus: round1(synergyBonus),
    sizePen: round1(sizePen),
    defBuff: round1(defBuff),
    avgHeight: Math.round(heightTotal / n),
    allDefCount,
    roleCounts,
    totalPoss: round1(totalPoss),
    teamBox,
  };
}
