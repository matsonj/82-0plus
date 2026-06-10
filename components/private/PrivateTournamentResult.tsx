"use client";

import { useEffect, useRef } from "react";
import { BracketView } from "@/components/BracketView";
import { getSavedUser } from "@/lib/tournamentSession";
import { DeleteTournamentControl } from "@/components/private/DeleteTournamentControl";
import type { PrivateCompletedResponse } from "@/components/private/types";
import {
  privateModeLabel,
  formatPrivateEntryStatus,
  formatTournamentStatus,
  formatRecord,
  formatSignedMargin,
} from "@/lib/tournamentLabels";
import type { PrivateCompletedEntry } from "@/components/private/types";

// Final standings rank: most playoff wins first, then better net margin. Bot-
// replaced / null records sort to the bottom.
function standingsRank(e: PrivateCompletedEntry): [number, number] {
  return [e.finalRecordW ?? -1, e.finalRealizedMargin ?? -Infinity];
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

      {/* Final standings — tabular; the viewer's own team highlighted yellow. */}
      <div className="md-card flex flex-col gap-2 p-4">
        <span className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
          Final standings
        </span>
        <div className="overflow-x-auto">
          {/* A real table so every column shares ONE width across all rows —
              fixed layout + explicit column widths keep it aligned. */}
          <table className="w-full min-w-[460px] table-fixed border-collapse font-display">
            <colgroup>
              <col />
              <col className="w-[64px]" />
              <col className="w-[72px]" />
              <col className="w-[64px]" />
              <col className="w-[124px]" />
            </colgroup>
            <thead>
              <tr className="border-b-2 border-[var(--md-ink)] text-[9px] font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
                <th className="px-1 pb-1 text-left">Team</th>
                <th className="px-1 pb-1 text-right">Net</th>
                <th className="px-1 pb-1 text-right">Reg</th>
                <th className="px-1 pb-1 text-right">Playoff</th>
                <th className="px-1 pb-1 text-right">Round</th>
              </tr>
            </thead>
            <tbody>
              {[...data.entries]
                .sort((a, b) => {
                  const [aw, am] = standingsRank(a);
                  const [bw, bm] = standingsRank(b);
                  return bw - aw || bm - am;
                })
                .map((e, i) => {
                  const mine = !!you?.entryId && e.entryId === you.entryId;
                  const isBot = e.status === "bot_replaced";
                  const margin =
                    !isBot && e.finalRealizedMargin != null
                      ? formatSignedMargin(e.finalRealizedMargin)
                      : null;
                  const reg = formatRecord(e.regW, e.regL);
                  const playoff = isBot
                    ? null
                    : formatRecord(e.finalRecordW, e.finalRecordL);
                  const round = isBot
                    ? formatPrivateEntryStatus(e.status)
                    : formatTournamentStatus(e.finalStatus);
                  return (
                    <tr
                      key={e.entryId || `${e.userName}-${i}`}
                      className="border-b border-[var(--md-paper-3)] text-[12px]"
                      style={mine ? { background: "var(--md-yellow)" } : undefined}
                    >
                      <td className="truncate px-1 py-1.5 font-bold">
                        {mine ? "★ " : ""}
                        {e.teamName ?? e.userName}
                      </td>
                      <td className="px-1 py-1.5 text-right tabular-nums">
                        {margin ? (
                          <span
                            style={{
                              color: margin.positive
                                ? "var(--md-teal)"
                                : "var(--md-coral)",
                            }}
                          >
                            {margin.text}
                          </span>
                        ) : (
                          <span className="text-[var(--md-ink-muted)]">—</span>
                        )}
                      </td>
                      <td className="px-1 py-1.5 text-right tabular-nums text-[var(--md-ink-muted)]">
                        {reg ?? "—"}
                      </td>
                      <td className="px-1 py-1.5 text-right tabular-nums">
                        {playoff ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-1 py-1.5 text-right text-[11px] text-[var(--md-ink-muted)]">
                        {round}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* The bracket. */}
      {data.bracket ? (
        <div className="flex flex-col gap-3">
          <div className="md-capsule self-start">The Bracket</div>
          {/* Private tournaments share one board, so grey+italicise an opponent's
              players that you also drafted — same as daily. */}
          <BracketView bracket={data.bracket} youId={youId} sharedBoard />
        </div>
      ) : (
        <div className="md-card p-4 text-center font-display text-sm text-[var(--md-ink-muted)]">
          The bracket isn&rsquo;t available for this tournament.
        </div>
      )}

      {/* Host-only teardown — quiet, confirm-gated. */}
      {you?.isAdmin && (
        <div className="flex justify-center">
          <DeleteTournamentControl tournamentId={data.tournamentId} />
        </div>
      )}
    </div>
  );
}
