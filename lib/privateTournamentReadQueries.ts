import "server-only";
import {
  type EntryDbRow,
  type EntryForUserDbRow,
  mapEntryForUserRow,
  mapEntryRow,
  mapTournamentRow,
  PRIVATE_ENTRY_COLS,
  PRIVATE_ENTRY_FOR_USER_COLS,
  PRIVATE_TOURNAMENT_COLS,
  type PrivateEntryForUserRow,
  type PrivateEntryRow,
  type PrivateTournamentRow,
  type TournamentDbRow,
} from "./privateTournamentRows";
import { queryTournamentRO } from "./oltpReadDb";

// READ-ONLY private-tournament queries for the PUBLIC share path (no PIN needed
// to VIEW a tournament). Deliberate read-pool TWINS of the queryRW versions in
// lib/privateTournamentQueries.ts — but on the read-only Postgres pool
// (lib/oltpReadDb, DATABASE_URL_RO). They never run DDL and hit the same always-on
// database as the writers (no replication lag).
//
// The row shapes, mapped types, SELECT column lists, and row→object mappers all
// come from lib/privateTournamentRows.ts — the SAME source the RW file imports —
// so the two read paths can never silently diverge on a column change. The only
// difference here is the executor (queryTournamentRO) and the RO DB name; there
// is no ensureSchema() (RO never runs DDL).

const RO_DB = "tournament";

// ── Public read paths ─────────────────────────────────────────────────────────

/** Full tournament row (board + final bracket parsed), or null. Public viewer. */
export async function getPrivateTournamentRO(
  tournamentId: string,
): Promise<PrivateTournamentRow | null> {
  const rows = await queryTournamentRO<TournamentDbRow>(
    `SELECT ${PRIVATE_TOURNAMENT_COLS}
       FROM ${RO_DB}.private_tournaments
      WHERE tournament_id = $1
      LIMIT 1`,
    [tournamentId],
  );
  return rows[0] ? mapTournamentRow(rows[0]) : null;
}

/** All entries for a tournament, oldest first (public share view). */
export async function listPrivateEntriesRO(
  tournamentId: string,
): Promise<PrivateEntryRow[]> {
  const rows = await queryTournamentRO<EntryDbRow>(
    `SELECT ${PRIVATE_ENTRY_COLS}
       FROM ${RO_DB}.private_entries
      WHERE tournament_id = $1
      ORDER BY created_at ASC`,
    [tournamentId],
  );
  return rows.map(mapEntryRow);
}

/** One entrant's row (entrant-specific highlight when creds are provided). */
export async function getPrivateEntryRO(
  tournamentId: string,
  userId: string,
): Promise<PrivateEntryRow | null> {
  const rows = await queryTournamentRO<EntryDbRow>(
    `SELECT ${PRIVATE_ENTRY_COLS}
       FROM ${RO_DB}.private_entries
      WHERE tournament_id = $1 AND user_id = $2
      ORDER BY created_at ASC
      LIMIT 1`,
    [tournamentId, userId],
  );
  return rows[0] ? mapEntryRow(rows[0]) : null;
}

/** A user's private entries joined with their tournament (notifications read). */
export async function listPrivateEntriesForUserRO(
  userId: string,
): Promise<PrivateEntryForUserRow[]> {
  const rows = await queryTournamentRO<EntryForUserDbRow>(
    `SELECT ${PRIVATE_ENTRY_FOR_USER_COLS}
       FROM ${RO_DB}.private_entries e
       JOIN ${RO_DB}.private_tournaments t ON t.tournament_id = e.tournament_id
      WHERE e.user_id = $1
      ORDER BY t.created_at DESC`,
    [userId],
  );
  return rows.map(mapEntryForUserRow);
}
