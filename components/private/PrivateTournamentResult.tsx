"use client";

import { useEffect, useRef } from "react";
import { BracketView } from "@/components/BracketView";
import { getSavedUser } from "@/lib/tournamentSession";
import { privateModeLabel } from "@/lib/privateTournament";
import type { PrivateCompletedResponse } from "@/components/private/types";

// Final standing label for one entrant row.
function statusLabel(e: {
  status: string;
  finalStatus: string | null;
  finalRecordW: number | null;
  finalRecordL: number | null;
}): string {
  if (e.status === "bot_replaced") return "🤖 Bot (timed out)";
  const rec =
    e.finalRecordW != null && e.finalRecordL != null
      ? `${e.finalRecordW}–${e.finalRecordL}`
      : null;
  // finalStatus carries the human round label (e.g. "Champion", "Lost R1") OR
  // "Lost Play-In" for a size-20 play-in casualty.
  const status = e.finalStatus ?? "Final";
  return rec ? `${rec} · ${status}` : status;
}

export function PrivateTournamentResult({
  data,
}: {
  data: PrivateCompletedResponse;
}) {
  const you = data.you;
  // The viewer's bracket team id (only when creds identified an entry). Public
  // viewers get an un-highlighted bracket.
  const youId = you?.teamId;

  // On open, if the viewer is an entrant with an unviewed final, clear the badge.
  const marked = useRef(false);
  useEffect(() => {
    if (marked.current) return;
    if (!you || !you.needsAttention) return;
    const u = getSavedUser();
    if (!u) return;
    marked.current = true;
    fetch("/api/private-tournament/mark-viewed", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: u.username,
        pin: u.pin,
        tournamentId: data.tournamentId,
      }),
    }).catch(() => {});
  }, [you, data.tournamentId]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      {/* Header. */}
      <div className="md-card md-card--lift flex flex-col items-center gap-3 p-5 text-center">
        <div className="md-capsule md-capsule--teal">
          🏆 {data.championName ?? "Champion"}
        </div>
        <div className="font-display text-3xl font-bold break-words">
          {data.name}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span
            className="md-capsule"
            style={
              data.mode === "hoopiq"
                ? { background: "var(--md-ink)", color: "var(--md-white)" }
                : undefined
            }
          >
            {privateModeLabel(data.mode)}
          </span>
          <span className="md-capsule">{data.size} teams</span>
          <span className="font-display text-xs uppercase tracking-wide text-[var(--md-ink-muted)]">
            Hosted by {data.adminName}
          </span>
        </div>
        {you && (
          <div className="flex items-center gap-1.5 font-display text-[10px] uppercase tracking-wide text-[var(--md-ink-muted)]">
            <span
              className="inline-block h-3 w-3 border-2 border-[var(--md-ink)]"
              style={{ background: "var(--md-yellow)" }}
            />
            <span>★ your team</span>
          </div>
        )}
      </div>

      {/* Final standings. */}
      <div className="md-card flex flex-col gap-2 p-4">
        <span className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
          Final standings
        </span>
        <div className="flex flex-col divide-y divide-[var(--md-paper-3)]">
          {data.entries.map((e, i) => (
            <div
              key={`${e.userName}-${i}`}
              className="flex items-center justify-between gap-2 py-1.5"
            >
              <span className="min-w-0 truncate font-display text-sm font-bold">
                {e.teamName ?? e.userName}
              </span>
              <span className="shrink-0 font-display text-[11px] text-[var(--md-ink-muted)]">
                {statusLabel(e)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* The bracket. */}
      {data.bracket ? (
        <div className="flex flex-col gap-3">
          <div className="md-capsule self-start">The Bracket</div>
          <BracketView bracket={data.bracket} youId={youId} />
        </div>
      ) : (
        <div className="md-card p-4 text-center font-display text-sm text-[var(--md-ink-muted)]">
          The bracket isn&rsquo;t available for this tournament.
        </div>
      )}
    </div>
  );
}
