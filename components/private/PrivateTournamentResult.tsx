"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BracketView } from "@/components/BracketView";
import { SimulateReveal } from "@/components/SimulateReveal";
import { buildRevealScript } from "@/lib/revealPath";
import { getSavedUser } from "@/lib/tournamentSession";
import { DeleteTournamentControl } from "@/components/private/DeleteTournamentControl";
import type { PrivateCompletedResponse } from "@/components/private/types";
import {
  privateModeLabel,
  formatPrivateEntryStatus,
  formatTournamentStatus,
  formatRecord,
  formatSignedMargin,
  playInEarnedSeeds,
} from "@/lib/tournamentLabels";
import type { PrivateCompletedEntry } from "@/components/private/types";
import { copyText } from "@/lib/copyText";
import { SITE_URL } from "@/lib/site";
import { Button, Capsule } from "@/components/ui";
import type { BracketTeam } from "@/lib/types";

// ── Standings ordering (elimination round first) ──────────────────────────────
// Rank by how far a team advanced (round reached), then playoff record, then net
// margin. The stored `finalStatus` strings are a fixed set (see statusLabel):
// Champion › Lost Finals › Lost Conf Finals › Lost Semis › Lost R1 › Lost Play-In.
function statusOrdinal(status: string | null | undefined): number {
  switch (status) {
    case "Champion": return 6;
    case "Lost Finals": return 5;
    case "Lost Conf Finals": return 4;
    case "Lost Semis": return 3;
    case "Lost R1": return 2;
    case "Lost Play-In": return 1;
    default: return 0; // "Eliminated" / unknown
  }
}

// Friendly RESULT-column phrasing: achievement framing for the deep runs; the
// loss framing (in flame) is kept only for the play-in exit. Unknown → stored.
function resultLabel(status: string | null | undefined): string {
  switch (status) {
    case "Champion": return "Champion";
    case "Lost Finals": return "Runner-Up";
    case "Lost Conf Finals": return "Conf Finals";
    case "Lost Semis": return "Semifinals";
    case "Lost R1": return "Round 1";
    case "Lost Play-In": return "Lost Play-In";
    default: return formatTournamentStatus(status);
  }
}

type StandingTier = "champion" | "podium" | "body" | "tail";

// The editorial leaderboard tapers weight by finish: a gold champion hero, a
// heavier podium for the deep runs, plain body rows, and a muted tail for the
// play-in losers / timed-out bots.
const TIER_STYLE: Record<
  StandingTier,
  {
    pad: string;
    numeral: string;
    numeralColor: string;
    name: string;
    nameWeight: number;
    nameColor: string;
    nameGap: number;
    metaColor: string;
    metaOpacity: number;
    metaSize: string;
    regSize: string;
    regOpacity: number;
    playoffSize: string;
    playoffMuted: boolean;
    netSize: string;
    resultSize: string;
    resultWeight: number;
    resultMuted: boolean;
  }
> = {
  champion: {
    pad: "py-4",
    numeral: "text-[38px]", numeralColor: "var(--md-ink)",
    name: "text-[26px]", nameWeight: 800, nameColor: "var(--md-ink)", nameGap: 3,
    metaColor: "var(--md-ink)", metaOpacity: 0.72, metaSize: "text-[11px]",
    regSize: "text-[13px]", regOpacity: 0.6,
    playoffSize: "text-[16px]", playoffMuted: false,
    netSize: "text-[15px]",
    resultSize: "text-[13px]", resultWeight: 700, resultMuted: false,
  },
  podium: {
    pad: "py-[13px]",
    numeral: "text-[28px]", numeralColor: "var(--md-ink)",
    name: "text-[20px]", nameWeight: 700, nameColor: "var(--md-ink)", nameGap: 2,
    metaColor: "var(--md-ink-muted)", metaOpacity: 1, metaSize: "text-[10px]",
    regSize: "text-[12px]", regOpacity: 1,
    playoffSize: "text-[14px]", playoffMuted: false,
    netSize: "text-[13px]",
    resultSize: "text-[12px]", resultWeight: 600, resultMuted: false,
  },
  body: {
    pad: "py-[9px]",
    numeral: "text-[22px]", numeralColor: "var(--md-ink)",
    name: "text-[17px]", nameWeight: 600, nameColor: "var(--md-ink)", nameGap: 1,
    metaColor: "var(--md-ink-muted)", metaOpacity: 1, metaSize: "text-[10px]",
    regSize: "text-[12px]", regOpacity: 1,
    playoffSize: "text-[14px]", playoffMuted: false,
    netSize: "text-[13px]",
    resultSize: "text-[11px]", resultWeight: 500, resultMuted: true,
  },
  tail: {
    pad: "py-[7px]",
    numeral: "text-[18px]", numeralColor: "var(--md-ink-muted)",
    name: "text-[14px]", nameWeight: 500, nameColor: "var(--md-ink-muted)", nameGap: 1,
    metaColor: "var(--md-ink-muted)", metaOpacity: 0.75, metaSize: "text-[9px]",
    regSize: "text-[11px]", regOpacity: 0.7,
    playoffSize: "text-[12px]", playoffMuted: true,
    netSize: "text-[12px]",
    resultSize: "text-[11px]", resultWeight: 500, resultMuted: true,
  },
};

function rowTier(rankIndex: number, status: string | null | undefined, isBot: boolean): StandingTier {
  if (rankIndex === 0 && status === "Champion") return "champion";
  if (isBot || status === "Lost Play-In") return "tail";
  if (rankIndex <= 2) return "podium";
  return "body";
}

// Champion crown (matches the bracket terminus + header badge).
function CrownMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M3 7L7 11L12 4L17 11L21 7L19.5 19H4.5L3 7Z" fill="var(--md-ink)" />
      <rect x="4.5" y="19.5" width="15" height="2.2" fill="var(--md-ink)" />
    </svg>
  );
}

// One leaderboard row: [Rk] [Team + conf·seed] [Reg] [Playoff] [Net] [Result].
function StandingRow({
  rank,
  entry,
  team,
  mine,
}: {
  rank: number;
  entry: PrivateCompletedEntry;
  team: BracketTeam | undefined;
  mine: boolean;
}) {
  const isBot = entry.status === "bot_replaced";
  const tier = rowTier(rank - 1, entry.finalStatus, isBot);
  const t = TIER_STYLE[tier];

  const teamName = entry.teamName ?? entry.userName;
  const meta = team ? `${team.conference} · ${team.seed} seed` : null;

  const reg = formatRecord(entry.regW, entry.regL);
  const playoff = isBot ? null : formatRecord(entry.finalRecordW, entry.finalRecordL);
  const margin =
    !isBot && entry.finalRealizedMargin != null
      ? formatSignedMargin(entry.finalRealizedMargin)
      : null;
  const result = isBot ? formatPrivateEntryStatus(entry.status) : resultLabel(entry.finalStatus);

  const isPlayInLoss = entry.finalStatus === "Lost Play-In";
  const resultColor = isPlayInLoss
    ? "var(--md-coral-deep)"
    : t.resultMuted
      ? "var(--md-ink-muted)"
      : "var(--md-ink)";
  const nameColor = t.nameColor;

  // Row chrome: champion = gold hero; everyone else = hairline-separated. The
  // viewer's own row (when not champion) gets a light translucent cobalt fill —
  // never yellow.
  const rowStyle: React.CSSProperties =
    tier === "champion"
      ? {
          background: "var(--md-yellow)",
          border: "2px solid var(--md-ink)",
          boxShadow: "3px 3px 0 0 var(--md-ink)",
        }
      : {
          borderBottom: "1px solid var(--md-paper-3)",
          background: mine
            ? "color-mix(in srgb, var(--md-cobalt) 14%, transparent)"
            : undefined,
        };

  return (
    <div
      className={`flex items-center gap-4 px-3.5 ${t.pad} ${tier === "champion" ? "mb-2" : ""}`}
      style={rowStyle}
    >
      {/* Rank */}
      <div
        className={`w-14 shrink-0 text-center font-cover leading-[80%] ${t.numeral}`}
        style={{ color: t.numeralColor }}
      >
        {rank}
      </div>
      {/* Team + meta */}
      <div className="flex min-w-0 grow flex-col" style={{ gap: t.nameGap }}>
        <div className="flex items-center gap-2">
          {tier === "champion" && <CrownMark />}
          <span
            className={`truncate font-archivo uppercase leading-[105%] ${t.name}`}
            style={{ fontWeight: t.nameWeight, color: nameColor }}
          >
            {mine ? "★ " : ""}
            {entry.status === "bot_replaced" && !entry.teamName ? entry.userName : teamName}
          </span>
        </div>
        {meta && (
          <span
            className={`font-byline uppercase tracking-[0.06em] ${t.metaSize}`}
            style={{ color: t.metaColor, opacity: t.metaOpacity }}
          >
            {meta}
          </span>
        )}
      </div>
      {/* Reg */}
      <div
        className={`w-[90px] shrink-0 text-right font-mono tabular-nums ${t.regSize}`}
        style={{ color: "var(--md-ink-muted)", opacity: t.regOpacity }}
      >
        {reg ?? "—"}
      </div>
      {/* Playoff */}
      <div
        className={`w-[84px] shrink-0 text-right font-mono font-bold tabular-nums ${t.playoffSize}`}
        style={{ color: t.playoffMuted ? "var(--md-ink-muted)" : "var(--md-ink)", opacity: t.playoffMuted ? 0.7 : 1 }}
      >
        {playoff ?? "—"}
      </div>
      {/* Net */}
      <div
        className={`w-[76px] shrink-0 text-right font-mono font-bold tabular-nums ${t.netSize}`}
        style={{
          color: margin ? (margin.positive ? "var(--md-teal)" : "var(--md-coral)") : "var(--md-ink-muted)",
          opacity: margin ? 1 : tier === "tail" ? 0.5 : 1,
        }}
      >
        {margin ? margin.text : "—"}
      </div>
      {/* Result */}
      <div
        className={`w-[150px] shrink-0 text-right font-cond uppercase tracking-[0.08em] ${t.resultSize}`}
        style={{ fontWeight: t.resultWeight, color: resultColor }}
      >
        {result}
      </div>
    </div>
  );
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

  // The viewer's game-by-game path through this bracket (their team's run).
  const revealScript = useMemo(
    () => (data.bracket && youId ? buildRevealScript(data.bracket, { id: youId }) : null),
    [data.bracket, youId],
  );
  // An unviewed completed result the viewer played → play the SIMULATE reveal
  // first, then fall through to the summary (same as daily/classic/ranked).
  const shouldReveal = !!you?.needsAttention && (revealScript?.rounds.length ?? 0) > 0;
  const [revealDone, setRevealDone] = useState(!shouldReveal);

  // Clear the unread badge. Fired on reveal dismiss when the reveal plays; else on
  // mount (already-viewed re-opens; non-entrants never have needsAttention).
  const marked = useRef(false);
  const markViewed = useCallback(() => {
    if (marked.current) return;
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
  }, [data.tournamentId]);
  useEffect(() => {
    if (!you?.needsAttention || shouldReveal) return;
    markViewed();
  }, [you, shouldReveal, markViewed]);

  // Join each entry to its bracket team (id = `entry:<entryId>`) for conference +
  // seed, and to sub-order play-in losers (decider loser seed 9 above 9v10 seed 10).
  // Earned play-in seeds are applied so survivors read their earned 7/8 (and losers
  // 9/10) even on brackets stored before the engine wrote it back.
  const earnedSeeds = data.bracket
    ? playInEarnedSeeds(data.bracket)
    : new Map<string, number>();
  const teamByEntry = new Map(
    (data.bracket?.teams ?? []).map(
      (t) =>
        [t.id, earnedSeeds.has(t.id) ? { ...t, seed: earnedSeeds.get(t.id)! } : t] as const,
    ),
  );
  const teamOf = (e: PrivateCompletedEntry) => teamByEntry.get(`entry:${e.entryId}`);

  // Rank: deeper run first, then playoff record, then net margin. Timed-out bots
  // sink to the bottom; play-in losers are sub-ordered by earned seed.
  const sortedEntries = [...data.entries].sort((a, b) => {
    const aBot = a.status === "bot_replaced";
    const bBot = b.status === "bot_replaced";
    if (aBot !== bBot) return aBot ? 1 : -1;
    if (aBot && bBot)
      return (a.teamName ?? a.userName).localeCompare(b.teamName ?? b.userName);

    const ao = statusOrdinal(a.finalStatus);
    const bo = statusOrdinal(b.finalStatus);
    if (ao !== bo) return bo - ao;

    if (ao === 1) {
      const as = teamOf(a)?.seed ?? 99;
      const bs = teamOf(b)?.seed ?? 99;
      if (as !== bs) return as - bs;
      return (b.finalRealizedMargin ?? -Infinity) - (a.finalRealizedMargin ?? -Infinity);
    }
    const aw = a.finalRecordW ?? -1;
    const bw = b.finalRecordW ?? -1;
    if (aw !== bw) return bw - aw;
    return (b.finalRealizedMargin ?? -Infinity) - (a.finalRealizedMargin ?? -Infinity);
  });

  // Viewer's own entry for the footer callout.
  const myEntry = you?.entryId
    ? sortedEntries.find((e) => e.entryId === you.entryId)
    : undefined;
  const myRank = myEntry
    ? sortedEntries.indexOf(myEntry) + 1
    : undefined;
  const myStatus = myEntry ? formatTournamentStatus(myEntry.finalStatus) : undefined;

  // Fresh, unviewed result the viewer played: play the SIMULATE reveal first, then
  // dismiss into the summary below (and clear the unread badge).
  if (!revealDone && revealScript) {
    return (
      <SimulateReveal
        script={revealScript}
        mode={data.mode === "hoopiq" ? "hoopiq" : "classic"}
        onDismiss={() => {
          setRevealDone(true);
          markViewed();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Page header: cobalt kicker + big title + champion badge */}
      <div className="flex flex-col gap-2 border-b-2 border-[var(--md-ink)] pb-5 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <div>
            <Capsule tone="cobalt" className="inline-flex text-[11px]">
              Private Tournament
            </Capsule>
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

      {/* Final standings — editorial leaderboard. Champion gold hero, weight
          tapers by finish; the viewer's own row is tinted cobalt (never yellow). */}
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline gap-4">
          <span className="font-cond text-[13px] font-semibold uppercase tracking-[0.16em] text-[var(--md-ink)]">
            Final Standings
          </span>
          <div className="h-px grow bg-[var(--md-paper-3)]" />
          <span className="font-mono text-[10px] text-[var(--md-ink-muted)]">
            {data.entries.length} entrants · ranked by round reached, then record
          </span>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[620px]">
            {/* Column header */}
            <div className="flex items-center gap-4 border-b-2 border-[var(--md-ink)] px-3.5 pb-1.5">
              <span className="w-14 shrink-0 font-cond text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--md-ink-muted)]">
                Rk
              </span>
              <span className="min-w-0 grow font-cond text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--md-ink-muted)]">
                Team
              </span>
              <span className="w-[90px] shrink-0 text-right font-cond text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--md-ink-muted)]">
                Reg
              </span>
              <span className="w-[84px] shrink-0 text-right font-cond text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--md-ink-muted)]">
                Playoff
              </span>
              <span className="w-[76px] shrink-0 text-right font-cond text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--md-ink-muted)]">
                Net
              </span>
              <span className="w-[150px] shrink-0 text-right font-cond text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--md-ink-muted)]">
                Result
              </span>
            </div>
            {/* Rows */}
            {sortedEntries.map((e, i) => (
              <StandingRow
                key={e.entryId || `${e.userName}-${i}`}
                rank={i + 1}
                entry={e}
                team={teamOf(e)}
                mine={!!you?.entryId && e.entryId === you.entryId}
              />
            ))}
          </div>
        </div>
        {you && (
          <div className="flex items-center gap-1.5 font-display text-[10px] uppercase tracking-wide text-[var(--md-ink-muted)]">
            <span className="inline-block h-3 w-3" style={{ background: "var(--md-cobalt)" }} />
            <span>★ your team</span>
          </div>
        )}
      </div>

      {/* Viewer's own result callout + share — sits above the bracket. */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t-2 border-[var(--md-ink)] pt-5">
        <div className="flex flex-wrap items-baseline gap-2">
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
                <span className="font-display text-[13px] text-[var(--md-ink-muted)]">· {myStatus}</span>
              )}
            </>
          )}
          {!myRank && (
            <span className="font-display text-[13px] text-[var(--md-ink-muted)]">
              {data.championName ? `Champion: ${data.championName}` : "Tournament complete"}
            </span>
          )}
        </div>

        <Button
          type="button"
          size="lg"
          className="shrink-0"
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
        </Button>
      </div>

      {/* The bracket — BracketView handles horizontal-desktop / stacked-mobile */}
      {data.bracket ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="font-cond text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--md-ink)]">
              The Bracket
            </span>
            <div className="flex-1 border-t border-[var(--md-paper-3)]" />
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

      {/* Host-only teardown — quiet, confirm-gated. */}
      {you?.isAdmin && (
        <div className="flex justify-center">
          <DeleteTournamentControl tournamentId={data.tournamentId} />
        </div>
      )}
    </div>
  );
}
