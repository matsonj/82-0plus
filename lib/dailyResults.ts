import "server-only";
import { track } from "@vercel/analytics/server";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { queryRW, ensureSchema } from "./oltpDb";
import { getUsersByName, insertUser } from "./tournamentQueries";
import { normalizeName, validateName, validatePin } from "./tournamentValidation";

// Server-side per-account daily-challenge completion. Daily play now requires the
// same (name, PIN) arcade login the tournament uses, so completion is tracked per
// account (and therefore shared across a player's devices), powering the one-per-
// day lock, the head-to-head share compare, and "review my picks".

const TDB = "tournament";

/** The 9 team category stats shown on the daily share card. */
export interface DailyBox {
  pts: number; reb: number; ast: number; stl: number; blk: number;
  fgPct: number; ftPct: number; tov: number; fg3m: number;
}

/** One drafted player on the daily reg-season roster (kept so the owner can review). */
export interface DailyRosterLine {
  team: string;
  season: number;
  name: string;
  pts: number;
  reb: number;
  ast: number;
  gq: number;
}

export interface DailyResult {
  date: string;
  wins: number;
  losses: number;
  margin: number; // projected net rating (scoring margin)
  perfect: boolean;
  box: DailyBox | null;
  roster: DailyRosterLine[];
}

export type AuthResult =
  | { ok: true; userId: string; name: string; nameNorm: string }
  | { ok: false; reason: string };

// In-flight create-or-match calls, keyed by (normalized name + PIN). The account
// identity has no DB-level uniqueness (the PIN is stored as a per-row salted hash,
// so a UNIQUE index can't cover it), which means two concurrent authenticate()
// calls for brand-new credentials can both miss the SELECT and both INSERT a
// duplicate account. Coalescing identical calls within a process collapses that
// burst to a single create-or-match. The client also single-flights its post-
// sign-in path; this is the server-side backstop (effective per warm instance —
// full cross-instance atomicity would need a DB constraint, a tracked follow-up).
const inFlightAuth = new Map<string, Promise<AuthResult>>();

/**
 * Resolve a (name, PIN) pair to a user id, creating the account on first sight —
 * identical semantics to the tournament submit (same name + same PIN reuses the
 * account; a different PIN is a different account; no name is ever "taken").
 */
export async function authenticate(
  rawName: string,
  rawPin: string,
): Promise<AuthResult> {
  // Coalesce concurrent identical calls so a fresh login can't create duplicates.
  const key = JSON.stringify([normalizeName(String(rawName)), String(rawPin)]);
  const pending = inFlightAuth.get(key);
  if (pending) return pending;
  const run = authenticateUncoalesced(rawName, rawPin).finally(() => {
    inFlightAuth.delete(key);
  });
  inFlightAuth.set(key, run);
  return run;
}

/**
 * Resolve a (name, PIN) pair to an EXISTING account only — normalize the name,
 * look up candidates, and return the one whose stored salted hash matches the PIN
 * (or null). NEVER creates an account, so it's safe for public read paths that
 * must not mint identities. Validates shape first; uses the RW user lookup so a
 * freshly registered account authenticates immediately (read-your-writes).
 *
 * `authenticate()` calls this first and only falls through to create-on-miss.
 */
export async function findExistingUserByCredentials(
  rawName: unknown,
  rawPin: unknown,
): Promise<{ userId: string; name: string; nameNorm: string } | null> {
  const name = typeof rawName === "string" ? rawName : "";
  const pin = typeof rawPin === "string" ? rawPin : "";
  if (!name || !pin || !validateName(name).ok || !validatePin(pin)) return null;

  await ensureSchema();
  const nameNorm = normalizeName(name);
  for (const u of await getUsersByName(nameNorm)) {
    const candidate = scryptSync(pin, u.pin_salt, 32);
    const stored = Buffer.from(u.pin_hash, "hex");
    if (candidate.length === stored.length && timingSafeEqual(candidate, stored)) {
      return { userId: u.user_id, name, nameNorm };
    }
  }
  return null;
}

async function authenticateUncoalesced(
  rawName: string,
  rawPin: string,
): Promise<AuthResult> {
  const nameCheck = validateName(rawName);
  if (!nameCheck.ok) return { ok: false, reason: nameCheck.reason };
  if (!validatePin(rawPin)) return { ok: false, reason: "PIN must be 4–6 digits" };

  // Match an existing account first (normalize + lookup + PIN check, no create).
  const existing = await findExistingUserByCredentials(rawName, rawPin);
  if (existing) return { ok: true, ...existing };

  // No match → create the account on first sight (ensureSchema already ran).
  const name = String(rawName);
  const nameNorm = normalizeName(name);
  const pin = String(rawPin);
  const salt = randomBytes(16).toString("hex");
  const pinHash = scryptSync(pin, salt, 32).toString("hex");
  const userId = await insertUser({ name, nameNorm, pinHash, pinSalt: salt });
  // Telemetry: a brand-new account (first sight of this name+PIN). This is the
  // ONLY place a user row is created, so it catches signups from every entry
  // point (daily sign-in + tournament register/create). Never let an analytics
  // hiccup break account creation.
  await track("account_created").catch(() => {});
  return { ok: true, userId, name, nameNorm };
}

interface DailyRow {
  daily_date: string;
  wins: number;
  losses: number;
  margin: number;
  perfect: boolean;
  box_json: unknown;
  roster_json: unknown;
}

function parse<T>(raw: unknown, fallback: T): T {
  if (raw == null) return fallback;
  // The pg endpoint may hand back a JSON column as a string OR already parsed.
  if (typeof raw !== "string") return raw as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function toResult(row: DailyRow): DailyResult {
  return {
    date: row.daily_date,
    wins: row.wins,
    losses: row.losses,
    margin: row.margin,
    perfect: !!row.perfect,
    box: parse<DailyBox | null>(row.box_json, null),
    roster: parse<DailyRosterLine[]>(row.roster_json, []),
  };
}

/** The user's completion for a date, or null if they haven't played it. */
export async function getDailyResult(
  userId: string,
  date: string,
): Promise<DailyResult | null> {
  await ensureSchema();
  const rows = await queryRW<DailyRow>(
    `SELECT daily_date, wins, losses, margin, perfect, box_json, roster_json
       FROM ${TDB}.daily_results
      WHERE user_id = $1 AND daily_date = $2
      LIMIT 1`,
    [userId, date],
  );
  return rows[0] ? toResult(rows[0]) : null;
}

/** A lightweight completion row for the menu (no box/roster JSON). */
export interface DailyResultLite {
  date: string;
  wins: number;
  losses: number;
  margin: number;
  perfect: boolean;
  /** That day's team won its daily tournament bracket (luck of the draw). */
  champion: boolean;
  /** Finished in the top 10% of the day's field (only counted when ≥10 played). */
  top10: boolean;
}

// Top-10% (the single ring) is only awarded when the field was at least this deep —
// a percentile is meaningless in a handful of entries and would ring you for playing
// nearly alone.
const TOP10_MIN_FIELD = 10;

/**
 * All of an account's daily completions on/after `since` (a YYYY-MM-DD floor;
 * defaults to none). Drives the menu's "already played" state across devices —
 * the home card for today and the archive list both read from this, so a finished
 * day shows its result instead of "Play" without an N+1 of per-date lookups.
 *
 * Two scorecard flags are derived per day in the same pass:
 *  - champion: the team RECORDED for that daily WON its tournament bracket
 *    (reached_round = 4). A daily can have several mode='daily' entries (each
 *    replay drafts the same team+era slots with different players and gets its
 *    own bracket), so we must NOT credit any-entry-that-won — that would falsely
 *    crown a different replay. We tie it durably to the RECORDED roster: match
 *    daily_results.roster_json against teams.roster_display by a sorted
 *    name|team|season starter signature (both store the same keys), and read the
 *    bracket outcome of the earliest matching entry. No matching entry (never
 *    entered, or only entered other rosters) stays non-champion.
 *  - top10: finished in the top 10% of that day's field (rank ≤ ceil(0.10·field)),
 *    gated on a field of at least TOP10_MIN_FIELD.
 */
export async function listDailyResults(
  userId: string,
  since?: string,
): Promise<DailyResultLite[]> {
  await ensureSchema();
  // Order-independent signature of a roster's starters: a sorted, comma-joined
  // "name|team|season" key per element, so two rosters compare equal regardless of
  // slot order. `arr` is a jsonb expression yielding the player array.
  const rosterSig = (arr: string) =>
    `(SELECT string_agg((e->>'name') || '|' || (e->>'team') || '|' || (e->>'season'), ','
              ORDER BY (e->>'name') || '|' || (e->>'team') || '|' || (e->>'season'))
        FROM jsonb_array_elements(COALESCE(${arr}, '[]'::jsonb)) AS e)`;
  const rows = await queryRW<{
    daily_date: string; wins: number; losses: number; margin: number;
    perfect: boolean; champion: boolean; top10: boolean;
  }>(
    // Rank every entry within its day (same order as the leaderboard). The 30-day
    // floor is applied INSIDE the CTE so the window functions only scan the
    // replayable window, not all history — per-day rank/field are unaffected.
    `WITH ranked AS (
       SELECT user_id, daily_date, wins, losses, margin, perfect, roster_json,
              RANK()   OVER (PARTITION BY daily_date ORDER BY wins DESC, margin DESC) AS rnk,
              COUNT(*) OVER (PARTITION BY daily_date) AS field
         FROM ${TDB}.daily_results
        ${since ? "WHERE daily_date >= $2" : ""}
     )
     SELECT r.daily_date, r.wins, r.losses, r.margin, r.perfect,
            COALESCE((
              SELECT t.reached_round = 4
                FROM ${TDB}.teams t
               WHERE t.user_id = r.user_id
                 AND t.daily_date = r.daily_date
                 AND t.mode = 'daily'
                 AND ${rosterSig("t.roster_display -> 'roster'")}
                   = ${rosterSig("r.roster_json")}
               ORDER BY t.created_at
               LIMIT 1
            ), FALSE) AS champion,
            (r.field >= ${TOP10_MIN_FIELD} AND r.rnk <= ceil(0.10 * r.field)) AS top10
       FROM ranked r
      WHERE r.user_id = $1`,
    since ? [userId, since] : [userId],
  );
  return rows.map((r) => ({
    date: r.daily_date,
    wins: r.wins,
    losses: r.losses,
    margin: r.margin,
    perfect: !!r.perfect,
    champion: !!r.champion,
    top10: !!r.top10,
  }));
}

/** The player's standing on a given day among everyone who played it. */
export interface DailyRank {
  rank: number; // 1-based; ties share a rank
  total: number; // how many accounts played that day
}

/**
 * Where the account placed on `date` among all players: ranked by wins, then by
 * margin (net rating) as the tie-break. `rank` counts the strictly-better entries
 * plus one, so ties share a rank. Returns null if the account hasn't played `date`
 * (no standing to report) or nobody has. One round-trip; the menu reads this for
 * today only, alongside the completion list.
 */
export async function getDailyRank(
  userId: string,
  date: string,
): Promise<DailyRank | null> {
  await ensureSchema();
  const rows = await queryRW<{ rank: number; total: number }>(
    `WITH me AS (
       SELECT wins, margin FROM ${TDB}.daily_results
        WHERE user_id = $1 AND daily_date = $2
        LIMIT 1
     )
     SELECT
       (SELECT COUNT(*) FROM ${TDB}.daily_results WHERE daily_date = $2) AS total,
       (SELECT COUNT(*)
          FROM ${TDB}.daily_results o, me
         WHERE o.daily_date = $2
           AND (o.wins > me.wins
                OR (o.wins = me.wins AND o.margin > me.margin))) + 1 AS rank
     FROM me`,
    [userId, date],
  );
  if (!rows[0]) return null;
  return { rank: Number(rows[0].rank), total: Number(rows[0].total) };
}

/** One row on the daily leaderboard — a player's standing plus their roster, so the
 *  client can expand a row into the head-to-head roster diff with no extra fetch. */
export interface DailyLeaderEntry {
  id: string; // the account id — a stable, unique row key (ties share a rank, so rank isn't unique)
  rank: number; // 1-based; ties share a rank (RANK())
  name: string;
  wins: number;
  losses: number;
  margin: number;
  perfect: boolean;
  isYou: boolean;
  roster: DailyRosterLine[]; // the five picks (slot order [G,FLEX,W,FLEX,B]); [] on legacy rows
}

export interface DailyLeaderboardData {
  date: string;
  total: number; // how many accounts played that day
  youRank: number | null; // the viewer's rank, or null if they haven't played
  top: DailyLeaderEntry[]; // the leaders (rank ≤ topN)
  around: DailyLeaderEntry[]; // the viewer's neighbourhood, when ranked outside the top
}

/**
 * The daily leaderboard for `date`: the top `topN` plus the viewer's own
 * neighbourhood (±`around` ranks), each row carrying its roster so a tap can show
 * the head-to-head pick diff without another round-trip. Ranked by wins, then
 * margin as the tie-break (ties share a rank). Names come from the users table;
 * rosters from the stored row — never the client.
 */
export async function getDailyLeaderboard(
  viewerUserId: string,
  date: string,
  topN = 15,
  around = 2,
): Promise<DailyLeaderboardData> {
  await ensureSchema();
  const rows = await queryRW<{
    user_id: string;
    rank: number;
    total: number;
    name: string;
    wins: number;
    losses: number;
    margin: number;
    perfect: boolean;
    is_you: boolean;
    roster_json: unknown;
  }>(
    `WITH ranked AS (
       SELECT d.user_id, u.name, d.wins, d.losses, d.margin, d.perfect, d.roster_json,
              RANK() OVER (ORDER BY d.wins DESC, d.margin DESC) AS rank,
              COUNT(*) OVER () AS total
         FROM ${TDB}.daily_results d
         JOIN ${TDB}.users u ON u.user_id = d.user_id
        WHERE d.daily_date = $2
     ),
     me AS (SELECT rank FROM ranked WHERE user_id = $1)
     SELECT r.user_id, r.rank, r.total, r.name, r.wins, r.losses, r.margin, r.perfect,
            (r.user_id = $1) AS is_you, r.roster_json
       FROM ranked r
      WHERE r.rank <= $3
         OR ABS(r.rank - COALESCE((SELECT rank FROM me), -1000000)) <= $4
      ORDER BY r.rank, r.name`,
    [viewerUserId, date, topN, around],
  );

  const entries: DailyLeaderEntry[] = rows.map((r) => ({
    id: r.user_id,
    rank: Number(r.rank),
    name: r.name,
    wins: r.wins,
    losses: r.losses,
    margin: r.margin,
    perfect: !!r.perfect,
    isYou: !!r.is_you,
    roster: parse<DailyRosterLine[]>(r.roster_json, []),
  }));

  const total = rows.length ? Number(rows[0].total) : 0;
  const youRank = entries.find((e) => e.isYou)?.rank ?? null;
  return {
    date,
    total,
    youRank,
    top: entries.filter((e) => e.rank <= topN),
    around: entries.filter((e) => e.rank > topN),
  };
}

export interface RecordDailyArgs {
  userId: string;
  date: string;
  wins: number;
  losses: number;
  margin: number;
  perfect: boolean;
  box: DailyBox;
  roster: DailyRosterLine[];
}

/**
 * Record a daily completion (first attempt wins — the PK + ON CONFLICT DO NOTHING
 * make this idempotent and enforce one-per-day). Returns the canonical stored result.
 */
export async function recordDailyResult(args: RecordDailyArgs): Promise<DailyResult> {
  await ensureSchema();
  await queryRW(
    `INSERT INTO ${TDB}.daily_results
       (user_id, daily_date, wins, losses, margin, perfect, box_json, roster_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id, daily_date) DO NOTHING`,
    [
      args.userId,
      args.date,
      args.wins,
      args.losses,
      args.margin,
      args.perfect,
      JSON.stringify(args.box),
      JSON.stringify(args.roster),
    ],
  );
  // Return whatever is stored (the first attempt, if one already existed).
  return (await getDailyResult(args.userId, args.date)) ?? {
    date: args.date,
    wins: args.wins,
    losses: args.losses,
    margin: args.margin,
    perfect: args.perfect,
    box: args.box,
    roster: args.roster,
  };
}
