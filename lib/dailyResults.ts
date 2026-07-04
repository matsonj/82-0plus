import "server-only";
import { track } from "@vercel/analytics/server";
import { queryRW, ensureSchema } from "./oltpDb";
import { getUsersByName, insertUser } from "./tournamentQueries";
import { normalizeName, validateName, validatePin } from "./tournamentValidation";
import { verifyPin, hashPin } from "./pinHash";
import {
  attemptKeys,
  checkThrottle,
  recordFailure,
  recordSuccess,
  type ThrottleStore,
} from "./authRateLimit";
import { pgThrottleStore } from "./authThrottleStore";

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
  // `retryAfterMs` is set only when the failure is a rate-limit lockout (#107) —
  // it lets the API layer answer 429 + Retry-After instead of a plain 401.
  | { ok: false; reason: string; retryAfterMs?: number };

/** Optional context for a credential check: the client IP (for the per-IP
 *  throttle key) and, for tests, an injectable throttle store. */
export interface AuthOptions {
  /** Client IP — adds a per-IP throttle key alongside the per-account one. */
  ip?: string | null;
  /** Override the throttle store (defaults to the durable Postgres store). */
  throttleStore?: ThrottleStore;
}

// Throttle keys for an account credential attempt. The subject is the account
// name (`user:<nameNorm>`); attemptKeys() combines it with the client IP into a
// per-IP brake + a (name+IP) composite so a remote attacker can't lock a victim's
// name from arbitrary IPs (see lib/authRateLimit).
function accountAttemptKeys(nameNorm: string, ip?: string | null) {
  return attemptKeys(`user:${nameNorm}`, ip ?? null);
}

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
  opts: AuthOptions = {},
): Promise<AuthResult> {
  // Coalesce concurrent identical calls so a fresh login can't create duplicates.
  const key = JSON.stringify([normalizeName(String(rawName)), String(rawPin)]);
  const pending = inFlightAuth.get(key);
  if (pending) return pending;
  const run = authenticateUncoalesced(rawName, rawPin, opts).finally(() => {
    inFlightAuth.delete(key);
  });
  inFlightAuth.set(key, run);
  return run;
}

/**
 * Resolve a (name, PIN) pair to an EXISTING account only — normalize the name,
 * look up candidates, and return the one whose stored salted hash matches the PIN
 * (or null). NEVER creates an account, so it's safe for public read paths that
 * must not mint identities. Uses the RW user lookup so a freshly registered
 * account authenticates immediately (read-your-writes). No throttle — used
 * internally by `authenticate()` and by the throttled public wrapper below.
 */
async function matchExistingUser(
  rawName: unknown,
  rawPin: unknown,
): Promise<{ userId: string; name: string; nameNorm: string } | null> {
  const name = typeof rawName === "string" ? rawName : "";
  const pin = typeof rawPin === "string" ? rawPin : "";
  if (!name || !pin || !validateName(name).ok || !validatePin(pin)) return null;

  await ensureSchema();
  const nameNorm = normalizeName(name);
  for (const u of await getUsersByName(nameNorm)) {
    if (verifyPin(pin, u.pin_hash, u.pin_salt)) {
      return { userId: u.user_id, name, nameNorm };
    }
  }
  return null;
}

/**
 * Throttled, create-free credential match for PUBLIC read paths (e.g. the private
 * tournament `you` lookup). Returns the matching account or null. A well-formed
 * credential pair that DOESN'T match counts as a failed attempt (feeding the
 * shared throttle); a match resets it. An absent/malformed pair is NOT a guess —
 * anonymous page views hit this with empty creds and must never trip the limiter,
 * so those short-circuit before touching the throttle.
 *
 * `authenticate()` does NOT call this (it uses matchExistingUser + its own
 * throttle) so a single auth is never double-counted.
 */
export async function findExistingUserByCredentials(
  rawName: unknown,
  rawPin: unknown,
  opts: AuthOptions = {},
): Promise<{ userId: string; name: string; nameNorm: string } | null> {
  const name = typeof rawName === "string" ? rawName : "";
  const pin = typeof rawPin === "string" ? rawPin : "";
  if (!name || !pin || !validateName(name).ok || !validatePin(pin)) return null;

  const store = opts.throttleStore ?? pgThrottleStore;
  const nameNorm = normalizeName(name);
  const { gate, subject } = accountAttemptKeys(nameNorm, opts.ip);

  // Ensure the schema (incl. auth_throttle) before the throttle read. This is an
  // RW path that already provisioned tables via matchExistingUser → ensureSchema;
  // running it here just guarantees the throttle table exists before we peek it.
  await ensureSchema();

  // Locked → behave as "no match" (a read path never surfaces a 429; the caller
  // just doesn't get their entrant state, which is the same as a miss).
  if (!(await checkThrottle(store, gate)).allowed) return null;

  const match = await matchExistingUser(name, pin);
  if (match) {
    await recordSuccess(store, subject); // clear subject only, leave the IP bucket
    return match;
  }
  await recordFailure(store, gate);
  return null;
}

async function authenticateUncoalesced(
  rawName: string,
  rawPin: string,
  opts: AuthOptions,
): Promise<AuthResult> {
  const nameCheck = validateName(rawName);
  if (!nameCheck.ok) return { ok: false, reason: nameCheck.reason };
  if (!validatePin(rawPin)) return { ok: false, reason: "PIN must be 4–6 digits" };

  const store = opts.throttleStore ?? pgThrottleStore;
  const name = String(rawName);
  const nameNorm = normalizeName(name);
  const pin = String(rawPin);
  const { gate, subject } = accountAttemptKeys(nameNorm, opts.ip);

  // Ensure the schema (incl. auth_throttle) BEFORE the throttle read — this
  // authenticated path is where the throttle table gets provisioned.
  await ensureSchema();

  // Throttle gate AFTER shape validation, BEFORE any match or create: a locked key
  // can neither guess an existing PIN nor mint a fresh account (bounding the
  // create-on-miss row-creation vector as well as PIN brute-force).
  const decision = await checkThrottle(store, gate);
  if (!decision.allowed) {
    return {
      ok: false,
      reason: "Too many attempts — wait a moment and try again.",
      retryAfterMs: decision.retryAfterMs,
    };
  }

  // Match an existing account first (normalize + lookup + PIN check, no create).
  const existing = await matchExistingUser(name, pin);
  if (existing) {
    await recordSuccess(store, subject); // clear subject only, leave the IP bucket
    return { ok: true, ...existing };
  }

  // No match → BOTH a PIN miss and an account-creation attempt. Count it against
  // the throttle before creating, so unbounded account creation is bounded too.
  // (A legitimate brand-new user costs exactly one failure here; their next auth
  // matches this row and resets the subject counter.) ensureSchema already ran.
  await recordFailure(store, gate);
  const { pinHash, pinSalt } = hashPin(pin);
  const userId = await insertUser({ name, nameNorm, pinHash, pinSalt });
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

/**
 * The team_id of the (most recent) daily tournament team a user entered for a date,
 * or null. Lets the daily "Review your team" flow deep-link straight to that bracket
 * (`/api/tournament/team?id=`) instead of fetching the user's whole team list to
 * find it. Newest-first matches the team list's ordering, so it opens the same team
 * the all-teams lookup would have.
 */
export async function getDailyTeamId(
  userId: string,
  date: string,
): Promise<string | null> {
  await ensureSchema();
  const rows = await queryRW<{ team_id: string }>(
    `SELECT CAST(team_id AS text) AS team_id
       FROM ${TDB}.teams
      WHERE user_id = $1 AND daily_date = $2 AND mode = 'daily'
      ORDER BY created_at DESC
      LIMIT 1`,
    [userId, date],
  );
  return rows[0]?.team_id ?? null;
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
