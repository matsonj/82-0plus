"use client";

import { useState } from "react";
import type { SimRosterLine, SimResult } from "@/lib/types";
import { buildShareImage } from "@/lib/shareImage";

function Bar({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  const pct = Math.round(value * 100);
  const color =
    value >= 0.95
      ? "var(--md-teal-bright)"
      : value >= 0.8
        ? "var(--md-yellow)"
        : "var(--md-coral)";
  return (
    <div>
      <div className="flex items-baseline justify-between font-display text-xs font-bold uppercase tracking-wide">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="mt-0.5 h-2.5 border-2 border-[var(--md-ink)] bg-[var(--md-paper-2)]">
        <div className="h-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="mt-0.5 text-[10px] leading-snug text-[var(--md-ink-muted)]">
        {hint}
      </div>
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

      <div className="grid gap-2.5">
        <Bar
          label="Usage fit"
          value={result.usageFactor}
          hint="How well your scorers share one ball. Stacking ball-dominant stars throttles this."
        />
        <Bar
          label="Shot efficiency"
          value={result.efficiencyFactor}
          hint={`Era-relative true shooting. Team TS+ ${result.teamTsPlus.toFixed(
            2,
          )} (1.00 = league average for its era). Efficient stars beat volume scorers.`}
        />
        <div>
          <div className="flex items-baseline justify-between font-display text-xs font-bold uppercase tracking-wide">
            <span>Lineup</span>
            <span>
              {result.roleCounts.G}G · {result.roleCounts.W}W ·{" "}
              {result.roleCounts.B}B
            </span>
          </div>
          <div className="mt-1 text-[11px] leading-snug text-[var(--md-ink-muted)]">
            {result.balancePen > 0 ? (
              <span style={{ color: "var(--md-coral)" }}>
                −{result.balancePen} net — lopsided lineup
                {result.roleCounts.G === 0 ? " (no true guard)" : ""}
                {result.roleCounts.B === 0 ? " (no true big)" : ""}. A combo player
                can fill the slot, but you still need real backcourt and frontcourt.
              </span>
            ) : result.synergyBonus > 0 ? (
              <span style={{ color: "var(--md-teal)" }}>
                +{result.synergyBonus} net — flawless construction bonus. Clean,
                balanced fit amplifies your talent.
              </span>
            ) : (
              "Balance the lineup and push every fit bar to 100% to unlock the construction bonus that reaches 82-0."
            )}
          </div>
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

      <div className="grid gap-1">
        <div className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
          Team box · per game
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 font-display text-sm">
          {(
            [
              ["PTS", result.teamBox.pts],
              ["REB", result.teamBox.reb],
              ["AST", result.teamBox.ast],
              ["STL", result.teamBox.stl],
              ["BLK", result.teamBox.blk],
              ["3PM", result.teamBox.fg3m],
              ["TOV", result.teamBox.tov],
            ] as const
          ).map(([label, value]) => (
            <span key={label}>
              <span className="text-[var(--md-ink-muted)]">{label}</span> {value}
            </span>
          ))}
          <span>
            <span className="text-[var(--md-ink-muted)]">TS+</span>{" "}
            {result.teamTsPlus.toFixed(2)}
          </span>
        </div>
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
