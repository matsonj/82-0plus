"use client";

import type { CSSProperties, ReactNode } from "react";
import { Card } from "@/components/ui/Card";

// ── Shared "your five" roster card shell ──────────────────────────────────────
// ONE dark card used by both the draft board ("YOUR ROSTER", artboard 87X-0) and
// the result spread ("THE FIVE", artboard 894-0). The chrome is identical across
// both: near-black warm ink ground with a subtle radial darkening, a flame-red 3px
// frame + flame-red 6px hard offset shadow, an Anton title + muted Oswald label in
// the header, and a near-black (--md-ink-3) column-header band.
//
// Only the BODY differs:
//   • draft variant  → the LineupBoard list rows (slot chips + SET/ASSIGN/N/A)
//   • result variant → THE FIVE stat rows (gold seed chips + PTS/REB/AST + totals)
//
// So this component owns the shell + header + column band; each caller passes its
// own rows as `children`. Behaviour (slot-fill, career-card clicks, etc.) stays in
// the callers — this is pure chrome.

// The near-black header band. The mocks (87X-0 / 894-0) use a bar that is *darker*
// than the card ground; --md-ink-2 (#221c17) is a LIFTED surface (wrong direction),
// so we use --md-ink-3, the deepest band token (sits below --md-ink).
const BAND_BG = "var(--md-ink-3)";
// Row hairline between players — the shared hairline/divider token for ink grounds.
const ROW_HAIRLINE = "var(--md-ink-line)";

// The card ground darkening. The base cover chrome (ink bg, 3px flame border,
// flame-pop shadow, cream text) comes from <Card cover>; here we only override the
// backdrop — the cover halftone is swapped for the artboards' radial darkening
// (--md-ink-2 focal → --md-ink-3 corners). `backgroundSize: auto` defeats cover's
// 8px halftone tiling so the gradient renders as one smooth wash. Both cards share
// it; THE FIVE just nudges the focal point.
function groundStyle(focal: "center" | "top-left"): CSSProperties {
  const at = focal === "center" ? "50% 50%" : "30% 18%";
  return {
    backgroundImage: `radial-gradient(circle farthest-corner at ${at}, var(--md-ink-2) 0%, var(--md-ink-3) 100%)`,
    backgroundSize: "auto",
  };
}

export function RosterCard({
  title,
  rightLabel,
  subtitle,
  columnHeader,
  children,
  footer,
  groundFocal = "center",
  className = "",
  style,
}: {
  // The big Anton title — "Your Roster" / "The Five".
  title: ReactNode;
  // Muted Oswald label on the right of the header — "3 OF 5 SET" / "STARTING LINEUP".
  rightLabel?: ReactNode;
  // Optional Special-Elite subline under the title (THE FIVE's "per-game averages…").
  subtitle?: ReactNode;
  // The near-black SLOT/PLAYER/STATUS or #/PLAYER/PTS·REB·AST band. Rendered on the
  // BAND_BG bar; pass the inner cells.
  columnHeader?: ReactNode;
  // The body rows.
  children: ReactNode;
  // Optional footer pinned inside the card (THE FIVE's TEAM / GAME totals row).
  footer?: ReactNode;
  // Where the radial darkening focuses — center for the draft card, top-left for
  // THE FIVE (matches the artboards).
  groundFocal?: "center" | "top-left";
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <Card
      cover
      className={`w-full overflow-hidden ${className}`}
      style={{ ...groundStyle(groundFocal), ...style }}
    >
      {/* Header: Anton title + muted right label */}
      <div className="flex items-baseline justify-between gap-4 px-5 pt-5 sm:px-6 sm:pt-6">
        <h2
          className="font-cover leading-none uppercase"
          style={{
            fontSize: "clamp(28px, 5vw, 40px)",
            letterSpacing: "0.01em",
            color: "var(--md-white)",
          }}
        >
          {title}
        </h2>
        {rightLabel != null && (
          <span
            className="font-cond font-semibold uppercase tracking-[0.18em] shrink-0"
            style={{ fontSize: 13, color: "var(--md-cream-muted)" }}
          >
            {rightLabel}
          </span>
        )}
      </div>

      {/* Optional subtitle line */}
      {subtitle != null && (
        <div className="px-5 pt-2 sm:px-6">
          <div
            className="font-byline"
            style={{ fontSize: 12, letterSpacing: "0.04em", color: "var(--md-paper-3)" }}
          >
            {subtitle}
          </div>
        </div>
      )}

      {/* Body — column band + rows live in a padded well. `relative` so callers
          can drop in a full-height column divider (e.g. THE FIVE's GQ rule). */}
      <div className="relative px-5 pb-5 pt-5 sm:px-6 sm:pb-6">
        {columnHeader != null && (
          <div
            className="flex items-center px-4 py-[11px]"
            style={{ background: BAND_BG }}
          >
            {columnHeader}
          </div>
        )}
        {children}
        {footer}
      </div>
    </Card>
  );
}

// Shared constants so the two variants stay visually locked together.
export const ROSTER_CARD_BAND_BG = BAND_BG;
export const ROSTER_CARD_ROW_HAIRLINE = ROW_HAIRLINE;
