import "server-only";
import { queryTournamentRO } from "./tournamentReadDb";
import type {
  BracketPlayer,
  TournamentMode,
  TournamentTeamSummary,
} from "./types";
import type { UserAuthRow } from "./tournamentQueries";

// READ-ONLY tournament queries for the PUBLIC, no-PIN paths
// (/api/tournament/{bracket,team,lookup}). These run on the DEDICATED low-privilege
// tournament RO token/pool (lib/tournamentReadDb) — NOT the high-privilege RW pool
// and NOT the app-wide read token that serves anonymous NBA data — and they never
// run schema DDL. The tournament tables are exposed to that RO token via a
// MotherDuck share attached as `nba_tournament` (override with TOURNAMENT_RO_DB if
// attached under a different alias). An auto-updating share lags writes by ~1 min,
// acceptable for share-link / returning-player reads.
//
// These are deliberate read-pool TWINS of the queryRW versions in
// lib/tournamentQueries.ts — the write paths there are unchanged.

const RO_DB = `${process.env.TOURNAMENT_RO_DB ?? "nba_tournament"}.main`;

function parseJson<T>(value: unknown): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : (value as T);
}

/** Accounts sharing a normalized name (for PIN verification in lookup). */
export async function getUsersByNameRO(
  nameNorm: string,
): Promise<UserAuthRow[]> {
  return queryTournamentRO<UserAuthRow>(
    `SELECT user_id, pin_hash, pin_salt
       FROM ${RO_DB}.users
      WHERE name_norm = $1
      ORDER BY created_at ASC`,
    [nameNorm],
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
  roster_display: unknown;
  season_w: number | null; // actual reg-season wins (daily only, via daily_results)
  season_l: number | null;
  daily_rank: number | null; // 1-based leaderboard rank for that date (daily only)
  daily_field: number | null; // total entries that date (daily only)
}

// Starter-set signature from a JSON roster array at `path` — sorted
// "name|team|season" keys, so two rosters compare equal regardless of slot order.
// Mirrors the signature in listDailyResults so the dedup here matches the
// champion-credit logic there. teams.roster_display nests under $.roster[*];
// daily_results.roster_json is a bare array ($[*]).
function rosterSig(col: string, path: string): string {
  return `list_sort([json_extract_string(e, '$.name') || '|' ||
                     json_extract_string(e, '$.team') || '|' ||
                     json_extract_string(e, '$.season')
                     FOR e IN json_extract(${col}, '${path}')])`;
}

/** All memorialized teams for a user, newest first (the public "My Teams" list).
 *
 *  Two sources, unioned:
 *   1. ENTERED teams from `teams` (any mode). The daily_results join surfaces the
 *      actual 82-game record for daily teams.
 *   2. Un-entered DAILY COMPLETIONS from `daily_results` that have no matching
 *      entered team — synthesized as didn't-enter daily rows (record 0–0,
 *      reached_round 0) so a daily you played but never ran through a bracket
 *      still appears in My Teams (the empty-state literally promises this).
 *      Dedup is by roster signature (same rule as listDailyResults' champion
 *      credit): a completion whose five match an entered daily team for that date
 *      is already represented by that richer entry, so it's skipped.
 *
 *  NOTE: this deliberately DIVERGES from the RW twin getUserTeams, which stays
 *  entered-only — its sole caller (/api/daily/share) does .find() for an ENTERED
 *  daily team and must not pick up a 0–0 completion. Synthesized rows carry a
 *  'daily:<date>' team_id (no real bracket); the lookup UI routes their click to
 *  /d/<date> instead of the bracket viewer. */
export async function getUserTeamsRO(
  userId: string,
): Promise<TournamentTeamSummary[]> {
  const rows = await queryTournamentRO<TeamSummaryRow>(
    `SELECT CAST(t.team_id AS VARCHAR) AS team_id, t.team_name, t.mode,
            t.record_w, t.record_l, t.realized_margin,
            t.reached_round, t.champion_name, t.seed_net, t.daily_date, t.created_at,
            t.roster_display, dr.wins AS season_w, dr.losses AS season_l,
            CASE WHEN t.mode = 'daily' AND dr.wins IS NOT NULL THEN
              (SELECT COUNT(*) FROM ${RO_DB}.daily_results o
                 WHERE o.daily_date = t.daily_date
                   AND (o.wins > dr.wins
                        OR (o.wins = dr.wins AND o.margin > dr.margin))) + 1
            END AS daily_rank,
            CASE WHEN t.mode = 'daily' AND dr.wins IS NOT NULL THEN
              (SELECT COUNT(*) FROM ${RO_DB}.daily_results
                 WHERE daily_date = t.daily_date)
            END AS daily_field
       FROM ${RO_DB}.teams t
       LEFT JOIN ${RO_DB}.daily_results dr
         ON dr.user_id = t.user_id AND dr.daily_date = t.daily_date
      WHERE t.user_id = $1
     UNION ALL BY NAME
     SELECT 'daily:' || dr.daily_date AS team_id,
            'Daily Challenge' AS team_name,
            'daily' AS mode,
            0 AS record_w, 0 AS record_l, CAST(0 AS DOUBLE) AS realized_margin,
            0 AS reached_round, '' AS champion_name,
            dr.margin AS seed_net, dr.daily_date AS daily_date, dr.created_at AS created_at,
            json_object('roster', dr.roster_json) AS roster_display,
            dr.wins AS season_w, dr.losses AS season_l,
            (SELECT COUNT(*) FROM ${RO_DB}.daily_results o
               WHERE o.daily_date = dr.daily_date
                 AND (o.wins > dr.wins
                      OR (o.wins = dr.wins AND o.margin > dr.margin))) + 1 AS daily_rank,
            (SELECT COUNT(*) FROM ${RO_DB}.daily_results
               WHERE daily_date = dr.daily_date) AS daily_field
       FROM ${RO_DB}.daily_results dr
      WHERE dr.user_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM ${RO_DB}.teams t2
           WHERE t2.user_id = dr.user_id
             AND t2.daily_date = dr.daily_date
             AND t2.mode = 'daily'
             AND ${rosterSig("t2.roster_display", "$.roster[*]")}
               = ${rosterSig("dr.roster_json", "$[*]")}
        )
      ORDER BY created_at DESC`,
    [userId],
  );
  return rows.map((r) => {
    const rd =
      parseJson<{ roster?: BracketPlayer[]; sixthMan?: BracketPlayer } | null>(
        r.roster_display,
      ) ?? null;
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
      seasonW: r.season_w ?? null,
      seasonL: r.season_l ?? null,
      dailyDate: r.daily_date ?? null,
      dailyRank: r.daily_rank != null ? Number(r.daily_rank) : null,
      dailyFieldSize: r.daily_field != null ? Number(r.daily_field) : null,
      createdAt:
        r.created_at instanceof Date
          ? r.created_at.toISOString()
          : new Date(r.created_at).toISOString(),
      roster: rd?.roster,
      sixthMan: rd?.sixthMan,
    };
  });
}

/** A team's stored bracket + box (public team viewer). */
export async function getTeamBracketRO(
  teamId: string,
): Promise<{ bracketJson: unknown; teamBox: unknown; realizedMargin: number } | null> {
  const rows = await queryTournamentRO<{
    bracket_json: unknown;
    team_box_json: unknown;
    realized_margin: number;
  }>(
    `SELECT bracket_json, team_box_json, realized_margin
       FROM ${RO_DB}.teams
      WHERE team_id = $1
      LIMIT 1`,
    [teamId],
  );
  if (!rows[0]) return null;
  return {
    bracketJson: parseJson(rows[0].bracket_json),
    teamBox: rows[0].team_box_json == null ? null : parseJson(rows[0].team_box_json),
    realizedMargin: rows[0].realized_margin ?? 0,
  };
}

/** Just the bracket + champion for the lightweight public bracket viewer. */
export async function getBracketByIdRO(
  teamId: string,
): Promise<{ bracketJson: unknown; championName: string; daily: boolean } | null> {
  const rows = await queryTournamentRO<{
    bracket_json: unknown; champion_name: string; daily_date: string | null;
  }>(
    `SELECT bracket_json, champion_name, daily_date
       FROM ${RO_DB}.teams
      WHERE team_id = $1
      LIMIT 1`,
    [teamId],
  );
  if (!rows[0]) return null;
  return {
    bracketJson: parseJson(rows[0].bracket_json),
    championName: rows[0].champion_name,
    // A daily entry shares the common board, so its bracket marks shared players.
    daily: rows[0].daily_date != null,
  };
}
