"use client";

import type { SimPick } from "@/lib/types";

// Same-device "pending completion" lock for the Daily challenge.
//
// daily_results on the account is the real replay gate, but the completion POST
// (/api/daily/complete) is best-effort — if it times out or the server is down,
// the account has NO record and nothing stops a refresh from re-drafting the same
// day for a better score/share. So the moment a completion is made we drop a local
// lock keyed by date, and only clear it once the server CONFIRMS the record (or
// definitively rejects the picks). The replay gate honors this lock to fail closed.
//
// Deliberately a DIFFERENT key prefix from the legacy `md820-daily-*` results
// cache — that cache is purged on home mount and ignored by the archive, and this
// lock must survive both. It is short-lived: cleared as soon as the server owns
// the gate, so it can never become the stale per-device block this lock's cousin
// once was.

export interface PendingDaily {
  wins: number;
  losses: number;
  perfect: boolean;
  // The drafted picks, kept so a failed /api/daily/complete can be RETRIED — not
  // merely detected. Without them the lock could never resolve, stranding the
  // result in a permanent local lock. Cleared with the lock once the server has it.
  picks: SimPick[];
}

const PREFIX = "md820-pending-daily-";
const key = (date: string) => `${PREFIX}${date}`;

export function setPendingDaily(date: string, rec: PendingDaily): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key(date), JSON.stringify(rec));
  } catch {
    /* localStorage unavailable */
  }
}

export function getPendingDaily(date: string): PendingDaily | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key(date));
    return raw ? (JSON.parse(raw) as PendingDaily) : null;
  } catch {
    return null;
  }
}

export function clearPendingDaily(date: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key(date));
  } catch {
    /* ignore */
  }
}

/** Every date with an unflushed completion lock — used to retry saves on load. */
export function listPendingDailyDates(): string[] {
  if (typeof window === "undefined") return [];
  const dates: string[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k?.startsWith(PREFIX)) dates.push(k.slice(PREFIX.length));
    }
  } catch {
    /* ignore */
  }
  return dates;
}
