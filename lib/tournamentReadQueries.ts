import "server-only";
import { query, type QueryOptions } from "./motherduck";
import type {
  BracketPlayer,
  TournamentMode,
  TournamentTeamSummary,
} from "./types";
import type { UserAuthRow } from "./tournamentQueries";

// READ-ONLY tournament queries for the PUBLIC, no-PIN paths
// (/api/tournament/{bracket,team,lookup}). These run on the read-scaling token
// (lib/motherduck → query), NOT the high-privilege RW pool, and they never run
// schema DDL. The tournament tables are exposed to the read token via a MotherDuck
// share attached as `nba_tournament` (override with TOURNAMENT_RO_DB if attached
// under a different alias). An auto-updating share lags writes by ~1 min, which is
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
  options: QueryOptions = {},
): Promise<UserAuthRow[]> {
  return query<UserAuthRow>(
    `SELECT user_id, pin_hash, pin_salt
       FROM ${RO_DB}.users
      WHERE name_norm = $1
      ORDER BY created_at ASC`,
    [nameNorm],
    options,
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
}

/** All memorialized teams for a user, newest first (lookup detail list). */
export async function getUserTeamsRO(
  userId: string,
  options: QueryOptions = {},
): Promise<TournamentTeamSummary[]> {
  const rows = await query<TeamSummaryRow>(
    `SELECT team_id, team_name, mode, record_w, record_l, realized_margin, reached_round,
            champion_name, seed_net, daily_date, created_at, roster_display
       FROM ${RO_DB}.teams
      WHERE user_id = $1
      ORDER BY created_at DESC`,
    [userId],
    options,
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

/** A team's stored bracket + box (public team viewer). */
export async function getTeamBracketRO(
  teamId: string,
  options: QueryOptions = {},
): Promise<{ bracketJson: unknown; teamBox: unknown; realizedMargin: number } | null> {
  const rows = await query<{
    bracket_json: unknown;
    team_box_json: unknown;
    realized_margin: number;
  }>(
    `SELECT bracket_json, team_box_json, realized_margin
       FROM ${RO_DB}.teams
      WHERE team_id = $1
      LIMIT 1`,
    [teamId],
    options,
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
  options: QueryOptions = {},
): Promise<{ bracketJson: unknown; championName: string } | null> {
  const rows = await query<{ bracket_json: unknown; champion_name: string }>(
    `SELECT bracket_json, champion_name
       FROM ${RO_DB}.teams
      WHERE team_id = $1
      LIMIT 1`,
    [teamId],
    options,
  );
  if (!rows[0]) return null;
  return {
    bracketJson: parseJson(rows[0].bracket_json),
    championName: rows[0].champion_name,
  };
}
