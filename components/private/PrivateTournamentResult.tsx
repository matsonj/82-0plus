"use client";

import { useEffect, useRef, useState } from "react";
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
import { copyText } from "@/lib/copyText";
import { SITE_URL } from "@/lib/site";

// Final standings rank: most playoff wins first, then better net margin. A
// timed-out (bot_replaced) entrant is DISPLAYED as "Bot (timed out)" with its
// W-L/margin hidden — so it must rank at the BOTTOM, regardless of the replacement
// bot's stored final record (which finalization writes back onto the entry).
function standingsRank(e: PrivateCompletedEntry): [number, number] {
  if (e.status === "bot_replaced") return [-Infinity, -Infinity];
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

  const [shareCopied, setShareCopied] = useState(false);
  const fullShare = `${SITE_URL}/p/${data.tournamentId}`;

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

  // Sort entries for the standings table.
  const sortedEntries = [...data.entries].sort((a, b) => {
    const [aw, am] = standingsRank(a);
    const [bw, bm] = standingsRank(b);
    return bw - aw || bm - am;
  });

  // Viewer's own entry for the footer callout.
  const myEntry = you?.entryId
    ? sortedEntries.find((e) => e.entryId === you.entryId)
    : undefined;
  const myRank = myEntry
    ? sortedEntries.indexOf(myEntry) + 1
    : undefined;
  const myStatus = myEntry ? formatTournamentStatus(myEntry.finalStatus) : undefined;

  return (
    <div className="flex flex-col gap-6">
      {/* Page header: cobalt kicker + big title + champion badge */}
      <div className="flex flex-col gap-2 border-b-2 border-[var(--md-ink)] pb-5 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <div>
            <span className="md-capsule md-capsule--cobalt inline-flex text-[11px]">
              Private Tournament
            </span>
          </div>
          <h1
            className="font-cover leading-none text-[var(--md-ink)]"
            style={{ fontSize: "clamp(28px, 5vw, 56px)", textTransform: "uppercase" }}
          >
            {data.name}
          </h1>
          <div className="font-byline text-[11px] uppercase tracking-[0.1em] text-[var(--md-ink-muted)]">
            Final · {data.size} Teams · Single Elim
          </div>
        </div>

        {/* Champion badge — top-right on desktop */}
        {data.championName && (
          <div
            className="mt-3 flex shrink-0 items-center gap-3 self-start border-2 border-[var(--md-ink)] px-4 py-3 md:mt-0"
            style={{ background: "var(--md-yellow)", boxShadow: "var(--md-shadow-sm)" }}
          >
            <span className="text-[22px]">♛</span>
            <div>
              <div className="font-cond text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--md-ink)]">
                Champion
              </div>
              <div
                className="font-archivo leading-tight text-[var(--md-ink)]"
                style={{ fontSize: 20, fontWeight: 800, fontVariationSettings: '"wdth" 100' }}
              >
                {data.championName}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Final standings — tabular; the viewer's own team highlighted yellow. */}
      <div className="flex flex-col gap-2">
        <span className="font-cond text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--md-ink)]">
          Final Standings
        </span>
        <div className="overflow-x-auto">
          {/* A real table so every column shares ONE width across all rows —
              fixed layout + explicit column widths keep it aligned. */}
          <table className="w-full min-w-[460px] table-fixed border-collapse">
            <colgroup>
              <col />
              <col style={{ width: 64 }} />
              <col style={{ width: 72 }} />
              <col style={{ width: 64 }} />
              <col style={{ width: 124 }} />
            </colgroup>
            <thead>
              <tr
                className="text-left"
                style={{ borderBottom: "2px solid var(--md-ink)" }}
              >
                <th className="pb-1 pr-1 font-cond text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--md-ink-muted)]">
                  Team
                </th>
                <th className="pb-1 pr-1 text-right font-cond text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--md-ink-muted)]">
                  Net
                </th>
                <th className="pb-1 pr-1 text-right font-cond text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--md-ink-muted)]">
                  Reg
                </th>
                <th className="pb-1 pr-1 text-right font-cond text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--md-ink-muted)]">
                  Playoff
                </th>
                <th className="pb-1 pr-1 text-right font-cond text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--md-ink-muted)]">
                  Round
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedEntries.map((e, i) => {
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
                    style={{
                      borderBottom: "1px solid var(--md-paper-3)",
                      background: mine ? "var(--md-yellow)" : undefined,
                    }}
                  >
                    <td className="truncate py-1.5 pr-1 font-mono text-[12px] font-bold tabular-nums">
                      {mine ? "★ " : ""}
                      {e.teamName ?? e.userName}
                    </td>
                    <td className="py-1.5 pr-1 text-right font-mono text-[12px] tabular-nums">
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
                    <td className="py-1.5 pr-1 text-right font-mono text-[12px] tabular-nums text-[var(--md-ink-muted)]">
                      {reg ?? "—"}
                    </td>
                    <td className="py-1.5 pr-1 text-right font-mono text-[12px] tabular-nums">
                      {playoff ?? "—"}
                    </td>
                    <td className="whitespace-nowrap py-1.5 pr-1 text-right font-mono text-[11px] text-[var(--md-ink-muted)]">
                      {round}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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

      {/* The bracket — BracketView handles horizontal-desktop / stacked-mobile */}
      {data.bracket ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="font-cond text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--md-ink)]">
              The Bracket
            </span>
            <div className="flex-1 border-t border-[var(--md-paper-3)]" />
            <span className="font-mono text-[10px] text-[var(--md-ink-muted)]">
              Seed · Record
            </span>
          </div>
          {/* Private tournaments share one board, so grey+italicise an opponent's
              players that you also drafted — same as daily. */}
          <BracketView bracket={data.bracket} youId={youId} sharedBoard />
        </div>
      ) : (
        <div
          className="border-2 border-[var(--md-ink)] bg-[var(--md-white)] p-4 text-center font-mono text-[13px] text-[var(--md-ink-muted)]"
        >
          The bracket isn&rsquo;t available for this tournament.
        </div>
      )}

      {/* Viewer's own result callout + share button */}
      <div
        className="flex flex-wrap items-center justify-between gap-4 border-t-2 border-[var(--md-ink)] pt-5"
      >
        <div className="flex items-baseline gap-2 flex-wrap">
          {myRank != null && myEntry && (
            <>
              <span
                className="font-cond text-[13px] font-bold uppercase tracking-wide"
                style={{ background: "var(--md-ink)", color: "var(--md-paper)", padding: "2px 8px" }}
              >
                {myEntry.teamName ?? myEntry.userName}
              </span>
              <span className="font-display text-[13px] text-[var(--md-ink-muted)]">finished</span>
              <span className="font-cover text-[var(--md-ink)]" style={{ fontSize: 22, textTransform: "uppercase" }}>
                Top {myRank}
              </span>
              {myStatus && (
                <span className="font-display text-[13px] text-[var(--md-ink-muted)]">
                  — {myStatus}
                </span>
              )}
            </>
          )}
          {!myRank && (
            <span className="font-display text-[13px] text-[var(--md-ink-muted)]">
              {data.championName ? `Champion: ${data.championName}` : "Tournament complete"}
            </span>
          )}
        </div>

        <button
          type="button"
          className="md-btn md-btn--lg shrink-0"
          style={{ boxShadow: "var(--md-shadow-pop)" }}
          onClick={async () => {
            if (await copyText(fullShare)) {
              setShareCopied(true);
              setTimeout(() => setShareCopied(false), 1500);
            }
          }}
        >
          <span>⎘</span>
          {shareCopied ? "Copied!" : "Share the Bracket"}
        </button>
      </div>

      {/* Host-only teardown — quiet, confirm-gated. */}
      {you?.isAdmin && (
        <div className="flex justify-center">
          <DeleteTournamentControl tournamentId={data.tournamentId} />
        </div>
      )}
    </div>
  );
}
