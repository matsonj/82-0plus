"use client";

import { useState } from "react";
import type {
  TournamentRunResponse,
  BracketResult,
  BracketTeam,
} from "@/lib/types";
import { BracketView } from "@/components/BracketView";
import { buildTournamentShareImage } from "@/lib/shareImage";
import { SITE_URL } from "@/lib/site";
import { regWinsFromSeedNet, tierForSeedNet } from "@/lib/tier";

// Reg-season W-L from the team rating (the five's net), via the shared tier
// projection (single source of truth for wins = 41 + 2.7·net, clamped to 82).
function regSeasonRecord(seedNet: number): { w: number; l: number } {
  const w = regWinsFromSeedNet(seedNet);
  return { w, l: 82 - w };
}

// Compact "how far" label for the share image.
function shortReached(reachedRound: number, isChampion: boolean): string {
  if (isChampion) return "Champion";
  return ["Lost R1", "Lost Conf Semis", "Lost Conf Finals", "Lost the Final"][
    reachedRound
  ] ?? "Eliminated";
}

// Signed net-rating string, deliberately ROUNDED TO A WHOLE NUMBER so the team
// rating reads as a ballpark, not a precise competitive figure. e.g. "+5" / "−3".
function fmtNet(n: number): string {
  const v = Math.round(n);
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}`;
}

// The user's own roster (five starters with the captain flagged, then the sixth
// man) — revealed by the "Show roster" toggle on the results page.
function MyRoster({ team }: { team: BracketTeam }) {
  if (!team.roster) return null;
  return (
    <div className="mt-3 border-t-2 border-dashed border-[var(--md-ink)] pt-2 text-left">
      {team.roster.map((p, i) => (
        <div
          key={`${p.team}-${p.name}-${i}`}
          className="flex items-baseline justify-between gap-2 py-0.5 font-display text-[12px]"
        >
          <span className="min-w-0 truncate">
            {p.name}
            {p.captain ? (
              <span className="ml-1 inline-block border border-[var(--md-ink)] bg-[var(--md-yellow)] px-1 text-[8px] font-bold uppercase leading-tight tracking-wide align-middle">
                C
              </span>
            ) : null}
          </span>
          <span className="shrink-0 text-[11px] text-[var(--md-orange-deep)]">
            {p.team} &rsquo;{String(p.season).slice(2)}
          </span>
        </div>
      ))}
      {team.sixthMan && (
        <>
          <div className="my-1 border-t border-[var(--md-paper-3)]" />
          <div className="font-display text-[9px] font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
            Sixth Man
          </div>
          <div className="flex items-baseline justify-between gap-2 py-0.5 font-display text-[12px]">
            <span className="min-w-0 truncate">{team.sixthMan.name}</span>
            <span className="shrink-0 text-[11px] text-[var(--md-orange-deep)]">
              {team.sixthMan.team} &rsquo;{String(team.sixthMan.season).slice(2)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// Round labels for the user's record summary, by round index (0..3).
const RECORD_ROUND_LABEL = ["R1", "R2", "R3", "FINAL"];

interface RoundRecord {
  label: string;
  wins: number;
  losses: number;
  eliminated: boolean;
}

// Walk the bracket round by round and pull out the user's own game record:
// for each round their team appears in, find the series with their id and read
// their wins (scoreHi if hiId else scoreLo) vs the opponent's. The round they
// lost is flagged "(eliminated)".
function computeRoundRecords(
  bracket: BracketResult,
  youId: string,
): { rows: RoundRecord[]; totalW: number; totalL: number } {
  const rows: RoundRecord[] = [];
  let totalW = 0;
  let totalL = 0;
  bracket.rounds.forEach((round, r) => {
    const s = round.find((x) => x.hiId === youId || x.loId === youId);
    if (!s) return;
    const youAreHi = s.hiId === youId;
    const wins = youAreHi ? s.scoreHi : s.scoreLo;
    const losses = youAreHi ? s.scoreLo : s.scoreHi;
    totalW += wins;
    totalL += losses;
    rows.push({
      label: RECORD_ROUND_LABEL[r] ?? `R${r + 1}`,
      wins,
      losses,
      eliminated: s.winnerId !== youId,
    });
  });
  return { rows, totalW, totalL };
}

// A tidy md-card block of the user's per-round + total game record.
function RecordSummary({
  bracket,
  youId,
}: {
  bracket: BracketResult;
  youId: string;
}) {
  const { rows, totalW, totalL } = computeRoundRecords(bracket, youId);
  if (rows.length === 0) return null;
  return (
    <div className="md-card p-3 sm:p-4">
      <div className="mb-2 font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
        Your record
      </div>
      <div className="grid gap-0.5">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-baseline justify-between gap-3 font-display text-sm tabular-nums"
          >
            <span className="text-[var(--md-ink-muted)]">{row.label}</span>
            <span>
              {row.wins}&ndash;{row.losses}
              {row.eliminated ? (
                <span className="ml-1 text-[var(--md-coral)]">(eliminated)</span>
              ) : null}
            </span>
          </div>
        ))}
        <div className="mt-1 flex items-baseline justify-between gap-3 border-t-2 border-[var(--md-ink)] pt-1 font-display text-sm font-bold tabular-nums">
          <span>TOT</span>
          <span>
            {totalW}&ndash;{totalL}
          </span>
        </div>
      </div>
    </div>
  );
}

// reachedRound: 0 = lost R1 … 4 = champion. Maps to a player-facing phrase.
function reachedLabel(reachedRound: number, isChampion: boolean): string {
  if (isChampion) return "🏆 Champion";
  switch (reachedRound) {
    case 0:
      return "Lost in Round 1";
    case 1:
      return "Lost in the Conference Semifinals";
    case 2:
      return "Lost in the Conference Finals";
    case 3:
      return "Lost in the Final";
    default:
      return "Eliminated";
  }
}

// A four-pip progress meter (R1 → Final). Filled pips = rounds the team won
// through; the last filled pip glows teal for a champion.
function ProgressPips({
  reachedRound,
  isChampion,
}: {
  reachedRound: number;
  isChampion: boolean;
}) {
  const labels = ["R1", "Semis", "Conf F", "Final"];
  return (
    <div className="flex items-stretch justify-center gap-1.5">
      {labels.map((lbl, i) => {
        // A team that reached round R cleared rounds 0..R-1; the champion
        // (reachedRound 4) fills all four.
        const filled = i < reachedRound;
        return (
          <div
            key={lbl}
            className="flex flex-1 flex-col items-center gap-1"
            style={{ maxWidth: 64 }}
          >
            <div
              className="h-2 w-full border-2 border-[var(--md-ink)]"
              style={{
                background: filled
                  ? isChampion
                    ? "var(--md-teal-bright)"
                    : "var(--md-yellow)"
                  : "var(--md-paper-2)",
              }}
            />
            <span className="font-display text-[9px] uppercase tracking-wide text-[var(--md-ink-muted)]">
              {lbl}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function TournamentResults({
  data,
  onReset,
}: {
  data: TournamentRunResponse;
  onReset?: () => void;
}) {
  const { bracket, you } = data;
  const isChampion = bracket.championId === you.id;
  const myTeam = bracket.teams.find((t) => t.id === you.id);
  const [showRoster, setShowRoster] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const shareLink = data.teamId ? `${SITE_URL}/t/${data.teamId}` : SITE_URL;

  const share = async () => {
    if (!myTeam) return;
    setSharing(true);
    try {
      const reg = regSeasonRecord(myTeam.seedNet);
      const playoff = computeRoundRecords(bracket, you.id);
      const blob = await buildTournamentShareImage({
        teamName: you.name,
        conference: you.conference,
        seed: you.seed,
        isChampion,
        reachedLabel: shortReached(you.reachedRound, isChampion),
        regWins: reg.w,
        regLosses: reg.l,
        playoffWins: playoff.totalW,
        playoffLosses: playoff.totalL,
        tier: tierForSeedNet(myTeam.seedNet)?.label,
        roster: myTeam.roster ?? [],
        sixthMan: myTeam.sixthMan,
      });
      try {
        await navigator.clipboard.writeText(shareLink); // link on the clipboard too
      } catch {
        /* clipboard blocked */
      }
      if (blob) {
        setShareUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
      }
    } finally {
      setSharing(false);
    }
  };

  const closeShare = () => {
    if (shareUrl) URL.revokeObjectURL(shareUrl);
    setShareUrl(null);
    setLinkCopied(false);
  };

  return (
    <div className="flex flex-col gap-6">
      {shareUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(56,56,56,0.55)" }}
          onClick={closeShare}
        >
          <div
            className="md-card md-card--lift w-full max-w-sm p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-display text-lg font-bold">Share your run</h3>
              <button
                type="button"
                aria-label="Close"
                onClick={closeShare}
                className="font-display text-lg text-[var(--md-ink-muted)] hover:text-[var(--md-coral)]"
              >
                ✕
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={shareUrl}
              alt="Your tournament result card"
              className="mt-3 w-full border-2 border-[var(--md-ink)]"
            />
            <p className="mt-2 text-center text-[13px] leading-snug text-[var(--md-ink-muted)]">
              <strong>Right-click to copy and share.</strong> The link is already
              on your clipboard.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                className="md-btn md-btn--sm md-btn--secondary"
                href={shareUrl}
                download="82-0-tournament.png"
              >
                Download
              </a>
              <button
                className="md-btn md-btn--sm md-btn--secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(shareLink);
                    setLinkCopied(true);
                    setTimeout(() => setLinkCopied(false), 1500);
                  } catch {
                    /* clipboard blocked */
                  }
                }}
              >
                {linkCopied ? "Link copied!" : "Copy link"}
              </button>
              <button className="md-btn md-btn--sm md-btn--ink" onClick={closeShare}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Hero — the player's run, ResultsPanel aesthetic. */}
      <div className="md-card md-card--lift flex flex-col gap-4 p-4 sm:p-5">
        <div className="text-center">
          {isChampion ? (
            <div className="md-capsule md-capsule--teal mb-3">
              🏆 Tournament Champion
            </div>
          ) : (
            <div className="md-capsule mb-3">Tournament Result</div>
          )}
          <div
            className="font-display font-bold break-words"
            style={{ fontSize: "clamp(34px, 10vw, 56px)", lineHeight: 1 }}
          >
            {you.name}
          </div>
          {/* Seed + conference as tight capsules, like ResultsPanel's headers. */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <span className="md-capsule">#{you.seed} Seed</span>
            <span
              className={`md-capsule ${
                you.conference === "West" ? "md-capsule--sky" : "md-capsule--coral"
              }`}
            >
              {you.conference}
            </span>
          </div>
          <div
            className="mt-3 font-display text-lg font-bold sm:text-xl"
            style={{ color: isChampion ? "var(--md-teal)" : "var(--md-ink)" }}
          >
            {reachedLabel(you.reachedRound, isChampion)}
          </div>
          <div className="mt-3">
            <ProgressPips reachedRound={you.reachedRound} isChampion={isChampion} />
          </div>

          {/* Team rating (the five's net at the end of Classic/HoopIQ — no
              tournament buffs, no sixth man) + a roster reveal. Kept understated
              and rounded, on purpose. */}
          {myTeam && (
            <div className="mt-3 text-[var(--md-ink-muted)]">
              <span className="font-display text-[13px]">
                Team rating{" "}
                <span className="font-bold">{fmtNet(myTeam.seedNet)}</span>
              </span>
              {myTeam.roster && (
                <>
                  <span className="px-1.5">·</span>
                  <button
                    type="button"
                    className="font-display text-[13px] font-bold text-[var(--md-blue)] underline"
                    onClick={() => setShowRoster((v) => !v)}
                  >
                    {showRoster ? "Hide roster" : "Show roster"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {myTeam && showRoster && <MyRoster team={myTeam} />}

        {/* The player's own per-round + total game record. */}
        <RecordSummary bracket={bracket} youId={you.id} />

        {/* Champion banner. */}
        <div className="border-t-2 border-[var(--md-ink)] pt-3 text-center">
          <div className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
            Champion
          </div>
          <div className="mt-1 font-display text-xl font-bold">
            🏆 {bracket.championName}
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          {myTeam && (
            <button
              className="md-btn md-btn--lg md-btn--teal"
              onClick={share}
              disabled={sharing}
            >
              {sharing ? "Building…" : "Share result"}
            </button>
          )}
          {onReset && (
            <button className="md-btn md-btn--lg md-btn--ink" onClick={onReset}>
              Back to menu
            </button>
          )}
        </div>
      </div>

      {/* The full bracket, with the user's team highlighted across rounds. */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="md-capsule">The Bracket</div>
          <div className="flex items-center gap-1.5 font-display text-[10px] uppercase tracking-wide text-[var(--md-ink-muted)]">
            <span
              className="inline-block h-3 w-3 border-2 border-[var(--md-ink)]"
              style={{ background: "var(--md-yellow)" }}
            />
            <span>★ you</span>
          </div>
        </div>
        <BracketView bracket={bracket} youId={you.id} />
      </div>
    </div>
  );
}
