import { query, type QueryOptions } from "./motherduck";
import { PGC, readPgCache, isCacheReady, scheduleWarmReconcile } from "./appCache";
import { eligiblePositions, positionRank } from "./positions";
import type { GameMode, PublicPlayer, SimPick, SimRosterLine } from "./types";
import type { ScoringPlayer } from "./scoring";

// All SQL lives here. Decade buckets use `season_year - (season_year % 10)`
// because DuckDB `/` is float division. Regular Season only for fairness.
// Tables are fully qualified: we connect to the "md:" workspace (read-only
// tokens can't switch the active database), so unqualified names won't resolve.
const DB = "nba_box_scores_v2.main";

// A team+decade combo must have at least this many drafted-eligible players to
// appear in the slot machine (keeps thin combos out of the rotation).
const MIN_PLAYERS_PER_COMBO = 10;

// The top-by-minutes roster a combo actually OFFERS. /api/players, the offered-id
// proof, and the Player Cards count all cap here so they agree on the visible set.
const MAX_OFFERED_PER_COMBO = 60;

// A decade must have at least this many *playable* teams before it's offered in
// rolls. Without it, a decade with only 2 qualifying teams (e.g. the 1950s:
// BOS + SYR) makes one team appear ~50% of the time. Decades auto-return once
// historical backfills make them broad enough.
const MIN_PLAYABLE_TEAMS_PER_DECADE = 8;

/** Full per-(player, team, decade) row — server-side only (carries GQ + sim inputs). */
export interface IndexedPlayer {
  entity_id: string;
  player_name: string;
  team: string;
  decade: number;
  best_season: number;
  value: number; // peak season-median Game Quality (scoring only, never sent to client)
  gp: number;
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
  tsplus: number; // era-relative true-shooting (player TS% / league TS% that season), clamped
  height_in: number; // real height in inches (default ~league avg if bio missing)
  pos: string | null; // real basketball-reference position (null → derive from box line)
  all_def: number; // All-Defensive team on best_season: 1 (1st), 2 (2nd), 0 (none)
  debut: number; // career first Regular-Season year (powers the age proxy; was a separate query)
}

/**
 * Available decades — derived from the player index so every decade we offer
 * has enough *team variety* to roll fairly. A decade qualifies only if at least
 * MIN_PLAYABLE_TEAMS_PER_DECADE teams clear MIN_PLAYERS_PER_COMBO. This excludes
 * sparse decades (the schedule has thin older seasons, e.g. the 1940s/1950s)
 * that would otherwise overrepresent their one or two qualifying teams.
 */
export async function getDecades(
  options: QueryOptions = {},
): Promise<number[]> {
  const index = await getPlayerIndex(options);
  const counts = new Map<string, number>(); // "team|decade" → player count
  for (const p of index) {
    const k = `${p.team}|${p.decade}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const playableTeams = new Map<number, number>(); // decade → # qualifying teams
  for (const [k, c] of counts) {
    if (c >= MIN_PLAYERS_PER_COMBO) {
      const decade = Number(k.split("|")[1]);
      playableTeams.set(decade, (playableTeams.get(decade) ?? 0) + 1);
    }
  }
  return [...playableTeams]
    .filter(([, teams]) => teams >= MIN_PLAYABLE_TEAMS_PER_DECADE)
    .map(([decade]) => decade)
    .sort((a, b) => a - b);
}

/** One browsable (team, decade) pair with its drafted-eligible player count. */
export interface TeamDecadeCombo {
  team: string;
  decade: number;
  count: number;
}

/**
 * Every (team, decade) combo that clears MIN_PLAYERS_PER_COMBO — the full set the
 * Player Cards browser lets you flip through. Unlike getDecades, this is NOT gated
 * on a decade having ≥ MIN_PLAYABLE_TEAMS_PER_DECADE: browsing a thin old-era combo
 * is fine (there's no random roll to skew), so every combo with a real roster shows.
 * Sorted newest decade first, then team A→Z.
 */
export async function getTeamDecadeCombos(
  options: QueryOptions = {},
): Promise<TeamDecadeCombo[]> {
  const index = await getPlayerIndex(options);
  const counts = new Map<string, number>(); // "team|decade" → player count
  for (const p of index) {
    const k = `${p.team}|${p.decade}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const combos: TeamDecadeCombo[] = [];
  for (const [k, count] of counts) {
    if (count < MIN_PLAYERS_PER_COMBO) continue;
    const [team, decade] = k.split("|");
    // Report the visible count: /api/players only serves the top
    // MAX_OFFERED_PER_COMBO by minutes, so a deeper roster mustn't advertise
    // players the browser can never show.
    combos.push({
      team,
      decade: Number(decade),
      count: Math.min(count, MAX_OFFERED_PER_COMBO),
    });
  }
  return combos.sort(
    (a, b) => b.decade - a.decade || a.team.localeCompare(b.team),
  );
}

/** Teams in a decade with enough players to be offered (≥ MIN_PLAYERS_PER_COMBO). */
export async function getPlayableTeams(
  decade: number,
  options: QueryOptions = {},
): Promise<Set<string>> {
  const index = await getPlayerIndex(options);
  const counts = new Map<string, number>();
  for (const p of index) {
    if (p.decade === decade) counts.set(p.team, (counts.get(p.team) ?? 0) + 1);
  }
  return new Set(
    [...counts].filter(([, c]) => c >= MIN_PLAYERS_PER_COMBO).map(([t]) => t),
  );
}

/** Weight = number of distinct seasons a team appears in a decade. */
export interface TeamWeight {
  team: string;
  weight: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __team_weights__: Promise<Map<number, TeamWeight[]> | null> | undefined;
}

/** Whole `team_decade_weights` table loaded once (decade → weight-desc teams).
 *  Resolves null if the cache table is missing/empty so callers fall back live. */
function getTeamWeightsCache(): Promise<Map<number, TeamWeight[]> | null> {
  if (!globalThis.__team_weights__) {
    globalThis.__team_weights__ = (async () => {
      const rows = await readPgCache<{ decade: number } & TeamWeight>(
        `SELECT decade, team, weight FROM ${PGC}.cache_team_decade_weights ORDER BY weight DESC`,
      );
      if (rows.length === 0) return null;
      const byDecade = new Map<number, TeamWeight[]>();
      for (const r of rows) {
        const list = byDecade.get(r.decade) ?? [];
        list.push({ team: r.team, weight: r.weight });
        byDecade.set(r.decade, list);
      }
      return byDecade;
    })().catch(() => null); // cache not built yet → fall back to the live query
  }
  return globalThis.__team_weights__;
}

/** Teams that appear in a decade, with a weight = number of seasons present.
 *  Served from the in-memory cache; falls back to the live view if unbuilt. */
export async function getTeamWeights(
  decade: number,
  options: QueryOptions = {},
): Promise<TeamWeight[]> {
  const cache = await getTeamWeightsCache();
  if (cache) return cache.get(decade) ?? [];
  globalThis.__team_weights__ = undefined; // null result isn't cached → retry next call
  return query<TeamWeight>(
    `SELECT b.team_abbreviation AS team,
            count(DISTINCT s.season_year) AS weight
       FROM ${DB}.box_scores b
       JOIN ${DB}.schedule s USING (game_id)
      WHERE b.period = 'FullGame'
        AND s.season_type = 'Regular Season'
        AND s.season_year - (s.season_year % 10) = $1
      GROUP BY 1
      ORDER BY weight DESC`,
    [decade],
    options,
  );
}

declare global {
  // eslint-disable-next-line no-var
  var __player_index__: Promise<IndexedPlayer[]> | undefined;
}

/**
 * Read the precomputed index from the Postgres serving cache
 * (`tournament.cache_player_index`, a fast always-warm SELECT). Falls back to
 * computing it live against the MotherDuck view if the cache is missing or empty
 * (e.g. before the first build).
 *
 * Nearly every route except /api/player funnels through here, so this is also
 * where warm globals reconcile: scheduleWarmReconcile() registers a gated
 * (≤1×/hour/process), Postgres-only check via after() that drops this process's
 * stale in-memory index when the daily cron has rebuilt the cache. It never touches
 * MotherDuck and never rebuilds — the rebuild is the cron's job.
 */
export function getPlayerIndex(
  options: QueryOptions = {},
): Promise<IndexedPlayer[]> {
  scheduleWarmReconcile();
  if (!globalThis.__player_index__) {
    globalThis.__player_index__ = (async () => {
      try {
        const rows = await readPgCache<IndexedPlayer>(
          `SELECT entity_id, player_name, team, decade, best_season, value, gp, mpg,
                  pts, reb, ast, fga, fg3a, fta, stl, blk, tov, fg3m, fgm, ftm, tsplus,
                  height_in, pos, all_def, debut
             FROM ${PGC}.cache_player_index`,
        );
        if (rows.length > 0) return rows;
      } catch {
        // cache missing → fall through to live compute
      }
      return computePlayerIndexLive(options);
    })().catch((err) => {
      globalThis.__player_index__ = undefined; // allow retry on failure
      throw err;
    });
  }
  return globalThis.__player_index__;
}

/** Compute the index from scratch (the source query the materialized table uses). */
function computePlayerIndexLive(
  options: QueryOptions = {},
): Promise<IndexedPlayer[]> {
  return query<IndexedPlayer>(
    `WITH per_season AS (
         SELECT b.entity_id, b.player_name,
                b.team_abbreviation AS team,
                s.season_year - (s.season_year % 10) AS decade,
                s.season_year,
                median(g.game_quality) AS med_gq, count(*) AS gp,
                avg(
                  try_cast(split_part(b.minutes, ':', 1) AS INTEGER)
                  + try_cast(split_part(b.minutes, ':', 2) AS INTEGER) / 60.0
                ) AS mpg,
                avg(b.points)   AS pts, avg(b.rebounds) AS reb, avg(b.assists) AS ast,
                avg(b.steals)   AS stl, avg(b.blocks)   AS blk,
                avg(b.fg_attempted)  AS fga, avg(b.fg3_attempted) AS fg3a,
                avg(b.fg3_made)      AS fg3m, avg(b.ft_attempted) AS fta,
                avg(b.fg_made)       AS fgm, avg(b.ft_made) AS ftm,
                avg(b.turnovers) AS tov
           FROM ${DB}.game_quality g
           JOIN ${DB}.box_scores b
             ON g.game_id = b.game_id AND g.entity_id = b.entity_id AND b.period = 'FullGame'
           JOIN ${DB}.schedule s ON g.game_id = s.game_id
          WHERE g.game_quality >= 0
            AND s.season_type = 'Regular Season'
          GROUP BY 1, 2, 3, 4, 5
         HAVING count(*) >= 20
       ),
       -- League true-shooting per season. Old-era absolute TS% is unreliable
       -- (incomplete box-score coverage), but a player's TS+ (his TS% over the
       -- league's, same source) is era-fair, so a 1962 volume scorer isn't
       -- penalized against a 2016 league he never played in.
       league_ts AS (
         SELECT s.season_year,
                sum(b.points) / (2 * (sum(b.fg_attempted) + 0.44 * sum(b.ft_attempted))) AS lg_ts
           FROM ${DB}.box_scores b
           JOIN ${DB}.schedule s ON b.game_id = s.game_id
          WHERE b.period = 'FullGame' AND s.season_type = 'Regular Season'
          GROUP BY 1
       ),
       -- Career first Regular-Season year per entity (powers the age proxy).
       debut_cte AS (
         SELECT b.entity_id, MIN(s.season_year) AS debut
           FROM ${DB}.box_scores b
           JOIN ${DB}.schedule s USING (game_id)
          WHERE b.period = 'FullGame' AND s.season_type = 'Regular Season'
          GROUP BY 1
       ),
       ranked AS (
         SELECT *,
                row_number() OVER (
                  PARTITION BY entity_id, team, decade ORDER BY med_gq DESC
                ) AS rn
           FROM per_season
       )
       SELECT r.entity_id, player_name, team, decade,
              r.season_year AS best_season,
              round(med_gq, 3) AS value, gp, round(mpg, 1) AS mpg,
              round(pts, 1) AS pts, round(reb, 1) AS reb, round(ast, 1) AS ast,
              round(fga, 1) AS fga, round(fg3a, 1) AS fg3a, round(fta, 1) AS fta,
              -- Era backfill: estimate stats the NBA didn't record from what it did.
              -- Steals/blocks: not tracked before 1973-74.
              round(CASE WHEN r.season_year < 1974
                    THEN 0.7 + 0.6 * greatest(0, least(1, (ast - 2) / 6.0))
                             + 0.2 * (1 - greatest(0, least(1, (reb - 4) / 8.0)))
                    ELSE stl END, 2) AS stl,
              round(CASE WHEN r.season_year < 1974
                    THEN 0.3 + 1.6 * greatest(0, least(1, (reb - 4) / 8.0))
                    ELSE blk END, 2) AS blk,
              -- Turnovers: not tracked before 1977-78. From usage + playmaking.
              round(CASE WHEN r.season_year < 1978
                    THEN 0.5 + 0.09 * (fga + 0.44 * fta) + 0.18 * ast
                    ELSE tov END, 1) AS tov,
              -- 3PM: no line before 1979-80 → estimate; 1980-99 bigs get a modest floor.
              round(CASE
                    WHEN r.season_year < 1980
                    THEN (fga * CASE WHEN reb >= 9 THEN 0.10
                                     WHEN ast >= 4.5 AND reb <= 5 THEN 0.42
                                     ELSE 0.30 END)
                         * greatest(0.22, least(0.42,
                             0.5 * (CASE WHEN fta > 0 THEN ftm / fta ELSE 0.5 END) + 0.03))
                    WHEN r.season_year < 2000 AND reb >= 9
                    THEN greatest(fg3m, fga * 0.10
                         * greatest(0.22, least(0.42,
                             0.5 * (CASE WHEN fta > 0 THEN ftm / fta ELSE 0.5 END) + 0.03)))
                    ELSE fg3m END, 1) AS fg3m,
              round(fgm, 1) AS fgm, round(ftm, 1) AS ftm,
              -- Era-relative true-shooting (TS+), clamped to a sane band so noisy
              -- old-era league denominators can't produce extreme modifiers.
              round(greatest(0.80, least(1.30,
                CASE WHEN (fga + 0.44 * fta) > 0 AND lt.lg_ts > 0
                     THEN (pts / (2 * (fga + 0.44 * fta))) / lt.lg_ts
                     ELSE 1.0 END)), 3) AS tsplus,
              -- Real height/position (b-ref) + All-Defense on the card's season.
              COALESCE(pb.height_in, 79) AS height_in,
              pb.pos AS pos,
              COALESCE(ad.all_team, 0) AS all_def,
              dc.debut AS debut
         FROM ranked r
         JOIN league_ts lt ON lt.season_year = r.season_year
         LEFT JOIN debut_cte dc ON dc.entity_id = r.entity_id
         LEFT JOIN ${DB}.player_bio pb ON pb.entity_id = r.entity_id
         LEFT JOIN ${DB}.all_defense ad ON ad.entity_id = r.entity_id AND ad.season_year = r.season_year
        WHERE rn = 1`,
    [],
    options,
  );
}

/** One season row on a player's detail card: the era-aware median Game Quality
 *  plus the nine box categories as per-game averages (FG/FT as whole percents). */
export interface PlayerSeasonRow {
  season: number;
  team: string; // the team the player logged the most games for that season
  gq: number; // median game_quality that season (0–1) — drives the chart
  usg: number; // per-game possession load (fga + 0.44·fta + tov) — the model's usage number
  gp: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  fg_pct: number;
  ft_pct: number;
  tov: number;
  fg3m: number;
  all_def: number; // All-Defensive team that season: 1 (1st) / 2 (2nd) / 0 (none)
}

/**
 * Full career-by-season history for ONE player (by entity_id): median Game Quality
 * and the nine box categories per game, season by season. Powers the Classic-mode
 * player card. Served from the `app_cache.player_season_stats` rollup (refreshed
 * daily from the era-aware view), falling back to the live view if unbuilt.
 * One row per (season, team): a player traded mid-season gets a row per team
 * stint (each ≥5 games), oldest season first and the larger stint first.
 */
export async function getPlayerSeasonHistory(
  entityId: string,
  options: QueryOptions = {},
): Promise<PlayerSeasonRow[]> {
  // Fast path: the pre-aggregated rollup (sub-ms indexed lookup). Falls back to
  // the live view if the cache isn't built yet (then it's empty for this id).
  try {
    const cached = await readPgCache<PlayerSeasonRow>(
      `SELECT season, team, gq, usg, gp, pts, reb, ast, stl, blk,
              fg_pct, ft_pct, tov, fg3m, all_def
         FROM ${PGC}.cache_player_season_stats
        WHERE entity_id = $1
        ORDER BY season, gp DESC, team`,
      [entityId],
    );
    if (cached.length > 0) return cached;
    // A built cache returning no rows means this id has no qualifying (>=5-game)
    // seasons — exactly what the live view would return — so don't pay the
    // self-join. Only fall through when the cache isn't built yet; this stops
    // random valid-format ids from bypassing the cache into the expensive view.
    if (await isCacheReady()) return cached;
  } catch {
    // cache unavailable → fall through to the live view
  }
  return query<PlayerSeasonRow>(
    `SELECT s.season_year AS season,
            b.team_abbreviation AS team,
            round(median(g.game_quality), 3) AS gq,
            round(avg(b.fg_attempted) + 0.44 * avg(b.ft_attempted) + avg(b.turnovers), 1) AS usg,
            count(*) AS gp,
            round(avg(b.points), 1)   AS pts,
            round(avg(b.rebounds), 1) AS reb,
            round(avg(b.assists), 1)  AS ast,
            round(avg(b.steals), 1)   AS stl,
            round(avg(b.blocks), 1)   AS blk,
            COALESCE(round(100.0 * sum(b.fg_made) / nullif(sum(b.fg_attempted), 0)), 0) AS fg_pct,
            COALESCE(round(100.0 * sum(b.ft_made) / nullif(sum(b.ft_attempted), 0)), 0) AS ft_pct,
            round(avg(b.turnovers), 1) AS tov,
            round(avg(b.fg3_made), 1)  AS fg3m,
            -- All-Defense is keyed by (entity, season); within a season group it's
            -- constant, so max() collapses the per-game join to that season's team.
            COALESCE(max(ad.all_team), 0) AS all_def
       FROM ${DB}.game_quality g
       JOIN ${DB}.box_scores b
         ON g.game_id = b.game_id AND g.entity_id = b.entity_id AND b.period = 'FullGame'
       JOIN ${DB}.schedule s ON g.game_id = s.game_id
       LEFT JOIN ${DB}.all_defense ad
         ON ad.entity_id = g.entity_id AND ad.season_year = s.season_year
      WHERE g.entity_id = $1
        AND g.game_quality >= 0
        AND s.season_type = 'Regular Season'
      GROUP BY 1, b.team_abbreviation
     HAVING count(*) >= 5
      ORDER BY season, gp DESC, team`,
    [entityId],
    options,
  );
}

/** Begin computing the index without blocking (used to warm the cache at game start). */
export function warmPlayerIndex(): void {
  void getPlayerIndex().catch(() => {});
}

/** Map an internal row to the client-safe DTO (drops GQ + sim-only inputs). */
function toPublic(p: IndexedPlayer, mode: GameMode): PublicPlayer {
  const classic = mode === "classic";
  return {
    entity_id: p.entity_id,
    player_name: p.player_name,
    best_season: p.best_season,
    positions: eligiblePositions(p),
    pos: p.pos ?? null, // real position label (shown in both modes)
    allDef: classic ? p.all_def : null, // award reveal — Classic only
    mpg: classic ? p.mpg : null,
    pts: classic ? p.pts : null,
    reb: classic ? p.reb : null,
    ast: classic ? p.ast : null,
    stl: classic ? p.stl : null,
    blk: classic ? p.blk : null,
  };
}

/** Public player list for a team+decade, sorted by minutes per game (GQ hidden). */
export async function getPlayers(
  team: string,
  decade: number,
  mode: GameMode,
  options: QueryOptions = {},
): Promise<PublicPlayer[]> {
  const index = await getPlayerIndex(options);
  return index
    .filter((p) => p.team === team && p.decade === decade)
    .sort((a, b) => b.mpg - a.mpg)
    .slice(0, MAX_OFFERED_PER_COMBO)
    .map((p) => toPublic(p, mode));
}

/** The entity_ids a team+decade actually OFFERS in the draft — the SAME top-60-
 *  by-minutes set getPlayers/`/api/players` returns. Used by the tournament submit
 *  to prove a pick was on the visible draft list (not a hidden/off-list player). */
export async function getOfferedIds(
  team: string,
  decade: number,
  options: QueryOptions = {},
): Promise<Set<string>> {
  const index = await getPlayerIndex(options);
  return new Set(
    index
      .filter((p) => p.team === team && p.decade === decade)
      .sort((a, b) => b.mpg - a.mpg)
      .slice(0, MAX_OFFERED_PER_COMBO)
      .map((p) => p.entity_id),
  );
}

/** One Player Cards search hit: a player on a specific browsable team+era. */
export interface PlayerComboMatch {
  entity_id: string;
  player_name: string;
  team: string;
  decade: number;
  best_season: number;
}

// Accent-fold + lowercase so "jokic" matches "Jokić" (mirrors PlayerList's filter).
const foldName = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Player-name search for the Player Cards browser. Returns the (player, team, era)
 * cards a name matches — but only where the player is actually in that combo's
 * OFFERED set (top MAX_OFFERED_PER_COMBO by minutes), so every hit links to a
 * roster the player really appears on. Ranked name-prefix first, then most recent.
 */
export async function searchPlayerCombos(
  q: string,
  options: QueryOptions = {},
): Promise<PlayerComboMatch[]> {
  const nq = foldName(q.trim());
  if (nq.length < 2) return [];
  const index = await getPlayerIndex(options);
  const matches = index.filter((p) => foldName(p.player_name).includes(nq));
  if (matches.length === 0) return [];

  // Keep only matches inside their combo's visible top-N (the roster you'd land on).
  const neededCombos = new Set(matches.map((m) => `${m.team}|${m.decade}`));
  const byCombo = new Map<string, IndexedPlayer[]>();
  for (const p of index) {
    const k = `${p.team}|${p.decade}`;
    if (!neededCombos.has(k)) continue;
    (byCombo.get(k) ?? byCombo.set(k, []).get(k)!).push(p);
  }
  const offered = new Set<string>();
  for (const [k, list] of byCombo) {
    list.sort((a, b) => b.mpg - a.mpg);
    for (const p of list.slice(0, MAX_OFFERED_PER_COMBO)) {
      offered.add(`${p.entity_id}|${k}`);
    }
  }

  return matches
    .filter((m) => offered.has(`${m.entity_id}|${m.team}|${m.decade}`))
    .sort((a, b) => {
      const aPre = foldName(a.player_name).startsWith(nq) ? 1 : 0;
      const bPre = foldName(b.player_name).startsWith(nq) ? 1 : 0;
      return (
        bPre - aPre ||
        b.best_season - a.best_season ||
        a.player_name.localeCompare(b.player_name)
      );
    })
    .slice(0, 40)
    .map((p) => ({
      entity_id: p.entity_id,
      player_name: p.player_name,
      team: p.team,
      decade: p.decade,
      best_season: p.best_season,
    }));
}

/** Decades where a team has enough players to be offered (for the decade skip). */
export async function getTeamDecades(
  team: string,
  options: QueryOptions = {},
): Promise<number[]> {
  const index = await getPlayerIndex(options);
  const counts = new Map<number, number>();
  for (const p of index) {
    if (p.team === team) counts.set(p.decade, (counts.get(p.decade) ?? 0) + 1);
  }
  return [...counts]
    .filter(([, c]) => c >= MIN_PLAYERS_PER_COMBO)
    .map(([d]) => d)
    .sort((a, b) => a - b);
}

/**
 * Hydrate a roster of (entity_id, team, decade) picks server-side into scoring
 * inputs (incl. GQ) + display lines. The client never submits stats, so it can't
 * fabricate an 82-0 season. Throws if any pick isn't a real index entry.
 */
export async function hydrateRoster(
  picks: SimPick[],
  options: QueryOptions = {},
): Promise<{
  scoring: ScoringPlayer[];
  lines: SimRosterLine[];
  players: IndexedPlayer[];
}> {
  const index = await getPlayerIndex(options);
  const byKey = new Map(
    index.map((p) => [`${p.entity_id}|${p.team}|${p.decade}`, p]),
  );
  const scoring: ScoringPlayer[] = [];
  const lines: SimRosterLine[] = [];
  const players: IndexedPlayer[] = [];
  for (const pick of picks) {
    const p = byKey.get(`${pick.entity_id}|${pick.team}|${pick.decade}`);
    if (!p) throw new Error(`unknown roster pick: ${pick.entity_id}`);
    players.push(p);
    scoring.push({
      gq: p.value, season: p.best_season, mpg: p.mpg,
      pts: p.pts, reb: p.reb, ast: p.ast, stl: p.stl, blk: p.blk,
      fga: p.fga, fg3a: p.fg3a, fg3m: p.fg3m, fta: p.fta, tov: p.tov,
      fgm: p.fgm, ftm: p.ftm,
      // Default to league-average if a stale/old index row lacks tsplus.
      tsplus: Number.isFinite(p.tsplus) ? p.tsplus : 1,
      height_in: Number.isFinite(p.height_in) ? p.height_in : 79,
      pos: p.pos ?? null,
      allDef: p.all_def ?? 0,
    });
    lines.push({
      entity_id: p.entity_id, player_name: p.player_name, team: p.team,
      best_season: p.best_season, positions: eligiblePositions(p),
      pts: p.pts, reb: p.reb, ast: p.ast,
      gq: Math.round((p.value ?? 0) * 1000) / 10, // 0–100 to one decimal, revealed only post-sim
      allDef: p.all_def ?? 0,
    });
  }
  // Display order: backcourt → frontcourt by real position (G, G-F, F, F-C, C),
  // tiebroken by lineup slot (G, FLEX, W, FLEX, B). scoring/players stay in slot
  // order — the route's per-slot eligibility check indexes them against picks.
  const orderedLines = lines
    .map((line, i) => ({ line, rank: positionRank(players[i].pos), slot: picks[i].slot }))
    .sort((a, b) => a.rank - b.rank || a.slot - b.slot)
    .map((o) => o.line);
  return { scoring, lines: orderedLines, players };
}
