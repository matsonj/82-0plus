"use client";

import { useEffect, useMemo, useState } from "react";
import { RosterList, playerKey } from "@/components/BracketView";
import type { SavedUser } from "@/lib/tournamentSession";

// "2026-06-10" → "Jun 10" (plain calendar date, no TZ shift).
function label(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

interface LeaderEntry {
  rank: number;
  name: string;
  wins: number;
  losses: number;
  margin: number;
  perfect: boolean;
  isYou: boolean;
  roster: { team: string; season: number; name: string }[];
}
interface LeaderboardData {
  date: string;
  total: number;
  youRank: number | null;
  top: LeaderEntry[];
  around: LeaderEntry[];
}

/**
 * The daily leaderboard modal: top players + the viewer's own neighbourhood, opened
 * from the menu's rank line. Tapping a row expands that team's roster and — since
 * everyone drafts the same five rolls — greys/italicises the picks you BOTH made
 * (reusing BracketView's shared-board treatment), so the picks that team made
 * differently from you read bold. One fetch carries every shown row's roster, so
 * expanding is instant.
 */
export function DailyLeaderboard({
  date,
  user,
  onClose,
}: {
  date: string;
  user: SavedUser;
  onClose: () => void;
}) {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [failed, setFailed] = useState(false);
  const [openRank, setOpenRank] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/daily/leaderboard", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: user.username, pin: user.pin, date }),
        });
        if (!res.ok) throw new Error("load failed");
        const json = (await res.json()) as { leaderboard: LeaderboardData };
        if (alive) setData(json.leaderboard);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [date, user.username, user.pin]);

  // Your roster keys — the set every OTHER team's picks are greyed against.
  const myKeys = useMemo(() => {
    const all = data ? [...data.top, ...data.around] : [];
    const me = all.find((e) => e.isYou);
    return new Set((me?.roster ?? []).map(playerKey));
  }, [data]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(56,56,56,0.55)" }}
      onClick={onClose}
    >
      <div
        className="md-card md-card--lift flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden p-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b-2 border-[var(--md-ink)] px-5 py-4">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-xl font-bold">Daily Leaderboard</h2>
            <div className="text-[13px] text-[var(--md-ink-muted)]">
              {label(date)}
              {data?.youRank != null && (
                <>
                  {" "}
                  · you&rsquo;re{" "}
                  <strong className="text-[var(--md-ink)]">#{data.youRank}</strong>{" "}
                  of {data.total}
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="font-display text-lg text-[var(--md-ink-muted)] hover:text-[var(--md-coral)]"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="md-scroll flex-1 overflow-auto">
          {failed ? (
            <div className="px-5 py-8 text-center font-display text-[13px] text-[var(--md-ink-muted)]">
              Couldn&rsquo;t load the leaderboard.
            </div>
          ) : !data ? (
            <div className="px-5 py-8 text-center font-display text-[13px] text-[var(--md-ink-muted)]">
              Loading…
            </div>
          ) : (
            <>
              <Row header />
              {data.top.map((e) => (
                <Row
                  key={e.rank + e.name}
                  entry={e}
                  open={openRank === e.rank}
                  onToggle={() =>
                    setOpenRank((r) => (r === e.rank ? null : e.rank))
                  }
                  compareKeys={e.isYou ? undefined : myKeys}
                />
              ))}
              {data.around.length > 0 && (
                <div className="flex items-center justify-center bg-[var(--md-gray-100)] py-1.5 font-display text-[14px] font-bold tracking-[0.2em] text-[var(--md-paper-3)]">
                  · · ·
                </div>
              )}
              {data.around.map((e) => (
                <Row
                  key={e.rank + e.name}
                  entry={e}
                  open={openRank === e.rank}
                  onToggle={() =>
                    setOpenRank((r) => (r === e.rank ? null : e.rank))
                  }
                  compareKeys={e.isYou ? undefined : myKeys}
                />
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t-2 border-[var(--md-ink)] px-5 py-3">
          <span className="font-display text-[11px] italic text-[var(--md-ink-muted)]">
            tap a row · italic = your pick too
          </span>
          <button
            type="button"
            onClick={onClose}
            className="font-display text-[14px] font-bold text-[var(--md-ink-muted)] hover:text-[var(--md-ink)]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function sign(n: number): string {
  return `${n >= 0 ? "+" : ""}${Math.round(n)}`;
}

// One leaderboard row (or the column header). A real row is a button that toggles
// its roster panel; the header reuses the same lanes so columns line up.
function Row({
  entry,
  header,
  open,
  onToggle,
  compareKeys,
}: {
  entry?: LeaderEntry;
  header?: boolean;
  open?: boolean;
  onToggle?: () => void;
  compareKeys?: Set<string>;
}) {
  if (header) {
    return (
      <div className="flex items-center gap-3 border-b border-[var(--md-paper-3)] px-5 py-2 font-display text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--md-ink-muted)]">
        <span className="w-7 shrink-0">#</span>
        <span className="flex-1">Player</span>
        <span className="w-14 shrink-0 text-right">W–L</span>
        <span className="w-10 shrink-0 text-right">Net</span>
        <span className="w-5 shrink-0" />
      </div>
    );
  }
  if (!entry) return null;
  return (
    <div
      className="border-b border-[var(--md-paper-3)]"
      style={entry.isYou ? { background: "var(--md-yellow)" } : undefined}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-2.5 text-left"
      >
        <span className="w-7 shrink-0 font-display text-[14px] font-bold tabular-nums text-[var(--md-ink-muted)]">
          {entry.rank}
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate font-display text-[14px] font-bold">
            {entry.name}
          </span>
          {entry.isYou && (
            <span className="shrink-0 border border-[var(--md-ink)] px-1 text-[8px] font-bold uppercase leading-tight tracking-wide">
              You
            </span>
          )}
          <span className="shrink-0 font-display text-[9px] text-[var(--md-ink-muted)]">
            {open ? "▴" : "▾"}
          </span>
        </span>
        <span className="w-14 shrink-0 text-right font-display text-[14px] font-bold tabular-nums">
          {entry.wins}&ndash;{entry.losses}
        </span>
        <span className="w-10 shrink-0 text-right font-display text-[12px] tabular-nums text-[var(--md-ink-muted)]">
          {sign(entry.margin)}
        </span>
        <span className="w-5 shrink-0 text-center text-[14px]" aria-hidden>
          {entry.perfect ? "🏆" : ""}
        </span>
      </button>
      {open && (
        <div className="border-t-2 border-dashed border-[var(--md-ink)] bg-[var(--md-paper)] px-4 py-2">
          {entry.roster.length > 0 ? (
            <RosterList roster={entry.roster} compareKeys={compareKeys} />
          ) : (
            <div className="font-display text-[10px] italic text-[var(--md-ink-muted)]">
              roster unavailable
            </div>
          )}
        </div>
      )}
    </div>
  );
}
