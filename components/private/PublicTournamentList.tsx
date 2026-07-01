"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  formatPublicSpots,
  type PublicTournamentSummary,
} from "@/lib/privateTournament";
import { LoadingState } from "@/components/ui";

// The public "open to everyone" browse list, shown in the Private tab. Anonymous:
// fetches GET /api/private-tournament/public on mount (no creds). Each row links
// to /p/<id>, where the existing register flow takes the user's OWN name+PIN — the
// tournament PIN is never needed for a publicly-listed bracket. Renders nothing
// when there are no open public tournaments, so the tab stays uncluttered.

/** Short capsule label (the long privateModeLabel "Private - Ranked" is for My Teams). */
function shortMode(mode: PublicTournamentSummary["mode"]): "Ranked" | "Classic" {
  return mode === "hoopiq" ? "Ranked" : "Classic";
}

/** Coarse "time left" for the host line — computed once on render, good enough for
 *  a browse list (the lobby shows the precise window). */
function timeLeft(expiresAt: string): string {
  const ms = Date.parse(expiresAt) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "closing";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m left`;
  const hrs = Math.floor(mins / 60);
  return hrs < 48 ? `${hrs}h left` : `${Math.floor(hrs / 24)}d left`;
}

function PublicRow({ t }: { t: PublicTournamentSummary }) {
  const { text: spots, full } = formatPublicSpots(t.entryCount, t.size);
  const ranked = t.mode === "hoopiq";
  return (
    <Link
      href={`/p/${t.tournamentId}`}
      className="flex items-center gap-4 border-b border-[var(--md-paper-3)] px-4 py-3.5 transition-colors hover:bg-[var(--md-paper-2)]"
    >
      {/* Name + host · time left */}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className="font-archivo truncate leading-tight"
          style={{ fontSize: 16, fontWeight: 800, fontVariationSettings: '"wdth" 90' }}
        >
          {t.name}
        </span>
        <span className="font-byline text-[11px] text-[var(--md-ink-muted)]">
          host: {t.adminName} · {timeLeft(t.expiresAt)}
        </span>
      </span>

      {/* Mode + size capsules (hidden on the narrowest widths) */}
      <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
        <span
          className="font-cond text-[11px] font-semibold uppercase tracking-[0.06em]"
          style={{
            background: ranked ? "var(--md-ink)" : "var(--md-coral)",
            color: "var(--md-white)",
            border: "2px solid var(--md-ink)",
            borderRadius: 999,
            padding: "2px 11px",
          }}
        >
          {shortMode(t.mode)}
        </span>
        <span
          className="font-cond text-[11px] font-semibold uppercase tracking-[0.06em]"
          style={{
            background: "var(--md-paper-2)",
            color: "var(--md-ink)",
            border: "2px solid var(--md-ink)",
            borderRadius: 999,
            padding: "2px 11px",
          }}
        >
          {t.size} teams
        </span>
      </span>

      {/* Live joined count */}
      <span className="flex w-[74px] shrink-0 flex-col items-end">
        <span
          className="font-mono text-[16px] font-bold tabular-nums"
          style={{ color: full ? "var(--md-coral-deep)" : "var(--md-ink)" }}
        >
          {spots}
        </span>
        <span className="font-cond text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--md-ink-muted)]">
          joined
        </span>
      </span>

      {/* Join affordance / Full state */}
      <span
        className="w-[58px] shrink-0 text-right font-cond text-[12px] font-semibold uppercase tracking-[0.06em]"
        style={{ color: full ? "var(--md-coral-deep)" : "var(--md-cobalt)" }}
      >
        {full ? "Full" : "Join →"}
      </span>
    </Link>
  );
}

export function PublicTournamentList() {
  const [rows, setRows] = useState<PublicTournamentSummary[] | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/private-tournament/public")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active) setRows((d?.tournaments as PublicTournamentSummary[]) ?? []);
      })
      .catch(() => {
        if (active) setRows([]);
      });
    return () => {
      active = false;
    };
  }, []);

  // Section header: Oswald label + hairline rule (matches the "Your Tournaments"
  // section and the results page).
  const header = (right?: React.ReactNode) => (
    <div className="flex items-center gap-4">
      <span className="whitespace-nowrap font-cond text-[13px] font-semibold uppercase tracking-[0.16em] text-[var(--md-ink)]">
        Join a Public Tournament
      </span>
      <div className="h-px flex-1 bg-[var(--md-paper-3)]" />
      {right}
    </div>
  );

  // Loading: a slim placeholder under the header. Empty: render nothing.
  if (rows === null) {
    return (
      <div className="flex flex-col gap-3">
        {header()}
        <LoadingState
          spacingClassName="py-6"
          textClassName="font-mono text-[13px] normal-case tracking-normal"
        >
          Loading public tournaments…
        </LoadingState>
      </div>
    );
  }
  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {header(
        <span className="whitespace-nowrap font-mono text-[10px] text-[var(--md-ink-muted)]">
          {rows.length} open now
        </span>,
      )}
      <div style={{ borderTop: "2px solid var(--md-ink)" }}>
        {rows.map((t) => (
          <PublicRow key={t.tournamentId} t={t} />
        ))}
      </div>
    </div>
  );
}
