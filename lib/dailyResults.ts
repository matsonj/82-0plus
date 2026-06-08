import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { queryRW, ensureSchema } from "./tournamentDb";
import { getUsersByName, insertUser } from "./tournamentQueries";
import { normalizeName, validateName, validatePin } from "./tournamentValidation";

// Server-side per-account daily-challenge completion. Daily play now requires the
// same (name, PIN) arcade login the tournament uses, so completion is tracked per
// account (and therefore shared across a player's devices), powering the one-per-
// day lock, the head-to-head share compare, and "review my picks".

const TDB = "nba_tournament.main";

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

/**
 * Resolve a (name, PIN) pair to a user id, creating the account on first sight —
 * identical semantics to the tournament submit (same name + same PIN reuses the
 * account; a different PIN is a different account; no name is ever "taken").
 */
export async function authenticate(
  rawName: string,
  rawPin: string,
): Promise<AuthResult> {
  const nameCheck = validateName(rawName);
  if (!nameCheck.ok) return { ok: false, reason: nameCheck.reason };
  if (!validatePin(rawPin)) return { ok: false, reason: "PIN must be 4–6 digits" };

  await ensureSchema();
  const name = String(rawName);
  const nameNorm = normalizeName(name);
  const pin = String(rawPin);

  const pinMatches = (row: { pin_hash: string; pin_salt: string }): boolean => {
    const candidate = scryptSync(pin, row.pin_salt, 32);
    const stored = Buffer.from(row.pin_hash, "hex");
    return candidate.length === stored.length && timingSafeEqual(candidate, stored);
  };

  for (const u of await getUsersByName(nameNorm)) {
    if (pinMatches(u)) return { ok: true, userId: u.user_id, name, nameNorm };
  }
  const salt = randomBytes(16).toString("hex");
  const pinHash = scryptSync(pin, salt, 32).toString("hex");
  const userId = await insertUser({ name, nameNorm, pinHash, pinSalt: salt });
  return { ok: true, userId, name, nameNorm };
}

interface DailyRow {
  daily_date: string;
  wins: number;
  losses: number;
  margin: number;
  perfect: boolean;
  box_json: string | null;
  roster_json: string | null;
}

function parse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
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
 * Record a daily completion (first attempt wins — the PK + INSERT OR IGNORE make
 * this idempotent and enforce one-per-day). Returns the canonical stored result.
 */
export async function recordDailyResult(args: RecordDailyArgs): Promise<DailyResult> {
  await ensureSchema();
  await queryRW(
    `INSERT OR IGNORE INTO ${TDB}.daily_results
       (user_id, daily_date, wins, losses, margin, perfect, box_json, roster_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
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
