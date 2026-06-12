// ============================================================================
// Calibration harness — shared types.
//
// The harness is READ-ONLY. It replays real + synthetic tournament fields under
// named candidate configs and ranks them across three targets:
//   1. regular-season team ratings  (simulateRoster)
//   2. tournament conversion        (simulateBracket champion / reached-round)
//   3. per-game W/L behavior        (per-game adjusted-net outcomes)
//
// Nothing here mutates the DB, the schema, or the live engine. Candidate configs
// override numeric constants only — they never rewrite formulas or change the
// player-index / Game-Quality derivation.
// ============================================================================

import type { ScoringConfig } from "../scoring";
import type { ScoringPlayer } from "../scoring";
import type { TournamentConfig, BracketSize } from "../tournament";
import type { TournamentMode } from "../types";

// ── Candidate configs ────────────────────────────────────────────────────────

/** A named candidate: a set of numeric overrides off the live defaults. The
 *  overrides are PARTIAL — only the knobs that differ from SCORING_CONFIG /
 *  TOURNAMENT_CONFIG are listed; everything else stays at its current value. */
export interface CandidateConfig {
  name: string;
  description: string;
  scoringOverrides: Partial<ScoringConfig>;
  tournamentOverrides: Partial<TournamentConfig>;
}

/** A candidate with its overrides already merged onto the live defaults, ready
 *  to hand to simulateRoster / simulateBracket. */
export interface ResolvedCandidate extends CandidateConfig {
  scoring: ScoringConfig;
  tournament: TournamentConfig;
}

// ── Run options ──────────────────────────────────────────────────────────────

export interface CalibrationRunOptions {
  /** Total historical anchor brackets to replay (stratified across `modes`). */
  sampleSize: number;
  /** Synthetic archetype fields to replay per run (config-independent rosters). */
  syntheticCount: number;
  /** Deterministic seed for synthetic generation + any sampling tie-breaks. */
  seed: string;
  /** Which historical tournament pools to draw anchors from. */
  modes: TournamentMode[];
  /** Output directory for report.md + metrics.json. */
  outDir: string;
  /** Candidate names to run (resolved against the registry in configs.ts). */
  candidates: string[];
}

// ── Config-independent hydrated team + field ─────────────────────────────────

/** Per-player metadata kept for player-season / pair aggregation and the
 *  height/blocks predictor guardrails. Stats here are the player's per-game
 *  line (config-independent). */
export interface PlayerMeta {
  entity_id: string;
  name: string;
  team: string;
  season: number;
  height_in: number;
  pos: string | null;
  blk: number;
}

/** A fully hydrated team, independent of any candidate config. seedNet and the
 *  full SimResult are recomputed per-candidate at replay time (scoring overrides
 *  change them), so they are deliberately NOT stored here. */
export interface HydratedTeam {
  id: string; // "team:<uuid>" | "ghost:<id>" | "syn:<archetype>:<n>"
  name: string;
  isGhost: boolean;
  starters: ScoringPlayer[]; // exactly 5, slot order [G,FLEX,W,FLEX,B]
  sixthMan: ScoringPlayer;
  captainSlot: number;
  ageAtPeak: number;
  sixthManAge: number;
  heightTotal: number; // sum of all six real heights
  starterMeta: PlayerMeta[]; // the five starters, slot order
}

/** A field ready to replay: an ordered set of teams + a deterministic seed key
 *  and bracket size. Historical fields carry the originating mode; synthetic
 *  fields carry a per-team archetype label. */
export interface ReplayField {
  id: string; // seedKey for simulateBracket
  source: "historical" | "synthetic";
  mode?: TournamentMode;
  size: BracketSize;
  teams: ReplayTeamRef[];
}

export interface ReplayTeamRef {
  team: HydratedTeam;
  archetype?: string; // synthetic only, e.g. "frontcourt-stack"
}

// ── Metrics ──────────────────────────────────────────────────────────────────

/** A simple distribution summary. */
export interface DistStats {
  count: number;
  mean: number;
  median: number;
  p10: number;
  p90: number;
  min: number;
  max: number;
  std: number;
}

export interface Correlation {
  predictor: string;
  corr: number; // Pearson correlation of the predictor vs netRating across teams
}

export interface ArchetypeRating {
  archetype: string;
  count: number;
  meanNet: number;
  meanWins: number;
  meanSeedNet: number;
}

export interface TeamRatingMetrics {
  teamCount: number;
  wins: DistStats;
  net: DistStats;
  /** Correlation of each predictor with netRating across all rated teams. Used
   *  by the height/blocks-dominance guardrail. */
  correlations: Correlation[];
  /** Per-archetype rating means (synthetic teams only — historical teams have no
   *  archetype label). */
  archetypeDeltas: ArchetypeRating[];
}

export interface ArchetypeTournament {
  archetype: string;
  count: number; // team-appearances across replayed synthetic fields
  champRate: number; // share of appearances that won the bracket
  finalRate: number; // share that reached the final
  meanReachedRound: number;
}

export interface BucketRate {
  bucket: string;
  count: number;
  rate: number;
}

export interface TournamentMetrics {
  fieldsReplayed: number;
  reachedRoundMean: number;
  /** Per-archetype tournament conversion (synthetic fields). */
  archetypeConversion: ArchetypeTournament[];
  /** Share of champions (synthetic) whose team is a tall frontcourt stack. */
  tallStackChampShare: number;
  /** Champion rate by team-height bucket (all fields). */
  championRateByHeightBucket: BucketRate[];
}

export interface ModifierDecisive {
  modifier: string;
  decisiveGames: number;
  rate: number; // share of games whose winner flips if this modifier is zeroed
}

export interface GameMetrics {
  games: number;
  homeWinRate: number;
  /** Win rate of the team with the higher value, bucketed by the diff. */
  winRateBySeedNetDiff: BucketRate[];
  winRateByHeightDiff: BucketRate[];
  winRateByGameScoreDiff: BucketRate[];
  modifierDecisiveRates: ModifierDecisive[];
}

export interface PlayerAgg {
  entity_id: string;
  name: string;
  appearances: number; // team-appearances in replayed fields
  championAppearances: number;
  deepRunAppearances: number; // reached the final
}

export interface PairAgg {
  a: string; // entity_id
  b: string; // entity_id
  names: string;
  deepRunCount: number;
}

export interface GuardrailResult {
  key: string;
  label: string;
  value: number;
  threshold: number;
  /** Penalty subtracted from the candidate score (0 = passed cleanly). */
  penalty: number;
  passed: boolean;
  note: string;
}

export interface CalibrationMetrics {
  candidate: string;
  description: string;
  score: number;
  subScores: { teamRating: number; tournament: number; game: number };
  guardrails: GuardrailResult[];
  teamRating: TeamRatingMetrics;
  tournament: TournamentMetrics;
  game: GameMetrics;
  topPlayers: PlayerAgg[];
  topPairs: PairAgg[];
}

export interface CalibrationReport {
  runId: string;
  generatedAt: string;
  options: CalibrationRunOptions;
  historicalFields: number;
  syntheticFields: number;
  candidates: CalibrationMetrics[];
}
