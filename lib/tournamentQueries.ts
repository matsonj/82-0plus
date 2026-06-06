import { randomUUID } from "node:crypto";
import { query, type QueryOptions } from "./motherduck";
import { getPlayerIndex, hydrateRoster, type IndexedPlayer } from "./queries";
import { simulateRoster, type ScoringPlayer } from "./scoring";
import { tierForSeedNet } from "./tier";
import { queryRW } from "./tournamentDb";
import {
  STAT_KEYS,
  FG_BASELINE,
  FT_BASELINE,
  type BracketPlayer,
  type TournamentMode,
  type SimPick,
  type StatKey,
  type StatNorms,
  type TournamentTeamSummary,
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

/** The nine per-36 category values for one indexed player. fgV/ftV are GQ-style
 *  volume-weighted shooting values ((pct − baseline) × per-36 attempts). */
function statValues(p: IndexedPlayer): Record<StatKey, number> {
  return {
    pts: per36(p.pts, p.mpg),
    reb: per36(p.reb, p.mpg),
    ast: per36(p.ast, p.mpg),
    stl: per36(p.stl, p.mpg),
    blk: per36(p.blk, p.mpg),
    fgV: p.fga > 0 ? (p.fgm / p.fga - FG_BASELINE) * per36(p.fga, p.mpg) : 0,
    ftV: p.fta > 0 ? (p.ftm / p.fta - FT_BASELINE) * per36(p.fta, p.mpg) : 0,
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
  // A parameterized IN (...) list — the DuckDB pg endpoint doesn't bind a
  // Postgres array literal to `= ANY($1)` reliably, so expand to $1,$2,….
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");
  const rows = await query<DebutRow>(
    `SELECT b.entity_id AS entity_id, MIN(s.season_year) AS debut
       FROM ${DB}.box_scores b
       JOIN ${DB}.schedule s USING (game_id)
      WHERE b.period = 'FullGame'
        AND s.season_type = 'Regular Season'
        AND b.entity_id IN (${placeholders})
      GROUP BY 1`,
    ids,
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
  sixthManAge: number; // sixth man's experience-at-peak (drives recovery)
  heightTotal: number;
  // Display info for the expandable team panel (names, not stats).
  starterInfo: BracketPlayer[]; // 5 starters in slot order (captain flagged later)
  sixthInfo: BracketPlayer;     // the bench player
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
  const sixthInfo: BracketPlayer = {
    name: sixthRow.player_name,
    team: sixthRow.team,
    season: sixthRow.best_season,
  };

  // Age proxy: years of experience at the drafted (best) season. Average across
  // the five starters for the team; the sixth man's own age drives recovery.
  // Missing debut → NEUTRAL_EXP.
  const debuts = await getDebutSeasons(
    [...players.map((p) => p.entity_id), sixthRow.entity_id],
    options,
  );
  const expAt = (entityId: string, bestSeason: number) => {
    const debut = debuts.get(entityId);
    return debut ? bestSeason - debut : NEUTRAL_EXP;
  };
  let expSum = 0;
  for (const p of players) expSum += expAt(p.entity_id, p.best_season);
  const ageAtPeak = players.length > 0 ? expSum / players.length : NEUTRAL_EXP;
  const sixthManAge = expAt(sixthRow.entity_id, sixthRow.best_season);

  const heightTotal = players.reduce(
    (acc, p) => acc + (Number.isFinite(p.height_in) ? p.height_in : 79),
    0,
  );

  // Starter display info in slot order (players is IndexedPlayer[] slot-ordered).
  const starterInfo: BracketPlayer[] = players.map((p) => ({
    name: p.player_name,
    team: p.team,
    season: p.best_season,
  }));

  return {
    scoring, sixthMan, lines, players, ageAtPeak, sixthManAge, heightTotal,
    starterInfo, sixthInfo,
  };
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
  // Flag the captain on the starter slot (clone — don't mutate hydrated.starterInfo).
  const roster: BracketPlayer[] = hydrated.starterInfo.map((p, i) =>
    i === args.captainSlot ? { ...p, captain: true } : p,
  );
  return {
    id: args.id,
    name: args.name,
    isGhost: args.isGhost,
    starters: hydrated.scoring,
    sixthMan: hydrated.sixthMan,
    captainSlot: args.captainSlot,
    ageAtPeak: hydrated.ageAtPeak,
    sixthManAge: hydrated.sixthManAge,
    seedNet: args.seedNet,
    roster,
    sixthManInfo: hydrated.sixthInfo,
  };
}

// ── Opponent / ghost drawing ─────────────────────────────────────────────────

/** Stored roster row shape (teams and ghosts share these columns). */
interface StoredTeamRow {
  team_id?: string;
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
 * Draw up to 15 opponents to fill a 16-team field, TIER-SEGMENTED: you face
 * teams in your own tier (see lib/tier). HUMAN teams are ALWAYS preferred — a
 * RANDOM sample of real memorialized teams from the LAST 24 HOURS in the SAME
 * MODE and SAME TIER (excluding the player's own account). Random (not
 * most-recent) so a player can't stuff their bracket with weak alt teams
 * submitted moments before. Same-tier ghosts (AI fillers) make up the shortfall;
 * if there still aren't enough, ANY ghost fills the rest so a bracket always
 * runs. Each opponent is re-hydrated so it can play. Ids are unique:
 * `team:<team_id>` / `ghost:<ghost_id>`.
 * NOTE: tier filtering happens in JS off each row's seed_net (the same
 * projection the engine seeds with), not in SQL, to keep one source of truth.
 * Alt-stuffing within a tier is still possible — per-account/IP caps would close
 * it (accepted residual).
 *
 * DAILY mode is partitioned by DATE instead of a 24h window: the human field is
 * that date's daily entries and the ghosts are that date's daily-constrained
 * ghosts (ghost_type='daily'); pass `dailyDate`. Classic/HoopIQ use the standard
 * ghost pool (ghost_type<>'daily').
 */
export async function drawOpponents(
  myNameNorm: string,
  mode: string,
  seedNet: number,
  dailyDate: string | null = null,
  options: QueryOptions = {},
  field = 15,
): Promise<TournamentTeam[]> {
  const FIELD = field;
  const isDaily = mode === "daily";
  const myTier = tierForSeedNet(seedNet)?.key ?? null;
  const sameTier = (sn: number) =>
    myTier === null || tierForSeedNet(sn)?.key === myTier;

  // Pull a generous random candidate set, then keep only same-tier teams. Daily
  // pulls a date's full pool; classic/hoopiq pull the last 24h of that mode.
  const subs = isDaily
    ? await queryRW<StoredTeamRow>(
        `SELECT t.team_id AS team_id, t.team_name AS name,
                t.roster_json AS roster_json, t.sixth_json AS sixth_json,
                t.captain_slot AS captain_slot, t.seed_net AS seed_net
           FROM nba_tournament.main.teams t
           JOIN nba_tournament.main.users u ON u.user_id = t.user_id
          WHERE t.mode = 'daily'
            AND t.daily_date = $2
            AND u.name_norm <> $1
          ORDER BY random()
          LIMIT 200`,
        [myNameNorm, dailyDate ?? ""],
      )
    : await queryRW<StoredTeamRow>(
        `SELECT t.team_id AS team_id, t.team_name AS name,
                t.roster_json AS roster_json, t.sixth_json AS sixth_json,
                t.captain_slot AS captain_slot, t.seed_net AS seed_net
           FROM nba_tournament.main.teams t
           JOIN nba_tournament.main.users u ON u.user_id = t.user_id
          WHERE t.created_at >= now() - INTERVAL 24 HOUR
            AND t.mode = $2
            AND u.name_norm <> $1
          ORDER BY random()
          LIMIT 200`,
        [myNameNorm, mode],
      );

  const teams: TournamentTeam[] = [];
  for (const row of subs) {
    if (teams.length >= FIELD) break;
    if (!sameTier(row.seed_net)) continue;
    const id = `team:${row.team_id ?? row.name_norm ?? row.name}`;
    const team = await hydrateStoredTeam(row, id, false, options);
    if (team) teams.push(team);
  }

  // Top up with ghosts: same-tier first, then any ghost as a last resort so the
  // 16-team field is always complete. Daily uses that date's daily ghosts;
  // classic/hoopiq use the standard (mode-agnostic) ghost pool.
  if (teams.length < FIELD) {
    const usedGhostIds = new Set<string>();
    const ghosts = isDaily
      ? await queryRW<StoredTeamRow>(
          `SELECT ghost_id, name, roster_json, sixth_json, seed_net
             FROM nba_tournament.main.ghosts
            WHERE ghost_type = 'daily' AND ghost_date = $1
            ORDER BY random()
            LIMIT 200`,
          [dailyDate ?? ""],
        )
      : await queryRW<StoredTeamRow>(
          `SELECT ghost_id, name, roster_json, sixth_json, seed_net
             FROM nba_tournament.main.ghosts
            WHERE COALESCE(ghost_type, 'standard') <> 'daily'
            ORDER BY random()
            LIMIT 200`,
        );
    // Two passes: same-tier ghosts, then the rest.
    for (const pass of [true, false]) {
      for (const row of ghosts) {
        if (teams.length >= FIELD) break;
        const gid = String(row.ghost_id);
        if (usedGhostIds.has(gid)) continue;
        if (pass && !sameTier(row.seed_net)) continue;
        const team = await hydrateStoredTeam(row, `ghost:${gid}`, true, options);
        if (team) {
          usedGhostIds.add(gid);
          teams.push(team);
        }
      }
    }
  }

  return teams.slice(0, FIELD);
}

// ── User + team persistence ──────────────────────────────────────────────────

export interface UserAuthRow {
  user_id: string;
  pin_hash: string;
  pin_salt: string;
}

/**
 * All accounts sharing a normalized name. Identity is the (name, PIN) PAIR — a
 * name is NOT unique, so the same name with a different PIN is a different
 * account (a 90s-arcade throwback). The caller picks the one whose PIN verifies.
 */
export async function getUsersByName(
  nameNorm: string,
): Promise<UserAuthRow[]> {
  return queryRW<UserAuthRow>(
    `SELECT user_id, pin_hash, pin_salt
       FROM nba_tournament.main.users
      WHERE name_norm = $1
      ORDER BY created_at ASC`,
    [nameNorm],
  );
}

export interface InsertUserArgs {
  name: string;
  nameNorm: string;
  pinHash: string;
  pinSalt: string;
}

/**
 * Insert a user and return its user_id. The UUID is generated in application
 * code and passed explicitly (rather than relying on RETURNING or DEFAULT
 * uuid()) so the id is deterministic for the caller — no dependence on RETURNING
 * semantics on the MotherDuck pg endpoint.
 */
export async function insertUser(args: InsertUserArgs): Promise<string> {
  const userId = randomUUID();
  await queryRW(
    `INSERT INTO nba_tournament.main.users
       (user_id, name, name_norm, pin_hash, pin_salt)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, args.name, args.nameNorm, args.pinHash, args.pinSalt],
  );
  return userId;
}

export interface InsertTeamArgs {
  teamId: string; // caller-generated (used as the bracket owner id before insert)
  userId: string;
  teamName: string; // this team's display name (franchise), distinct from the user
  mode: string; // "classic" | "hoopiq" | "daily" — segregates the bracket pool
  dailyDate?: string | null; // set for mode='daily' — partitions the pool by day
  rosterJson: unknown;
  sixthJson: unknown;
  rosterDisplay: unknown; // { roster: BracketPlayer[]; sixthMan: BracketPlayer } — names for the list
  captainSlot: number;
  seedNet: number;
  recordW: number;
  recordL: number;
  realizedMargin: number;
  reachedRound: number;
  championName: string;
  bracketJson: unknown;
}

/**
 * Insert a memorialized team. The caller supplies team_id so it can be used as
 * the bracket owner id (`team:<teamId>`) before persistence. JSON columns are
 * passed as JSON.stringify'd text params (DuckDB casts text → JSON on insert).
 */
export async function insertTeam(args: InsertTeamArgs): Promise<void> {
  await queryRW(
    `INSERT INTO nba_tournament.main.teams
       (team_id, user_id, team_name, mode, daily_date, roster_json, sixth_json, roster_display,
        captain_slot, seed_net,
        record_w, record_l, realized_margin, reached_round, champion_name, bracket_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [
      args.teamId,
      args.userId,
      args.teamName,
      args.mode,
      args.dailyDate ?? null,
      JSON.stringify(args.rosterJson),
      JSON.stringify(args.sixthJson),
      JSON.stringify(args.rosterDisplay),
      args.captainSlot,
      args.seedNet,
      args.recordW,
      args.recordL,
      args.realizedMargin,
      args.reachedRound,
      args.championName,
      JSON.stringify(args.bracketJson),
    ],
  );
}

interface TeamSummaryRow {
  team_id: string;
  team_name: string;
  mode: string;
  record_w: number;
  record_l: number;
  realized_margin: number;
  reached_round: number;
  champion_name: string;
  seed_net: number;
  daily_date: string | null;
  created_at: string | Date;
  roster_display: unknown; // { roster: BracketPlayer[]; sixthMan: BracketPlayer } | null
}

/** All memorialized teams for a user, newest first. Carries the roster display
 *  (names) so the list can reveal a roster without fetching the full bracket. */
export async function getUserTeams(
  userId: string,
): Promise<TournamentTeamSummary[]> {
  const rows = await queryRW<TeamSummaryRow>(
    `SELECT team_id, team_name, mode, record_w, record_l, realized_margin, reached_round,
            champion_name, seed_net, daily_date, created_at, roster_display
       FROM nba_tournament.main.teams
      WHERE user_id = $1
      ORDER BY created_at DESC`,
    [userId],
  );
  return rows.map((r) => {
    const rd = parseJson<{
      roster?: BracketPlayer[];
      sixthMan?: BracketPlayer;
    } | null>(r.roster_display) ?? null;
    return {
      teamId: r.team_id,
      teamName: r.team_name,
      mode: r.mode as TournamentMode,
      recordW: r.record_w,
      recordL: r.record_l,
      realizedMargin: r.realized_margin,
      reachedRound: r.reached_round,
      championName: r.champion_name,
      seedNet: Number.isFinite(r.seed_net) ? r.seed_net : 0,
      dailyDate: r.daily_date ?? null,
      createdAt:
        r.created_at instanceof Date
          ? r.created_at.toISOString()
          : new Date(r.created_at).toISOString(),
      roster: rd?.roster,
      sixthMan: rd?.sixthMan,
    };
  });
}

/** A team's stored bracket (for the public viewer + lookup detail). */
export async function getTeamBracket(
  teamId: string,
): Promise<{ bracketJson: unknown } | null> {
  const rows = await queryRW<{ bracket_json: unknown }>(
    `SELECT bracket_json
       FROM nba_tournament.main.teams
      WHERE team_id = $1
      LIMIT 1`,
    [teamId],
  );
  if (!rows[0]) return null;
  // The pg endpoint returns JSON columns as strings — parse defensively.
  return { bracketJson: parseJson(rows[0].bracket_json) };
}
