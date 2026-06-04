"use client";

import { useState } from "react";
import type { SimRosterLine, SimResult } from "@/lib/types";
import { buildShareImage } from "@/lib/shareImage";

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
  modeLabel,
  onReset,
}: {
  roster: SimRosterLine[];
  result: SimResult;
  shareText: string;
  modeLabel: string;
  onReset: () => void;
}) {
  const { wins, losses, pf, pa, perfect, netRating } = result;
  const [status, setStatus] = useState<"idle" | "working">("idle");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const share = async () => {
    setStatus("working");
    try {
      const blob = await buildShareImage(result, roster, modeLabel);
      const file = blob
        ? new File([blob], "82-0-season.png", { type: "image/png" })
        : null;

      // Mobile: share the image card + the link text via the native sheet.
      const nav = navigator as Navigator & {
        canShare?: (d: ShareData) => boolean;
      };
      if (file && nav.canShare?.({ files: [file] }) && nav.share) {
        await nav.share({ files: [file], text: shareText, title: "82-0+" });
        setStatus("idle");
        return;
      }

      // Desktop: pop up the image so the user can right-click to copy/save it.
      // (Copy the link to the clipboard quietly too.)
      try {
        await navigator.clipboard.writeText(shareText);
      } catch {
        /* clipboard blocked */
      }
      if (blob) {
        setShareUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
      }
      setStatus("idle");
    } catch {
      setStatus("idle"); // user dismissed the share sheet
    }
  };

  const closeShare = () => {
    if (shareUrl) URL.revokeObjectURL(shareUrl);
    setShareUrl(null);
    setLinkCopied(false);
  };

  return (
    <>
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
          <p className="mt-2 text-[13px] leading-snug text-[var(--md-ink-muted)]">
            Right-click the image to <strong>copy</strong> or save it, then paste
            it anywhere. The link is already on your clipboard.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
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
                try {
                  await navigator.clipboard.writeText(shareText);
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
        <Adj label="Talent" detail={`avg GQ ${result.meanGQ.toFixed(3)}`} value={result.baseNet} />
        <Adj
          label="Usage fit"
          detail={`${Math.round(result.usageFactor * 100)}% — shot overlap`}
          value={-result.usagePen}
        />
        <Adj
          label="Outside shooting"
          detail={
            result.nonShooters > 1
              ? `${result.nonShooters} non-shooters`
              : `${result.nonShooters} non-shooter`
          }
          value={-result.outsidePen}
        />
        <Adj
          label="Ball movement"
          detail={`${Math.round(result.assistedPct * 100)}% assisted`}
          value={-result.ballhogPen}
        />
        <Adj
          label="Lineup balance"
          detail={`${result.roleCounts.G}G · ${result.roleCounts.W}W · ${result.roleCounts.B}B${
            result.roleCounts.G === 0 ? " — no guard" : ""
          }`}
          value={-result.balancePen}
        />
        <Adj
          label="Size"
          detail={`${Math.floor(result.avgHeight / 12)}'${result.avgHeight % 12}" avg`}
          value={-result.sizePen}
        />
        <Adj
          label="Defense"
          detail={
            result.allDefCount > 0
              ? `${result.allDefCount} All-Defensive`
              : "no All-Defensive"
          }
          value={result.defBuff}
        />
        <Adj label="Construction synergy" value={result.synergyBonus} />
        <div className="mt-0.5 flex items-baseline justify-between border-t-2 border-[var(--md-ink)] pt-1 font-display text-sm font-bold">
          <span>Net rating</span>
          <span style={{ color: netRating >= 0 ? "var(--md-teal)" : "var(--md-coral)" }}>
            {netRating >= 0 ? "+" : "−"}
            {Math.abs(netRating).toFixed(1)}
          </span>
        </div>
      </div>

      <div className="grid gap-1">
        <div className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
          Your roster
        </div>
        {roster.map((r) => (
          <div
            key={r.entity_id}
            className="flex items-baseline justify-between gap-2 border-b border-[var(--md-paper-3)] py-0.5 font-display text-sm"
          >
            <span>
              <span className="text-[var(--md-orange-deep)]">{r.team}</span> &rsquo;
              {String(r.best_season).slice(2)} · {r.player_name}
            </span>
            <span className="text-[var(--md-ink-muted)]">
              {r.pts}/{r.reb}/{r.ast}{" "}
              <span className="text-[var(--md-teal)]">[{r.gq}]</span>
            </span>
          </div>
        ))}
        <div className="mt-0.5 text-[10px] leading-snug text-[var(--md-ink-muted)]">
          PTS/REB/AST · <span className="text-[var(--md-teal)]">[Game Quality 0–100]</span>
        </div>
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

      <div className="flex flex-wrap justify-center gap-2">
        <button
          className="md-btn md-btn--lg md-btn--teal"
          onClick={share}
          disabled={status === "working"}
        >
          {status === "working" ? "Building…" : "Share result"}
        </button>
        <button className="md-btn md-btn--lg md-btn--ink" onClick={onReset}>
          Play again
        </button>
      </div>
    </div>
    </>
  );
}
