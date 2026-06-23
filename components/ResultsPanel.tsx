"use client";

import { useEffect, useMemo, useState } from "react";
import type { SimRosterLine, SimResult, GameMode } from "@/lib/types";
import { buildShareImage } from "@/lib/shareImage";
import { type CardPlayer, usePlayerCardDeck } from "@/components/PlayerCard";
import { presentShare } from "@/lib/shareActions";
import { MIN_ELIGIBLE_WINS } from "@/lib/tier";
import { Button } from "@/components/ui";
import { ShareAssetDialog } from "@/components/ui/ShareAssetDialog";

// ---- Fit narrative -------------------------------------------------------
// One-sentence summary of the team fit adjustment. The mockup shows a single
// human-readable line: "Balanced roster — no usage clashes." Derived from the
// simulation result fields. Never shows the raw factor numbers.
function fitNarrative(r: SimResult): string {
  if (r.usageFactor < 0.85) return "Heavy usage overlap — ball-dominant lineup.";
  if (r.usageFactor < 0.94) return "Some usage overlap — crowded halfcourt.";
  if (r.nonShooters >= 3) return "Floor-spacing issue — three non-shooters.";
  if (r.nonShooters === 2) return "Two non-shooters — floor spacing is tight.";
  if (r.assistFactor < 0.80) return "Ball-hogging tendency — low assist rate.";
  if (r.synergyBonus > 0.5) return "Complementary stars — strong chemistry bonus.";
  if (r.balancePen < -1.0) return "Lopsided scoring load — imbalanced attack.";
  return "Balanced roster — no usage clashes.";
}

// ---- Cover-line kicker ("You built a contender") -------------------------
function resultKicker(wins: number, netRating: number, perfect: boolean): string {
  if (perfect) return "You went undefeated.";
  if (wins >= 73) return "All-time great.";
  if (wins >= 68) return "You built a contender.";
  if (wins >= 60) return "Championship caliber.";
  if (wins >= 55) return "A playoff powerhouse.";
  if (wins >= 50) return "Playoff-bound roster.";
  if (wins >= 40) return "Tournament-eligible.";
  if (netRating >= 0) return "A winning season.";
  return "Back to the draft board.";
}

// ---- THE FIVE: ink-spread lineup table -----------------------------------
// The right-column dark card on desktop; a standalone section on mobile.
// Ink background, flame border + hard offset shadow. Fixed-width stat lanes.
function TheFiveCard({
  roster,
  result,
  cardsOn,
  mode,
  onCardOpen,
}: {
  roster: SimRosterLine[];
  result: SimResult;
  cardsOn: boolean;
  mode: GameMode;
  onCardOpen: (i: number) => void;
}) {
  // Fixed-width right-aligned stat cell: matches column lanes in the mockup.
  const statW = 44;

  return (
    <div
      className="w-full overflow-hidden"
      style={{
        background: "var(--md-ink)",
        border: "3px solid var(--md-coral)",
        boxShadow: "var(--md-shadow-pop)",
        color: "var(--md-white)",
      }}
    >
      {/* Card header */}
      <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
        <div>
          <h2
            className="font-cover leading-none uppercase"
            style={{ fontSize: "clamp(28px, 5vw, 40px)", letterSpacing: "-0.02em" }}
          >
            The Five
          </h2>
          <div
            className="mt-1 font-cond font-semibold uppercase tracking-[0.14em]"
            style={{ fontSize: 10, color: "var(--md-paper-3)" }}
          >
            Per-game averages · Simulated 82-game season
          </div>
        </div>
        <div
          className="font-cond font-semibold uppercase tracking-[0.14em] shrink-0 mt-1"
          style={{ fontSize: 10, color: "var(--md-ink-muted)" }}
        >
          Starting Lineup
        </div>
      </div>

      {/* Column header row — slate/navy band */}
      <div
        className="flex items-center gap-0 px-4 py-2"
        style={{ background: "rgba(40,55,80,0.85)" }}
      >
        {/* # */}
        <span
          className="font-cond font-bold uppercase tracking-[0.12em] text-[var(--md-white)] shrink-0"
          style={{ fontSize: 11, width: 34 }}
        >
          #
        </span>
        {/* PLAYER */}
        <span
          className="flex-1 font-cond font-bold uppercase tracking-[0.12em] text-[var(--md-white)]"
          style={{ fontSize: 11 }}
        >
          Player
        </span>
        {/* PTS / REB / AST */}
        {(["PTS", "REB", "AST"] as const).map((col) => (
          <span
            key={col}
            className="font-cond font-bold uppercase tracking-[0.12em] text-[var(--md-white)] shrink-0"
            style={{ fontSize: 11, width: statW, textAlign: "right" }}
          >
            {col}
          </span>
        ))}
      </div>

      {/* Player rows */}
      <div className="flex flex-col">
        {roster.map((r, i) => {
          // Mockup shows last name bold, first · team · year as subtitle.
          const nameParts = r.player_name.split(" ");
          const lastName = nameParts.at(-1) ?? r.player_name;
          const firstName = nameParts.slice(0, -1).join(" ");
          const yearStr = String(r.best_season).slice(2);
          const allDefSuffix =
            mode === "classic" && r.allDef === 1
              ? " 🥇"
              : mode === "classic" && r.allDef === 2
                ? " 🥈"
                : "";

          const rowContent = (
            <div
              className="flex items-center gap-0 px-4 py-3 border-b"
              style={{ borderColor: "rgba(255,255,255,0.07)" }}
            >
              {/* Press-yellow number badge */}
              <span
                className="inline-flex items-center justify-center font-mono font-bold shrink-0 mr-2"
                style={{
                  width: 22,
                  height: 22,
                  background: "var(--md-yellow)",
                  color: "var(--md-ink)",
                  border: "1px solid var(--md-ink)",
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                {i + 1}
              </span>
              {/* Name + subtitle */}
              <div className="flex-1 min-w-0">
                <div
                  className="font-archivo truncate leading-tight"
                  style={{ fontSize: 15, fontWeight: 700, color: "var(--md-white)" }}
                >
                  {lastName}{allDefSuffix}
                </div>
                <div
                  className="font-mono leading-none mt-0.5"
                  style={{ fontSize: 10, color: "var(--md-ink-muted)" }}
                >
                  {firstName} · {r.team} &rsquo;{yearStr}
                </div>
              </div>
              {/* Stats — fixed-width right-aligned */}
              {([r.pts, r.reb, r.ast] as number[]).map((v, si) => (
                <span
                  key={si}
                  className="font-mono font-bold tabular-nums shrink-0"
                  style={{ fontSize: 14, width: statW, textAlign: "right", color: "var(--md-white)" }}
                >
                  {v.toFixed(1)}
                </span>
              ))}
            </div>
          );

          return cardsOn ? (
            <button
              key={r.entity_id}
              type="button"
              className="block w-full text-left transition-colors hover:bg-[rgba(255,255,255,0.06)]"
              onClick={() => onCardOpen(i)}
            >
              {rowContent}
            </button>
          ) : (
            <div key={r.entity_id}>{rowContent}</div>
          );
        })}
      </div>

      {/* Team totals footer — press-yellow on dark */}
      <div
        className="flex items-center gap-0 px-4 py-3 border-t-2"
        style={{ borderColor: "var(--md-coral)", background: "rgba(0,0,0,0.25)" }}
      >
        <span className="shrink-0 mr-2" style={{ width: 22 }} />
        <span
          className="flex-1 font-cond font-bold uppercase tracking-[0.12em]"
          style={{ fontSize: 11, color: "var(--md-yellow)" }}
        >
          Team / Game
        </span>
        {([result.teamBox.pts, result.teamBox.reb, result.teamBox.ast] as number[]).map(
          (v, si) => (
            <span
              key={si}
              className="font-mono font-bold tabular-nums shrink-0"
              style={{ fontSize: 14, width: statW, textAlign: "right", color: "var(--md-yellow)" }}
            >
              {v.toFixed(1)}
            </span>
          ),
        )}
      </div>
    </div>
  );
}

// ---- Mobile ink money card (record + net) --------------------------------
// On mobile (871-0), the W-L record and net rating live inside a dark ink card
// matching the cover card style. On desktop this is replaced by the cream left
// column. Shown only below lg breakpoint.
function MobileMoneyCard({
  wins,
  losses,
  netRating,
  perfect,
  modeLabel,
}: {
  wins: number;
  losses: number;
  netRating: number;
  perfect: boolean;
  modeLabel: string;
}) {
  const netSign = netRating >= 0 ? "+" : "−";
  const netAbs = Math.abs(netRating).toFixed(1);
  const netColor = netRating >= 0 ? "var(--md-teal)" : "var(--md-coral)";

  return (
    <div
      className="lg:hidden overflow-hidden"
      style={{
        background: "var(--md-ink)",
        border: "3px solid var(--md-coral)",
        boxShadow: "var(--md-shadow-pop)",
        color: "var(--md-white)",
      }}
    >
      <div className="px-5 pt-5 pb-2 border-b" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <span
            className="font-cond font-bold uppercase tracking-[0.14em]"
            style={{ fontSize: 11, color: "var(--md-paper-3)" }}
          >
            Final Record{" "}
            {perfect && (
              <span role="img" aria-label="trophy">
                🏆
              </span>
            )}
          </span>
          <span
            className="font-cond font-bold uppercase tracking-[0.1em] px-2 py-0.5"
            style={{
              fontSize: 11,
              background: "var(--md-coral)",
              color: "var(--md-white)",
              border: "2px solid var(--md-yellow)",
            }}
          >
            {modeLabel}
          </span>
        </div>
        {/* Giant score */}
        <div className="flex items-baseline gap-2 mb-1">
          <span
            className="font-mono font-bold tabular-nums"
            style={{ fontSize: "clamp(64px, 18vw, 96px)", lineHeight: 0.84, letterSpacing: "-0.02em", color: "var(--md-coral)" }}
          >
            {wins}
          </span>
          <span
            className="font-mono font-bold"
            style={{ fontSize: "clamp(36px, 8vw, 56px)", color: "var(--md-ink-muted)", letterSpacing: "-0.04em" }}
          >
            –
          </span>
          <span
            className="font-mono font-bold tabular-nums"
            style={{ fontSize: "clamp(48px, 14vw, 80px)", lineHeight: 0.84, letterSpacing: "-0.02em", color: "var(--md-white)" }}
          >
            {losses}
          </span>
        </div>
        <div
          className="font-cond font-semibold uppercase tracking-[0.18em]"
          style={{ fontSize: 10, color: "var(--md-ink-muted)" }}
        >
          Wins · Losses
        </div>
      </div>

      {/* Net rating row */}
      <div className="px-5 py-4 flex items-baseline justify-between gap-4">
        <div>
          <div
            className="font-cond font-semibold uppercase tracking-[0.14em] mb-1"
            style={{ fontSize: 10, color: "var(--md-ink-muted)" }}
          >
            Net Rating
          </div>
          <div
            className="font-mono text-[12px]"
            style={{ color: "var(--md-ink-muted)" }}
          >
            Avg. margin per 100
          </div>
        </div>
        <div
          className="font-mono font-bold tabular-nums"
          style={{ fontSize: "clamp(24px, 6vw, 32px)", color: netColor }}
        >
          {netSign}{netAbs}{" "}
          <span
            className="font-cond font-bold uppercase tracking-[0.1em]"
            style={{ fontSize: 13 }}
          >
            NET
          </span>
        </div>
      </div>
    </div>
  );
}

// ---- Main component -------------------------------------------------------
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
  entryOnly = false,
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
  // Override the entry-CTA label (default: "Enter Tournament"). Private
  // tournaments reuse this screen as the draft interstitial with a
  // "Add sixth man & captain" button.
  entryCtaLabel?: string;
  // Whether the entry CTA is gated by the 40-win floor. Default true (Classic/
  // Ranked free play). Private tournaments accept any roster, so pass false.
  entryRequiresEligible?: boolean;
  // Render ONLY the entry CTA — no Share / secondary button. The private draft
  // interstitial is a "continue" step, not a shareable final result.
  entryOnly?: boolean;
}) {
  const { wins, losses, netRating, perfect } = result;
  const [shareBlob, setShareBlob] = useState<Blob | null>(null);
  const [autoCopied, setAutoCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  // Career cards reveal stats — Classic only (not Daily).
  const cardsOn = mode === "classic" && !isDaily;

  const cardPlayers = useMemo<CardPlayer[]>(
    () =>
      roster.map((r) => ({
        entityId: r.entity_id,
        playerName: r.player_name,
        team: r.team,
        season: r.best_season,
        positions: r.positions,
        allDef: r.allDef ?? undefined,
      })),
    [roster],
  );
  const {
    carousel: playerCardCarousel,
    openCard,
  } = usePlayerCardDeck({
    players: cardPlayers,
    enabled: cardsOn,
    prefetchAll: true,
  });

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
      filename: "daily82-season.png",
      text: shareText,
      link: shareLink,
    });
    if (outcome === "copied" || outcome === "failed") {
      setAutoCopied(outcome === "copied");
      setShareUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(shareBlob!);
      });
    }
  };

  const closeShare = () => {
    if (shareUrl) URL.revokeObjectURL(shareUrl);
    setShareUrl(null);
  };

  // Formatted net rating.
  const netSign = netRating >= 0 ? "+" : "−";
  const netAbs = Math.abs(netRating).toFixed(1);
  const netColor = netRating >= 0 ? "var(--md-teal)" : "var(--md-coral)";

  // Team fit.
  const fit = result.teamFit;
  const fitSign = fit >= 0 ? "+" : "−";
  const fitAbs = Math.abs(Math.round(fit * 10) / 10).toFixed(1);
  const fitColor = fit >= 0 ? "var(--md-teal)" : "var(--md-coral)";
  const narrative = fitNarrative(result);

  // Marker kicker.
  const kicker = resultKicker(wins, netRating, perfect);

  const isEligible = !entryRequiresEligible || wins >= MIN_ELIGIBLE_WINS;

  return (
    <>
      {/* Career card carousel modal (Classic only) */}
      {playerCardCarousel}

      {/* Share overlay */}
      {shareUrl && (
        <ShareAssetDialog
          title="Share your season"
          imageUrl={shareUrl}
          imageAlt="Your daily82 result card"
          downloadName="daily82-season.png"
          shareLink={shareLink}
          autoCopied={autoCopied}
          onClose={closeShare}
        />
      )}

      <div className="flex flex-col gap-6">
        {/* Mobile header: Season Complete kicker + mode badge + marker kicker
            (desktop shows these inside the left grid column) */}
        <div className="lg:hidden flex flex-col gap-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="md-kicker--marker" style={{ fontSize: 20 }}>
              Season complete.
            </span>
            <span
              className="font-cond font-bold uppercase tracking-[0.1em] px-2 py-0.5"
              style={{
                fontSize: 11,
                background: "var(--md-coral)",
                color: "var(--md-white)",
                border: "2px solid var(--md-ink)",
              }}
            >
              {modeLabel}
            </span>
          </div>
          <div
            className="font-cond font-semibold uppercase tracking-[0.14em]"
            style={{ fontSize: 10, color: "var(--md-ink-muted)" }}
          >
            82 games simulated · final ledger
          </div>
        </div>

        {/*
          Mobile: ink money card wrapping record + net (hidden on desktop —
          the left column handles score on lg+).
        */}
        <MobileMoneyCard
          wins={wins}
          losses={losses}
          netRating={netRating}
          perfect={perfect}
          modeLabel={modeLabel}
        />

        {/*
          Main grid: stacked on mobile, two columns on desktop.
            Left (~45%): kicker + score hero + net + team fit + CTAs
            Right (~55%): ink "THE FIVE" lineup table
          On mobile the left column score/record section is hidden (the
          MobileMoneyCard above handles it); net rating + team fit + CTAs
          still show from the left column.
        */}
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">

          {/* ---- Left column ----
              On mobile this drops BELOW the lineup (order-2) so the stack reads
              money card → THE FIVE → team fit → CTAs (matches 871-0); on desktop
              it returns to the left (order-1). */}
          <div className="order-2 flex flex-col gap-0 lg:order-1 lg:min-w-0 lg:flex-1">

            {/* Kicker row: SEASON COMPLETE + mode badge — hidden on mobile
                (the mobile money card header already shows this) */}
            <div className="hidden lg:flex flex-wrap items-center gap-3 mb-2">
              <span className="md-kicker">Season Complete</span>
              <span
                className="font-cond font-bold uppercase tracking-[0.1em] px-2 py-0.5"
                style={{
                  fontSize: 11,
                  background: "var(--md-coral)",
                  color: "var(--md-white)",
                  border: "2px solid var(--md-ink)",
                }}
              >
                {modeLabel}
              </span>
            </div>

            {/* Marker kicker — flame italic handwritten style */}
            <div className="hidden lg:block md-kicker--marker mb-3" style={{ fontSize: 22 }}>
              {kicker}
            </div>

            {/* Giant W–L score — desktop only (mobile uses ink money card) */}
            <div className="hidden lg:flex items-baseline gap-3 mb-1">
              {/* Wins: flame-red .md-score */}
              <span
                className="md-score"
                style={{ fontSize: "clamp(72px, 11vw, 120px)" }}
              >
                {wins}
              </span>
              {/* Em-dash separator: muted */}
              <span
                className="font-mono font-bold"
                style={{
                  fontSize: "clamp(32px, 5vw, 52px)",
                  color: "var(--md-ink-muted)",
                  letterSpacing: "-0.04em",
                }}
              >
                —
              </span>
              {/* Losses: warm ink, slightly smaller */}
              <span
                className="font-mono font-bold tabular-nums"
                style={{
                  fontSize: "clamp(56px, 9vw, 96px)",
                  lineHeight: 0.84,
                  letterSpacing: "-0.02em",
                  color: "var(--md-ink)",
                }}
              >
                {losses}
              </span>
            </div>

            {/* Record label — desktop only */}
            <div className="hidden lg:block font-cond font-semibold uppercase tracking-[0.18em] text-[var(--md-ink-muted)] mb-3" style={{ fontSize: 11 }}>
              Regular Season Record
            </div>

            {/* Double rule — desktop only */}
            <div className="hidden lg:block md-rule-double mb-5" />

            {/* Net rating — large, teal/coral, both breakpoints */}
            <div className="hidden lg:flex items-baseline gap-2 mb-2">
              <span
                className="font-mono font-bold tabular-nums"
                style={{ fontSize: "clamp(28px, 4vw, 40px)", color: netColor, lineHeight: 1 }}
              >
                {netSign}{netAbs}
              </span>
              <span
                className="font-cond font-bold uppercase tracking-[0.14em]"
                style={{ fontSize: 14, color: "var(--md-ink-muted)" }}
              >
                Net Rating
              </span>
            </div>

            {/* Team fit — one line: label + signed value + narrative */}
            <div className="flex items-baseline flex-wrap gap-1 mb-6">
              <span
                className="font-cond font-bold uppercase tracking-[0.12em]"
                style={{ fontSize: 12, color: "var(--md-ink)" }}
              >
                Team Fit
              </span>
              <span
                className="font-mono font-bold tabular-nums"
                style={{ fontSize: 13, color: fitColor }}
              >
                {fitSign}{fitAbs}
              </span>
              <span
                className="font-mono"
                style={{ fontSize: 12, color: "var(--md-ink-muted)" }}
              >
                · {narrative}
              </span>
            </div>

            {/* ---- CTAs ----
                Two breakpoint-specific blocks because the mobile and desktop
                action rows intentionally use different hierarchy. */}
            {!entryOnly && (
              <>
                {/* Mobile (871-0): full-width flame share, tournament block, play again */}
                <div className="flex flex-col gap-3 mb-1 lg:hidden">
                  <button
                    type="button"
                    onClick={share}
                    disabled={!shareBlob || !shareReady}
                    className="md-btn md-btn--lg w-full transition-opacity disabled:opacity-40"
                    style={{ background: "var(--md-coral)", color: "var(--md-white)", borderColor: "var(--md-ink)" }}
                  >
                    <span style={{ fontSize: 14, marginRight: 6 }}>↑</span>
                    {shareBlob && shareReady ? "Share Result" : "Preparing…"}
                  </button>

                  {onEnterTournament && isEligible && (
                    <div className="border-2 border-[var(--md-ink)]" style={{ background: "var(--md-paper-2)" }}>
                      <button
                        className="flex w-full items-center justify-between px-5 py-4"
                        onClick={onEnterTournament}
                      >
                        <div className="text-left">
                          <div className="font-cond font-bold uppercase tracking-[0.1em]" style={{ fontSize: 14, color: "var(--md-ink)" }}>
                            {entryCtaLabel ?? "Enter Tournament"}
                          </div>
                          <div className="font-cond font-semibold uppercase tracking-[0.12em] mt-0.5" style={{ fontSize: 10, color: "var(--md-teal)" }}>
                            Eligible · {wins} wins ≥ 40
                          </div>
                        </div>
                        <span className="font-mono font-bold text-[var(--md-coral)] shrink-0" style={{ fontSize: 20 }}>
                          →
                        </span>
                      </button>
                    </div>
                  )}

                  {onEnterTournament && !isEligible && (
                    <div className="border-2 border-[var(--md-paper-3)] px-4 py-3" style={{ background: "var(--md-paper-2)" }}>
                      <div className="font-cond font-bold uppercase tracking-[0.1em]" style={{ fontSize: 12, color: "var(--md-ink-muted)" }}>
                        Enter Tournament
                      </div>
                      <div className="mt-0.5 font-mono" style={{ fontSize: 11, color: "var(--md-coral)" }}>
                        Needs {MIN_ELIGIBLE_WINS}+ wins to be eligible
                      </div>
                    </div>
                  )}

                  <button className="md-btn md-btn--lg md-btn--secondary w-full" onClick={onReset}>
                    <span style={{ marginRight: 6 }}>↺</span>
                    {resetLabel ?? "Play Again"}
                  </button>
                </div>

                {/* Desktop (872-0): ONE flame CTA + outline Play Again side-by-side,
                    Share Result as a text link below. */}
                <div className="hidden lg:flex lg:flex-col lg:gap-4 lg:pt-2">
                  {onEnterTournament && !isEligible && (
                    <div className="self-start border-2 border-[var(--md-paper-3)] px-4 py-3" style={{ background: "var(--md-paper-2)" }}>
                      <div className="font-cond font-bold uppercase tracking-[0.1em]" style={{ fontSize: 12, color: "var(--md-ink-muted)" }}>
                        Enter Tournament
                      </div>
                      <div className="mt-0.5 font-mono" style={{ fontSize: 11, color: "var(--md-coral)" }}>
                        Needs {MIN_ELIGIBLE_WINS}+ wins to be eligible
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-4">
                    {onEnterTournament && isEligible && (
                      <button
                        className="md-btn md-btn--lg"
                        style={{
                          background: "var(--md-coral)",
                          color: "var(--md-white)",
                          border: "3px solid var(--md-ink)",
                          boxShadow: "6px 6px 0 0 var(--md-ink)",
                        }}
                        onClick={onEnterTournament}
                      >
                        {entryCtaLabel ?? "Enter Tournament"}
                        <span>→</span>
                      </button>
                    )}
                    {/* Play Again — flat outline, no fill (matches 872-0) */}
                    <button
                      type="button"
                      onClick={onReset}
                      className="inline-flex items-center gap-2 border-2 border-[var(--md-ink)] px-7 py-[15px] font-cond font-semibold uppercase tracking-[0.12em] text-[var(--md-ink)] transition-transform hover:-translate-y-0.5"
                      style={{ fontSize: 15, cursor: "pointer" }}
                    >
                      <span>↺</span>
                      {resetLabel ?? "Play Again"}
                    </button>
                  </div>

                  {/* Share — text link with upload glyph */}
                  <button
                    type="button"
                    onClick={share}
                    disabled={!shareBlob || !shareReady}
                    className="inline-flex items-center gap-2 self-start font-cond font-semibold uppercase tracking-[0.12em] underline underline-offset-4 transition-opacity disabled:opacity-40"
                    style={{ fontSize: 15, color: "var(--md-ink)", cursor: "pointer" }}
                  >
                    <span style={{ fontSize: 15 }}>↑</span>
                    {shareBlob && shareReady ? "Share Result" : "Preparing…"}
                  </button>
                </div>
              </>
            )}

            {/* entryOnly: just the entry CTA */}
            {entryOnly && onEnterTournament && (
              <Button
                size="lg"
                fullWidth
                style={{
                  background: "var(--md-coral)",
                  color: "var(--md-white)",
                  borderColor: "var(--md-ink)",
                }}
                onClick={onEnterTournament}
              >
                {entryCtaLabel ?? "Enter Tournament"}
              </Button>
            )}
          </div>

          {/* ---- Right column: THE FIVE ink card (fixed lane on desktop) ----
              order-1 on mobile so the lineup sits right under the money card.
              Width tuned to ~48% of the max-w-5xl result column so it balances
              the left column and the subtitle fits on one line (matches 872-0). */}
          <div className="order-1 lg:order-2 lg:w-[480px] lg:shrink-0">
            <TheFiveCard
              roster={roster}
              result={result}
              cardsOn={cardsOn}
              mode={mode}
              onCardOpen={openCard}
            />
          </div>
        </div>

        {/*
          Mobile order is set by flex `order` on the two grid columns above:
          THE FIVE (order-1) sits directly under the money card, then the left
          column (order-2 = team fit + CTAs). Matches 871-0:
          money card → lineup → team fit → CTAs.
        */}
      </div>
    </>
  );
}
