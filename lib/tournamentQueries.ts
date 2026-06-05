import { randomUUID } from "node:crypto";
import { query, type QueryOptions } from "./motherduck";
import { getPlayerIndex, hydrateRoster, type IndexedPlayer } from "./queries";
import { simulateRoster, type ScoringPlayer } from "./scoring";
import { queryRW } from "./tournamentDb";
import {
  STAT_KEYS,
  type SimPick,
  type StatKey,
  type StatNorms,
} from "./types";
import type { TournamentTeam } from "./tournament";

// Tournament Edition query helpers. READS go through the existing read pool
// (lib/motherduck → lib/queries); WRITES + reads-after-write go through the RW
// pool (lib/tournamentDb). The materialized player index is cached, so the
// per-36 norms and roster re-hydration here are cheap.
const DB = "nba_box_scores_v2.main";

// A neutral years-of-experience fallback used when a player's debut season is
// unknown (the age proxy can't be computed). ~league-average career stage.
const NEUTRAL_EXP = 6;

// Minimum minutes-per-game for a player to count toward the per-36 population
// norms — filters out garbage low-minute lines that would skew mean/std.
const NORMS_MIN_MPG = 10;

// ── Stat norms (per-36 population mean + std for the captain's z-scores) ──────

declare global {
  // eslint-disable-next-line no-var
  var __stat_norms__: Promise<StatNorms> | undefined;
}

/** Per-36 value of a counting stat for one player (guarded on mpg > 0). */
function per36(stat: number, mpg: number): number {
  return mpg > 0 ? (stat * 36) / mpg : 0;
}

/** The nine per-36 / rate category values for one indexed player. */
function statValues(p: IndexedPlayer): Record<StatKey, number> {
  return {
    pts: per36(p.pts, p.mpg),
    reb: per36(p.reb, p.mpg),
    ast: per36(p.ast, p.mpg),
    stl: per36(p.stl, p.mpg),
    blk: per36(p.blk, p.mpg),
    fg3m: per36(p.fg3m, p.mpg),
    fgPct: p.fga > 0 ? p.fgm / p.fga : 0,
    ftPct: p.fta > 0 ? p.ftm / p.fta : 0,
    tov: per36(p.tov, p.mpg),
  };
}

/**
 * Population mean + std for each of the nine StatKey categories, computed in JS
 * over the cached player index (simpler than SQL and reuses the existing cache).
 * Cached behind a module global promise; cleared on failure so it can retry.
 */
export function getStatNorms(options: QueryOptions = {}): Promise<StatNorms> {
  if (!globalThis.__stat_norms__) {
    globalThis.__stat_norms__ = (async () => {
      const index = await getPlayerIndex(options);
      const pool = index.filter((p) => p.mpg >= NORMS_MIN_MPG);
      const mean = {} as Record<StatKey, number>;
      const std = {} as Record<StatKey, number>;
      const n = pool.length || 1;
      const vals = pool.map(statValues);
      for (const key of STAT_KEYS) {
        let sum = 0;
        for (const v of vals) sum += v[key];
        const m = sum / n;
        let varSum = 0;
        for (const v of vals) {
          const d = v[key] - m;
          varSum += d * d;
        }
        mean[key] = m;
        std[key] = Math.sqrt(varSum / n); // population std
      }
      return { mean, std };
    })().catch((err) => {
      globalThis.__stat_norms__ = undefined; // allow retry on failure
      throw err;
    });
  }
  return globalThis.__stat_norms__;
}

// ── Debut seasons (age proxy) ────────────────────────────────────────────────

interface DebutRow {
  entity_id: string;
  debut: number;
}

/**
 * MIN(season_year) per entity_id from box_scores → schedule (Regular Season,
 * FullGame). Powers the age proxy (ageAtPeak = best_season − debut_season) until
 * a real age/birthdate field exists. Returns a Map of entity_id → debut year.
 */
export async function getDebutSeasons(
  entityIds: string[],
  options: QueryOptions = {},
): Promise<Map<string, number>> {
  const ids = [...new Set(entityIds)].filter((id) => id);
  if (ids.length === 0) return new Map();
  const rows = await query<DebutRow>(
    `SELECT b.entity_id AS entity_id, MIN(s.season_year) AS debut
       FROM ${DB}.box_scores b
       JOIN ${DB}.schedule s USING (game_id)
      WHERE b.period = 'FullGame'
        AND s.season_type = 'Regular Season'
        AND b.entity_id = ANY($1)
      GROUP BY 1`,
    // pg serializes a JS array into a Postgres array literal for `= ANY($1)`.
    [`{${ids.map((id) => `"${id.replace(/"/g, '\\"')}"`).join(",")}}`],
    options,
  );
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.entity_id, r.debut);
  return map;
}

// ── Roster hydration (the five + the sixth man) ──────────────────────────────

/** Map an indexed player into the scoring shape (mirrors hydrateRoster). */
function toScoring(p: IndexedPlayer): ScoringPlayer {
  return {
    gq: p.value, mpg: p.mpg,
    pts: p.pts, reb: p.reb, ast: p.ast, stl: p.stl, blk: p.blk,
    fga: p.fga, fg3a: p.fg3a, fg3m: p.fg3m, fta: p.fta, tov: p.tov,
    fgm: p.fgm, ftm: p.ftm,
    tsplus: Number.isFinite(p.tsplus) ? p.tsplus : 1,
    height_in: Number.isFinite(p.height_in) ? p.height_in : 79,
    pos: p.pos ?? null,
    allDef: p.all_def ?? 0,
  };
}

export interface HydratedTournamentRoster {
  scoring: ScoringPlayer[];
  sixthMan: ScoringPlayer;
  lines: Awaited<ReturnType<typeof hydrateRoster>>["lines"];
  players: IndexedPlayer[];
  ageAtPeak: number;
  heightTotal: number;
}

/**
 * Hydrate the five starters via hydrateRoster, resolve the sixth man separately
 * from the cached index, and compute the team's ageAtPeak (average of
 * best_season − debut_season across the five, falling back to NEUTRAL_EXP when a
 * debut is missing). heightTotal is the sum of the five starters' real heights.
 */
export async function hydrateTournamentRoster(
  picks: SimPick[],
  sixthPick: { entity_id: string; team: string; decade: number },
  options: QueryOptions = {},
): Promise<HydratedTournamentRoster> {
  const { scoring, lines, players } = await hydrateRoster(picks, options);

  const index = await getPlayerIndex(options);
  const byKey = new Map(
    index.map((p) => [`${p.entity_id}|${p.team}|${p.decade}`, p]),
  );
  const sixthRow = byKey.get(
    `${sixthPick.entity_id}|${sixthPick.team}|${sixthPick.decade}`,
  );
  if (!sixthRow) {
    throw new Error(`unknown sixth-man pick: ${sixthPick.entity_id}`);
  }
  const sixthMan = toScoring(sixthRow);

  // Age proxy: average years of experience at the drafted (best) season across
  // the five starters. Missing debut → NEUTRAL_EXP.
  const debuts = await getDebutSeasons(
    players.map((p) => p.entity_id),
    options,
  );
  let expSum = 0;
  for (const p of players) {
    const debut = debuts.get(p.entity_id);
    expSum += debut ? p.best_season - debut : NEUTRAL_EXP;
  }
  const ageAtPeak = players.length > 0 ? expSum / players.length : NEUTRAL_EXP;

  const heightTotal = players.reduce(
    (acc, p) => acc + (Number.isFinite(p.height_in) ? p.height_in : 79),
    0,
  );

  return { scoring, sixthMan, lines, players, ageAtPeak, heightTotal };
}

// ── Tournament team assembly ─────────────────────────────────────────────────

export interface BuildTournamentTeamArgs {
  id: string;
  name: string;
  isGhost: boolean;
  seedNet: number;
  hydrated: HydratedTournamentRoster;
  captainSlot: number;
}

/**
 * Assemble a TournamentTeam from hydrated pieces + identity. Shared by the
 * submit route and drawOpponents so the team shape is built one way only.
 */
export function buildTournamentTeam(args: BuildTournamentTeamArgs): TournamentTeam {
  const { hydrated } = args;
  return {
    id: args.id,
    name: args.name,
    isGhost: args.isGhost,
    starters: hydrated.scoring,
    sixthMan: hydrated.sixthMan,
    captainSlot: args.captainSlot,
    ageAtPeak: hydrated.ageAtPeak,
    seedNet: args.seedNet,
  };
}

// ── Opponent / ghost drawing ─────────────────────────────────────────────────

/** Stored roster row shape (submissions and ghosts share these columns). */
interface StoredTeamRow {
  name: string;
  name_norm?: string;
  roster_json: string;
  sixth_json: string;
  captain_slot?: number;
  seed_net: number;
  ghost_id?: number;
}

type StoredSixth = { entity_id: string; team: string; decade: number };

/** Parse a stored JSON column (the pg endpoint returns JSON as a string). */
function parseJson<T>(value: unknown): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : (value as T);
}

/** Re-hydrate one stored team row into a playable TournamentTeam. */
async function hydrateStoredTeam(
  row: StoredTeamRow,
  id: string,
  isGhost: boolean,
  options: QueryOptions,
): Promise<TournamentTeam | null> {
  try {
    const picks = parseJson<SimPick[]>(row.roster_json);
    const sixth = parseJson<StoredSixth>(row.sixth_json);
    const hydrated = await hydrateTournamentRoster(picks, sixth, options);
    // Prefer the stored seed_net; recompute only if it's missing/invalid.
    const seedNet = Number.isFinite(row.seed_net)
      ? row.seed_net
      : simulateRoster(hydrated.scoring).netRating;
    return buildTournamentTeam({
      id,
      name: row.name,
      isGhost,
      seedNet,
      hydrated,
      captainSlot:
        typeof row.captain_slot === "number" ? row.captain_slot : 0,
    });
  } catch {
    // A stale/unresolvable stored roster shouldn't break the whole draw.
    return null;
  }
}

/**
 * Draw up to 15 opponents to fill a 16-team field: random real submissions from
 * the last hour (excluding the human's own name), topped up with random ghosts.
 * Each is re-hydrated through hydrateTournamentRoster so it can actually play.
 * Ids are unique: `sub:<name_norm>` / `ghost:<ghost_id>`.
 */
export async function drawOpponents(
  myNameNorm: string,
  options: QueryOptions = {},
): Promise<TournamentTeam[]> {
  const FIELD = 15;
  const subs = await queryRW<StoredTeamRow>(
    `SELECT name, name_norm, roster_json, sixth_json, captain_slot, seed_net
       FROM nba_tournament.main.submissions
      WHERE created_at >= now() - INTERVAL 1 HOUR
        AND name_norm <> $1
      ORDER BY random()
      LIMIT ${FIELD}`,
    [myNameNorm],
  );

  const teams: TournamentTeam[] = [];
  for (const row of subs) {
    const id = `sub:${row.name_norm ?? row.name}`;
    const team = await hydrateStoredTeam(row, id, false, options);
    if (team) teams.push(team);
  }

  // Top up with random ghosts.
  const need = FIELD - teams.length;
  if (need > 0) {
    const ghosts = await queryRW<StoredTeamRow>(
      `SELECT ghost_id, name, roster_json, sixth_json, seed_net
         FROM nba_tournament.main.ghosts
        ORDER BY random()
        LIMIT ${need}`,
    );
    for (const row of ghosts) {
      const id = `ghost:${row.ghost_id}`;
      const team = await hydrateStoredTeam(row, id, true, options);
      if (team) teams.push(team);
    }
  }

  return teams.slice(0, FIELD);
}

// ── Submission + tournament persistence ──────────────────────────────────────

export interface SubmissionAuthRow {
  submission_id: string;
  pin_hash: string;
  pin_salt: string;
}

/** Look up a submission by its normalized name (the app-level uniqueness gate). */
export async function findSubmissionByName(
  nameNorm: string,
): Promise<SubmissionAuthRow | null> {
  const rows = await queryRW<SubmissionAuthRow>(
    `SELECT submission_id, pin_hash, pin_salt
       FROM nba_tournament.main.submissions
      WHERE name_norm = $1
      LIMIT 1`,
    [nameNorm],
  );
  return rows[0] ?? null;
}

export interface InsertSubmissionArgs {
  name: string;
  nameNorm: string;
  pinHash: string;
  pinSalt: string;
  rosterJson: unknown;
  sixthJson: unknown;
  captainSlot: number;
  seedNet: number;
}

/**
 * Insert a submission and return its submission_id. The UUID is generated in
 * application code and passed explicitly (rather than relying on RETURNING or
 * the DEFAULT uuid()) so the id is deterministic for the caller — no dependence
 * on RETURNING semantics on the MotherDuck pg endpoint. JSON columns are passed
 * as JSON.stringify'd text params (DuckDB casts text → JSON on insert).
 */
export async function insertSubmission(
  args: InsertSubmissionArgs,
): Promise<string> {
  const submissionId = randomUUID();
  await queryRW(
    `INSERT INTO nba_tournament.main.submissions
       (submission_id, name, name_norm, pin_hash, pin_salt,
        roster_json, sixth_json, captain_slot, seed_net)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      submissionId,
      args.name,
      args.nameNorm,
      args.pinHash,
      args.pinSalt,
      JSON.stringify(args.rosterJson),
      JSON.stringify(args.sixthJson),
      args.captainSlot,
      args.seedNet,
    ],
  );
  return submissionId;
}

export interface InsertTournamentArgs {
  ownerSubmission: string;
  championName: string;
  bracketJson: unknown;
}

/** Insert a resolved tournament and return its tournament_id (app-generated). */
export async function insertTournament(
  args: InsertTournamentArgs,
): Promise<string> {
  const tournamentId = randomUUID();
  await queryRW(
    `INSERT INTO nba_tournament.main.tournaments
       (tournament_id, owner_submission, champion_name, bracket_json)
     VALUES ($1, $2, $3, $4)`,
    [
      tournamentId,
      args.ownerSubmission,
      args.championName,
      JSON.stringify(args.bracketJson),
    ],
  );
  return tournamentId;
}

/** The most recent stored bracket for a submission (for the lookup/results view). */
export async function getLatestTournamentForSubmission(
  submissionId: string,
): Promise<{ bracket_json: unknown } | null> {
  const rows = await queryRW<{ bracket_json: string }>(
    `SELECT bracket_json
       FROM nba_tournament.main.tournaments
      WHERE owner_submission = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [submissionId],
  );
  if (!rows[0]) return null;
  // The pg endpoint returns JSON columns as strings — parse before returning.
  return { bracket_json: parseJson(rows[0].bracket_json) };
}
