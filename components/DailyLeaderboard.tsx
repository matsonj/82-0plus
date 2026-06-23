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
  id: string;
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
 * The daily leaderboard modal: top players + the viewer's own neighbourhood.
 * DATA LEGIBILITY IS SACRED: ink on --md-white, Space Mono tabular-nums,
 * fixed-width right-aligned column lanes, zebra via --md-paper-2.
 * Your-own-row pops flame. Champion = press-yellow.
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
  const [openId, setOpenId] = useState<string | null>(null);

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

  // Your roster keys — every OTHER team's picks are greyed against this.
  const myKeys = useMemo(() => {
    const all = data ? [...data.top, ...data.around] : [];
    const me = all.find((e) => e.isYou);
    return new Set((me?.roster ?? []).map(playerKey));
  }, [data]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(21,17,14,0.7)" }}
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden border-2 border-[var(--md-ink)]"
        style={{ background: "var(--md-white)", boxShadow: "var(--md-shadow-md)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — ink masthead band */}
        <div
          className="flex items-start justify-between gap-3 px-5 py-4"
          style={{ background: "var(--md-ink)", borderBottom: "2px solid var(--md-coral)" }}
        >
          <div className="flex flex-col gap-1">
            <h2
              className="font-archivo leading-tight"
              style={{ fontSize: 20, fontWeight: 800, fontVariationSettings: '"wdth" 88', color: "var(--md-white)" }}
            >
              Daily Leaderboard
            </h2>
            <div className="font-mono text-[12px] tabular-nums" style={{ color: "var(--md-paper-3)" }}>
              {label(date)}
              {data?.youRank != null && (
                <>
                  {" "}
                  · you&rsquo;re{" "}
                  <strong style={{ color: "var(--md-yellow)" }}>#{data.youRank}</strong>{" "}
                  <span>of {data.total}</span>
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="font-cond text-lg font-bold transition-colors hover:text-[var(--md-coral)]"
            style={{ color: "var(--md-paper-3)" }}
          >
            ✕
          </button>
        </div>

        {/* Body — SACRED data table */}
        <div className="md-scroll flex-1 overflow-auto" style={{ background: "var(--md-white)" }}>
          {failed ? (
            <div className="px-5 py-8 text-center font-mono text-[13px] text-[var(--md-ink-muted)]">
              Couldn&rsquo;t load the leaderboard.
            </div>
          ) : !data ? (
            <div className="px-5 py-8 text-center font-mono text-[13px] text-[var(--md-ink-muted)]">
              Loading…
            </div>
          ) : (
            <>
              <Row header />
              {data.top.map((e) => (
                <Row
                  key={e.id}
                  entry={e}
                  open={openId === e.id}
                  onToggle={() =>
                    setOpenId((cur) => (cur === e.id ? null : e.id))
                  }
                  compareKeys={e.isYou ? undefined : myKeys}
                />
              ))}
              {data.around.length > 0 && (
                <div
                  className="flex items-center justify-center py-1.5 font-mono text-[14px] font-bold tracking-[0.2em]"
                  style={{ background: "var(--md-paper-2)", color: "var(--md-paper-3)" }}
                >
                  · · ·
                </div>
              )}
              {data.around.map((e) => (
                <Row
                  key={e.id}
                  entry={e}
                  open={openId === e.id}
                  onToggle={() =>
                    setOpenId((cur) => (cur === e.id ? null : e.id))
                  }
                  compareKeys={e.isYou ? undefined : myKeys}
                />
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between border-t-2 border-[var(--md-ink)] px-5 py-3"
          style={{ background: "var(--md-paper-2)" }}
        >
          <span className="font-mono text-[11px] italic text-[var(--md-ink-muted)]">
            tap a row · italic = your pick too
          </span>
          <button
            type="button"
            onClick={onClose}
            className="font-cond text-[13px] font-semibold uppercase tracking-[0.1em] text-[var(--md-ink-muted)] hover:text-[var(--md-ink)]"
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

// One leaderboard row (or the column header). Fixed-width right-aligned column
// lanes — DATA LEGIBILITY IS SACRED.
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
      <div
        className="flex items-center gap-2 border-b-2 border-[var(--md-ink)] px-4 py-2"
        style={{ background: "var(--md-paper-2)" }}
      >
        <span className="w-7 shrink-0 font-cond text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--md-ink-muted)]">#</span>
        <span className="flex-1 font-cond text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--md-ink-muted)]">Player</span>
        <span className="w-14 shrink-0 text-right font-cond text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--md-ink-muted)]">W–L</span>
        <span className="w-10 shrink-0 text-right font-cond text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--md-ink-muted)]">Net</span>
        <span className="w-5 shrink-0" />
      </div>
    );
  }
  if (!entry) return null;

  // Semantic row background: your row = flame; zebra = paper-2; default = white.
  const rowBg = entry.isYou
    ? "var(--md-coral)"
    : undefined;
  const rowColor = entry.isYou ? "var(--md-white)" : undefined;

  return (
    <div
      className="border-b border-[var(--md-paper-3)]"
      style={entry.isYou ? { background: rowBg } : undefined}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
        style={entry.isYou ? undefined : undefined}
      >
        {/* Rank — fixed width */}
        <span
          className="w-7 shrink-0 font-mono text-[13px] font-bold tabular-nums"
          style={{ color: entry.isYou ? "var(--md-white)" : "var(--md-ink-muted)" }}
        >
          {entry.rank}
        </span>

        {/* Name — fills remaining space */}
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span
            className="truncate font-mono text-[13px] font-bold uppercase tracking-[0.02em]"
            style={{ color: entry.isYou ? "var(--md-white)" : "var(--md-ink)" }}
          >
            {entry.name}
          </span>
          {entry.isYou && (
            <span
              className="shrink-0 border px-1 font-mono text-[8px] font-bold uppercase leading-tight tracking-wide"
              style={{ borderColor: "var(--md-white)", color: "var(--md-white)" }}
            >
              You
            </span>
          )}
          <span
            className="shrink-0 font-mono text-[9px]"
            style={{ color: entry.isYou ? "rgba(251,248,239,0.6)" : "var(--md-ink-muted)" }}
          >
            {open ? "▴" : "▾"}
          </span>
        </span>

        {/* W–L record — fixed width right-aligned */}
        <span
          className="w-14 shrink-0 text-right font-mono text-[13px] font-bold tabular-nums"
          style={{ color: entry.isYou ? "var(--md-white)" : "var(--md-ink)" }}
        >
          {entry.wins}&ndash;{entry.losses}
        </span>

        {/* Net rating — fixed width right-aligned */}
        <span
          className="w-10 shrink-0 text-right font-mono text-[11px] tabular-nums"
          style={{ color: entry.isYou ? "rgba(251,248,239,0.7)" : "var(--md-ink-muted)" }}
        >
          {sign(entry.margin)}
        </span>

        {/* Champion indicator */}
        <span className="w-5 shrink-0 text-center text-[13px]" aria-hidden>
          {entry.perfect ? "♛" : ""}
        </span>
      </button>

      {open && (
        <div
          className="border-t-2 border-dashed border-[var(--md-ink)] px-4 py-2"
          style={{ background: "var(--md-paper)" }}
        >
          {entry.roster.length > 0 ? (
            <RosterList roster={entry.roster} compareKeys={compareKeys} />
          ) : (
            <div className="font-mono text-[10px] italic text-[var(--md-ink-muted)]">
              roster unavailable
            </div>
          )}
        </div>
      )}
    </div>
  );
}
