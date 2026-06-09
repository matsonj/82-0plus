"use client";

import { useEffect, useMemo, useState } from "react";
import type { SimRosterLine, SimResult, GameMode } from "@/lib/types";
import { buildShareImage } from "@/lib/shareImage";
import { TierBadge } from "@/components/TierBadge";
import { PlayerCardCarousel, type CardPlayer } from "@/components/PlayerCard";
import { prefetchPlayerSeasons } from "@/lib/playerSeasons";
import { presentShare } from "@/lib/shareActions";
import { copyText } from "@/lib/copyText";
import { MIN_ELIGIBLE_WINS } from "@/lib/tier";

// One line of the net-rating breakdown: a label (+ optional detail) and the
// signed net-rating points the factor moved.
function Adj({
  label,
  detail,
  value,
}: {
  label: string;
  detail?: string;
  value: number;
}) {
  const v = Math.round(value * 10) / 10;
  const color =
    v > 0 ? "var(--md-teal)" : v < 0 ? "var(--md-coral)" : "var(--md-ink-muted)";
  return (
    <div className="flex items-baseline justify-between gap-2 font-display text-sm">
      <span>
        {label}
        {detail ? (
          <span className="text-[var(--md-ink-muted)]"> · {detail}</span>
        ) : null}
      </span>
      <span style={{ color }}>
        {v > 0 ? "+" : v < 0 ? "−" : ""}
        {Math.abs(v).toFixed(1)}
      </span>
    </div>
  );
}

export function ResultsPanel({
  roster,
  result,
  shareText,
  shareLink,
  shareReady = true,
  modeLabel,
  mode,
  isDaily = false,
  onReset,
  resetLabel,
  onEnterTournament,
  entryCtaLabel,
  entryRequiresEligible = true,
}: {
  roster: SimRosterLine[];
  result: SimResult;
  shareText: string;
  shareLink: string;
  // For daily, the signed token arrives AFTER the result renders, so the link
  // is a bare /d/<date> until then. Gate sharing on this so we never share a
  // cardless URL. Defaults true for modes whose link is ready synchronously.
  shareReady?: boolean;
  modeLabel: string;
  mode: GameMode;
  isDaily?: boolean;
  onReset: () => void;
  // Label for the secondary (ink) button — default "Play again". The private
  // interstitial uses "Back to lineup".
  resetLabel?: string;
  onEnterTournament?: () => void;
  // Override the entry-CTA label (default: "Enter this team in the …Tournament").
  // Private tournaments reuse this screen as the draft interstitial with a
  // "Add sixth man & captain" button.
  entryCtaLabel?: string;
  // Whether the entry CTA is gated by the 40-win floor. Default true (Classic/
  // Ranked free play). Private tournaments accept any roster, so pass false.
  entryRequiresEligible?: boolean;
}) {
  const { wins, losses, pf, pa, perfect, netRating } = result;
  const [shareBlob, setShareBlob] = useState<Blob | null>(null);
  // Whether the fallback auto-copy actually landed the link on the clipboard.
  const [autoCopied, setAutoCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [cardIndex, setCardIndex] = useState<number | null>(null);
  // Career cards reveal stats, so only in Classic (Ranked/Daily keep them hidden).
  const cardsOn = mode === "classic" && !isDaily;

  const cardPlayers = useMemo<CardPlayer[]>(
    () =>
      roster.map((r) => ({
        entityId: r.entity_id,
        playerName: r.player_name,
        team: r.team,
        season: r.best_season,
        positions: r.positions,
        // 🥇/🥈 on the card, matching the roster row. null → unset (no medal).
        allDef: r.allDef ?? undefined,
      })),
    [roster],
  );
  // Prefetch all five so the carousel is instant the moment a row is tapped.
  useEffect(() => {
    if (cardsOn) for (const c of cardPlayers) prefetchPlayerSeasons(c.entityId);
  }, [cardsOn, cardPlayers]);

  useEffect(() => {
    let active = true;
    buildShareImage(result, roster, modeLabel, isDaily)
      .then((b) => { if (active) setShareBlob(b); })
      .catch(() => {});
    return () => { active = false; };
  }, [result, roster, modeLabel, isDaily]);

  const share = async () => {
    if (!shareBlob || !shareReady) return;
    const outcome = await presentShare({
      blob: shareBlob,
      filename: "82-0-season.png",
      text: shareText,
      link: shareLink,
    });
    // Native share / user-cancel → nothing more. Fell back to copy → open the
    // desktop overlay (download + manual copy), noting whether copy landed.
    if (outcome === "copied" || outcome === "failed") {
      setAutoCopied(outcome === "copied");
      setShareUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(shareBlob);
      });
    }
  };

  const closeShare = () => {
    if (shareUrl) URL.revokeObjectURL(shareUrl);
    setShareUrl(null);
    setLinkCopied(false);
  };

  return (
    <>
    {cardIndex !== null && cardPlayers[cardIndex] && (
      <PlayerCardCarousel
        players={cardPlayers}
        index={cardIndex}
        onClose={() => setCardIndex(null)}
      />
    )}
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
            <h3 className="font-display text-lg font-bold">Share your season</h3>
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
            alt="Your 82-0+ result card"
            className="mt-3 w-full border-2 border-[var(--md-ink)]"
          />
          <p className="mt-2 text-center text-[13px] leading-snug text-[var(--md-ink-muted)]">
            <strong>Right-click to copy and share.</strong>{" "}
            {autoCopied
              ? "The link is already on your clipboard."
              : "Use “Copy link” below to copy the link."}
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <a
              className="md-btn md-btn--sm md-btn--secondary"
              href={shareUrl}
              download="82-0-season.png"
            >
              Download
            </a>
            <button
              className="md-btn md-btn--sm md-btn--secondary"
              onClick={async () => {
                const ok = await copyText(shareLink);
                if (ok) {
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 1500);
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
    <div className="md-card md-card--lift flex flex-col gap-4 p-4 sm:p-5">
      <div className="text-center">
        {perfect ? (
          <div className="md-capsule md-capsule--teal mb-2">
            🏆 Perfect Season
          </div>
        ) : (
          <div className="md-capsule mb-2">Final Record</div>
        )}
        <div
          className="font-display font-bold"
          style={{ fontSize: "clamp(46px, 13vw, 64px)", lineHeight: 1 }}
        >
          {wins}&ndash;{losses}
        </div>
        <div className="mt-1 font-display text-sm text-[var(--md-ink-muted)]">
          {pf} scored · {pa} allowed ·{" "}
          <span
            style={{
              color: netRating >= 0 ? "var(--md-teal)" : "var(--md-coral)",
            }}
          >
            {netRating >= 0 ? "+" : ""}
            {netRating.toFixed(1)} net
          </span>
        </div>
        <div className="mt-1 font-display text-xs text-[var(--md-ink-muted)]">
          82-0 needs ≈ +15.2 net
        </div>
      </div>

      <div className="grid gap-1">
        <div className="flex items-baseline justify-between font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
          <span>Score breakdown</span>
          <span>net rating</span>
        </div>
        {/* Talent is the base. Construction (usage, spacing, ball movement,
            balance, size, synergy) is collapsed into one "Team fit" line; the
            All-Defense margin shows separately. Lines appear only when nonzero. */}
        <Adj label="Talent" value={result.baseNet} />
        {(
          [
            ["Team fit", result.teamFit],
            ["Defense", result.defBuff],
          ] as const
        )
          .filter(([, v]) => Math.round(v * 10) / 10 !== 0)
          .map(([label, v]) => (
            <Adj key={label} label={label} value={v} />
          ))}
        <div className="mt-0.5 flex items-baseline justify-between border-t-2 border-[var(--md-ink)] pt-1 font-display text-sm font-bold">
          <span>Net rating</span>
          <span style={{ color: netRating >= 0 ? "var(--md-teal)" : "var(--md-coral)" }}>
            {netRating >= 0 ? "+" : "−"}
            {Math.abs(netRating).toFixed(1)}
          </span>
        </div>
      </div>

      <div className="grid gap-1">
        <div className="flex items-baseline justify-between font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
          <span>Your roster{cardsOn ? " · tap for card" : ""}</span>
          <span className="text-[10px]">
            PTS/REB/AST · <span className="text-[var(--md-teal)]">[GQ]</span>
          </span>
        </div>
        {roster.map((r, i) => {
          const body = (
            <>
              <span>
                <span className="text-[var(--md-orange-deep)]">{r.team}</span> &rsquo;
                {String(r.best_season).slice(2)} · {r.player_name}
                {mode === "classic" &&
                  (r.allDef === 1 ? " 🥇" : r.allDef === 2 ? " 🥈" : "")}
              </span>
              <span className="text-[var(--md-ink-muted)]">
                {r.pts}/{r.reb}/{r.ast}{" "}
                <span className="text-[var(--md-teal)]">[{r.gq}]</span>
              </span>
            </>
          );
          const cls =
            "flex w-full items-baseline justify-between gap-2 border-b border-[var(--md-paper-3)] py-0.5 text-left font-display text-sm";
          return cardsOn ? (
            <button
              key={r.entity_id}
              type="button"
              onClick={() => setCardIndex(i)}
              className={`${cls} transition-colors hover:bg-[var(--md-yellow)]`}
            >
              {body}
            </button>
          ) : (
            <div key={r.entity_id} className={cls}>
              {body}
            </div>
          );
        })}
      </div>

      <div className="grid gap-1.5">
        <div className="text-center font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
          Team box · per game
        </div>
        {(
          [
            [
              ["PTS", result.teamBox.pts],
              ["REB", result.teamBox.reb],
              ["AST", result.teamBox.ast],
              ["STL", result.teamBox.stl],
              ["BLK", result.teamBox.blk],
            ],
            [
              ["FG%", `${result.teamBox.fgPct}%`],
              ["FT%", `${result.teamBox.ftPct}%`],
              ["TO", result.teamBox.tov],
            ],
          ] as const
        ).map((row, i) => (
          <div key={i} className="flex justify-center gap-4 font-display text-sm">
            {row.map(([label, value]) => (
              <span key={label} className="flex flex-col items-center">
                <span className="text-base font-bold leading-none">{value}</span>
                <span className="text-[10px] uppercase tracking-wide text-[var(--md-ink-muted)]">
                  {label}
                </span>
              </span>
            ))}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <button
            className="md-btn md-btn--lg md-btn--teal flex-1"
            onClick={share}
            disabled={!shareBlob || !shareReady}
          >
            {shareBlob && shareReady ? "Share result" : "Preparing…"}
          </button>
          <button className="md-btn md-btn--lg md-btn--ink flex-1" onClick={onReset}>
            {resetLabel ?? "Play again"}
          </button>
        </div>
        {onEnterTournament &&
          (!entryRequiresEligible || wins >= MIN_ELIGIBLE_WINS ? (
            <button
              className="md-btn md-btn--lg flex w-full items-center justify-center gap-2"
              style={{ background: "var(--md-orange)" }}
              onClick={onEnterTournament}
            >
              {/* Tier badge only on the gated free-play entry (Daily + private are
                  tier-less / "Open"). */}
              {entryRequiresEligible && !isDaily ? <TierBadge wins={wins} /> : null}
              {entryCtaLabel ??
                `Enter this team in the ${isDaily ? "Daily Tournament" : "Tournament"}`}
            </button>
          ) : (
            <button
              className="md-btn md-btn--lg w-full"
              disabled
              style={{ opacity: 0.5, cursor: "not-allowed" }}
              title="A team needs 40+ projected wins to enter the tournament."
            >
              Needs 40+ wins for tournament
            </button>
          ))}
      </div>
    </div>
    </>
  );
}
