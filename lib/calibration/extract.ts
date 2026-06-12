// ============================================================================
// Replay + raw metric extraction.
//
// For one resolved candidate config:
//   - rate every UNIQUE team once with simulateRoster under the candidate's
//     scoring overrides (seedNet + the full SimResult both shift with the knobs);
//   - replay every field with simulateBracket under the candidate's tournament
//     overrides, reusing the team's recomputed seedNet for seeding;
//   - emit flat observation rows for the three targets (team rating, tournament
//     conversion, per-game W/L) plus player-season + pair aggregation.
//
// Aggregation into distributions / correlations / guardrails lives in score.ts;
// this module is the deterministic, side-effect-free replay layer (unit-testable
// on a tiny field).
// ============================================================================

import { simulateRoster } from "../scoring";
import { simulateBracket, type TournamentTeam } from "../tournament";
import { deriveRecord } from "../tournamentRun";
import type { BracketPlayer, BracketResult, GameBreakdown, StatNorms } from "../types";
import type { HydratedTeam, PlayerMeta, ReplayField } from "./types";
import type { ResolvedCandidate } from "./types";

// ── raw observation rows ─────────────────────────────────────────────────────

export interface TeamRatingRow {
  id: string;
  source: "historical" | "synthetic";
  archetype?: string;
  netRating: number;
  wins: number;
  seedNet: number;
  baseNet: number;
  teamFit: number;
  defBuff: number;
  avgHeight: number;
  blocks: number; // team per-game blocks (sum of the five)
  meanGQ: number;
  sizePen: number;
}

export interface GameRow {
  homeWon: boolean;
  seedNetAbsDiff: number;
  // `null` = no edge (the two values tied) → excluded from that bucket's rate.
  higherSeedWon: boolean | null;
  heightEdgeAbsDiff: number; // |heightBuff(home) − heightBuff(away)|
  higherHeightWon: boolean | null;
  gameScoreAbsDiff: number; // |gameScoreBuff(home) − gameScoreBuff(away)|
  higherGameScoreWon: boolean | null;
  flipMods: string[];
}

export interface TournamentRow {
  id: string;
  source: "historical" | "synthetic";
  archetype?: string;
  isChampion: boolean;
  isFinalist: boolean;
  reachedRound: number;
}

export interface PlayerAggMut {
  entity_id: string;
  name: string;
  appearances: number;
  championAppearances: number;
  deepRunAppearances: number;
}

export interface PairAggMut {
  a: string;
  b: string;
  names: string;
  deepRunCount: number;
}

export interface CandidateObservations {
  teamRatingRows: TeamRatingRow[];
  gameRows: GameRow[];
  tournamentRows: TournamentRow[];
  players: Map<string, PlayerAggMut>;
  pairs: Map<string, PairAggMut>;
  fieldsReplayed: number;
}

// Modifiers whose "decisive" frequency we test (mirrors scripts/tuneTournament).
const MODIFIERS = [
  "gameScoreBuff",
  "heightBuff",
  "homeBuff",
  "randomFactor",
  "fatigue",
  "recoveryCarry",
] as const;
type ModKey = (typeof MODIFIERS)[number];

/** Adjusted net from a breakdown (mirrors the engine's adj formula). */
function adjFrom(b: GameBreakdown): number {
  return (
    b.seedNet +
    b.gameScoreBuff +
    b.heightBuff +
    b.homeBuff -
    b.fatigue -
    b.recoveryCarry +
    b.randomFactor
  );
}

const toBracketPlayer = (m: PlayerMeta): BracketPlayer => ({
  name: m.name,
  team: m.team,
  season: m.season,
});

/** Build a TournamentTeam from a hydrated team + its candidate-recomputed seedNet.
 *  `roster` (captain flagged) and `sixthManInfo` MUST be threaded through: the
 *  engine's seeding reads them via regionScore to assign conferences by region
 *  affinity, so omitting them would bias every replayed bracket path. */
function toTournamentTeam(team: HydratedTeam, seedNet: number): TournamentTeam {
  const roster: BracketPlayer[] = team.starterMeta.map((m, i) =>
    i === team.captainSlot ? { ...toBracketPlayer(m), captain: true } : toBracketPlayer(m),
  );
  return {
    id: team.id,
    name: team.name,
    isGhost: team.isGhost,
    starters: team.starters,
    sixthMan: team.sixthMan,
    captainSlot: team.captainSlot,
    ageAtPeak: team.ageAtPeak,
    sixthManAge: team.sixthManAge,
    seedNet,
    roster,
    sixthManInfo: toBracketPlayer(team.sixthMeta),
  };
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Replay all fields under one candidate, returning flat observation rows. */
export function replayCandidate(
  candidate: ResolvedCandidate,
  fields: ReplayField[],
  norms: StatNorms,
): CandidateObservations {
  // 1) Collect unique teams (a historical team can appear in many fields).
  const uniq = new Map<
    string,
    { team: HydratedTeam; archetype?: string; source: "historical" | "synthetic" }
  >();
  for (const f of fields) {
    for (const ref of f.teams) {
      if (!uniq.has(ref.team.id)) {
        uniq.set(ref.team.id, {
          team: ref.team,
          archetype: ref.archetype,
          source: f.source,
        });
      }
    }
  }

  // 2) Rate each unique team once under the candidate's scoring config.
  const teamRatingRows: TeamRatingRow[] = [];
  const ttById = new Map<string, TournamentTeam>();
  for (const { team, archetype, source } of uniq.values()) {
    const sim = simulateRoster(team.starters, candidate.scoring);
    teamRatingRows.push({
      id: team.id,
      source,
      archetype,
      netRating: sim.netRating,
      wins: sim.wins,
      seedNet: sim.seedNet,
      baseNet: sim.baseNet,
      teamFit: sim.teamFit,
      defBuff: sim.defBuff,
      avgHeight: sim.avgHeight,
      blocks: sim.teamBox.blk,
      meanGQ: sim.meanGQ,
      sizePen: sim.sizePen,
    });
    ttById.set(team.id, toTournamentTeam(team, sim.seedNet));
  }

  // 3) Replay every field.
  const gameRows: GameRow[] = [];
  const tournamentRows: TournamentRow[] = [];
  const players = new Map<string, PlayerAggMut>();
  const pairs = new Map<string, PairAggMut>();
  let fieldsReplayed = 0;

  for (const f of fields) {
    const teams = f.teams.map((ref) => ttById.get(ref.team.id));
    if (teams.some((t) => !t)) continue;
    const bracket: BracketResult = simulateBracket(
      teams as TournamentTeam[],
      f.id,
      norms,
      candidate.tournament,
      f.size,
    );
    fieldsReplayed++;

    extractGames(bracket, gameRows);

    const totalRounds = bracket.rounds.length;
    const finalistFloor = Math.max(1, totalRounds - 1);
    for (const ref of f.teams) {
      const id = ref.team.id;
      const rec = deriveRecord(bracket, id);
      const isChampion = bracket.championId === id;
      const isFinalist = rec.reachedRound >= finalistFloor;
      tournamentRows.push({
        id,
        source: f.source,
        archetype: ref.archetype,
        isChampion,
        isFinalist,
        reachedRound: rec.reachedRound,
      });
      accumulatePlayers(ref.team, isChampion, isFinalist, players);
      if (isFinalist) accumulatePairs(ref.team, pairs);
    }
  }

  return { teamRatingRows, gameRows, tournamentRows, players, pairs, fieldsReplayed };
}

/** Walk a bracket's games and emit a GameRow per game with a full breakdown. */
function extractGames(bracket: BracketResult, out: GameRow[]): void {
  for (const round of bracket.rounds) {
    for (const series of round) {
      for (const g of series.games) {
        const hb = g.breakdown?.[g.homeId];
        const ab = g.breakdown?.[g.awayId];
        if (!hb || !ab) continue;
        const homeWon = g.winnerId === g.homeId;
        const winB = homeWon ? hb : ab;
        const loseB = homeWon ? ab : hb;

        // Decisive-modifier test: zero one modifier for BOTH teams, re-decide.
        const baseWinnerHome = adjFrom(hb) >= adjFrom(ab);
        const flipMods: string[] = [];
        for (const m of MODIFIERS) {
          const h = adjFrom({ ...hb, [m]: 0 });
          const a = adjFrom({ ...ab, [m]: 0 });
          if (h >= a !== baseWinnerHome) flipMods.push(m);
        }

        // Strict edge: a tie (equal values) is "no edge" → null, so it's excluded
        // from that bucket's rate rather than scored as a win for the winner.
        const edge = (winVal: number, loseVal: number): boolean | null =>
          winVal === loseVal ? null : winVal > loseVal;

        out.push({
          homeWon,
          seedNetAbsDiff: Math.abs(hb.seedNet - ab.seedNet),
          higherSeedWon: edge(winB.seedNet, loseB.seedNet),
          heightEdgeAbsDiff: Math.abs(hb.heightBuff - ab.heightBuff),
          higherHeightWon: edge(winB.heightBuff, loseB.heightBuff),
          gameScoreAbsDiff: Math.abs(hb.gameScoreBuff - ab.gameScoreBuff),
          higherGameScoreWon: edge(winB.gameScoreBuff, loseB.gameScoreBuff),
          flipMods,
        });
      }
    }
  }
}

function accumulatePlayers(
  team: HydratedTeam,
  isChampion: boolean,
  isFinalist: boolean,
  players: Map<string, PlayerAggMut>,
): void {
  // Keyed by player-SEASON (entity|team|season), not bare entity_id, so e.g.
  // Kareem '72 and '77 don't collapse. Sixth men count too — they play games.
  for (const m of [...team.starterMeta, team.sixthMeta]) {
    const key = `${m.entity_id}|${m.team}|${m.season}`;
    let agg = players.get(key);
    if (!agg) {
      agg = {
        entity_id: m.entity_id,
        name: `${m.name} (${m.team} '${String(m.season).slice(-2)})`,
        appearances: 0,
        championAppearances: 0,
        deepRunAppearances: 0,
      };
      players.set(key, agg);
    }
    agg.appearances++;
    if (isChampion) agg.championAppearances++;
    if (isFinalist) agg.deepRunAppearances++;
  }
}

function accumulatePairs(team: HydratedTeam, pairs: Map<string, PairAggMut>): void {
  const m = team.starterMeta;
  for (let i = 0; i < m.length; i++) {
    for (let j = i + 1; j < m.length; j++) {
      const key = pairKey(m[i].entity_id, m[j].entity_id);
      let agg = pairs.get(key);
      if (!agg) {
        agg = {
          a: m[i].entity_id,
          b: m[j].entity_id,
          names: `${m[i].name} & ${m[j].name}`,
          deepRunCount: 0,
        };
        pairs.set(key, agg);
      }
      agg.deepRunCount++;
    }
  }
}

export const DECISIVE_MODIFIERS = MODIFIERS;
