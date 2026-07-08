import type { CSSProperties, ReactNode } from "react";

/**
 * The shared "press stamp" chrome (issue #115) — border + background/color
 * field, and one of two shadow treatments:
 *
 *  - "double" (default): the misregistration double-shadow (.md-stamp) used
 *    by the TIER capsule and the My-Teams outcome/rank stamps, normally
 *    combined with a slight tilt.
 *  - "sm": a single drop shadow (var(--md-shadow-sm)), no tilt — the
 *    TeamGradeBadge inline stamp treatment.
 *
 * Deliberately does NOT own typography (font/size/tracking/padding/gap) —
 * each caller keeps its own via `className` so this is a chrome unification,
 * not a typographic one (mirrors PositionChip's convention).
 */
export function Stamp({
  background,
  color,
  shadow = "double",
  tilt,
  minWidth,
  title,
  className = "",
  style,
  children,
}: {
  background: string;
  color: string;
  shadow?: "double" | "sm";
  tilt?: boolean;
  minWidth?: number;
  title?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const chrome = shadow === "double" ? "md-stamp" : "border-2 border-[var(--md-ink)] md-stamp--sm";
  // "sm" defaults to upright (no tilt) per the docstring above; callers may
  // still opt a "sm" stamp into a tilt (or opt a "double" one out) explicitly.
  const effectiveTilt = tilt ?? shadow !== "sm";
  return (
    <span
      className={`${chrome} inline-flex items-center justify-center ${className}`}
      style={{
        background,
        color,
        ...(effectiveTilt ? { transform: "rotate(2deg)" } : {}),
        ...(minWidth !== undefined ? { minWidth } : {}),
        ...style,
      }}
      title={title}
    >
      {children}
    </span>
  );
}
