import { tierForSeedNet, tierForWins } from "@/lib/tier";

// A small tier chip (S / AA / A / B / C / D), colored per lib/tier. Derived from
// either the finished regular-season win total or an unrounded tournament seedNet.
// Renders nothing for an ineligible team (under 40 wins).
//
// SLAM treatment: the "capsule" size renders as a rotated press stamp
// (.md-stamp) with tier-appropriate coloring; the "sm" size stays as a compact
// inline badge for tight spaces.
type TierBadgeProps = {
  className?: string;
  // "sm" (default): compact inline chip. "capsule": matches the .md-capsule
  // game-type pill exactly so the two sit level; also used in team-row stamp context.
  size?: "sm" | "capsule";
} & ({ wins: number; seedNet?: never } | { seedNet: number; wins?: never });

// Map tier label → SLAM-appropriate stamp style. S-tier = champion gold,
// AA/A = flame, B/C/D = ink. Press-yellow text is ink; all others cream.
function tierStampStyle(label: string): React.CSSProperties {
  if (label === "S") {
    return {
      background: "var(--md-yellow)",
      color: "var(--md-ink)",
      border: "2px solid var(--md-ink)",
      boxShadow: "3px 3px 0 var(--md-magenta), 5px 5px 0 var(--md-ink)",
    };
  }
  if (label === "AA" || label === "A") {
    return {
      background: "var(--md-coral)",
      color: "var(--md-white)",
      border: "2px solid var(--md-ink)",
      boxShadow: "3px 3px 0 var(--md-magenta), 5px 5px 0 var(--md-ink)",
    };
  }
  // B / C / D
  return {
    background: "var(--md-ink)",
    color: "var(--md-white)",
    border: "2px solid var(--md-ink)",
    boxShadow: "3px 3px 0 var(--md-magenta), 5px 5px 0 var(--md-ink)",
  };
}

export function TierBadge(props: TierBadgeProps) {
  const { className = "", size = "sm" } = props;
  const tier =
    props.wins !== undefined
      ? tierForWins(props.wins)
      : tierForSeedNet(props.seedNet);
  if (!tier) return null;

  if (size === "capsule") {
    // Stamp treatment: slight rotation, misregistration double-shadow.
    return (
      <span
        className={`md-stamp inline-flex items-center justify-center px-2 py-0.5 font-cond text-[11px] font-bold uppercase tracking-[0.04em] ${className}`}
        style={{
          ...tierStampStyle(tier.label),
          transform: "rotate(2deg)",
          minWidth: 52,
        }}
        title={`${tier.label}-tier`}
      >
        TIER {tier.label}
      </span>
    );
  }

  // "sm" — compact inline chip, no rotation (used in tight contexts).
  return (
    <span
      className={`md-badge inline-flex items-center justify-center px-1.5 font-cond text-[11px] font-bold uppercase leading-none ${className}`}
      style={{ background: tier.color, minWidth: 22, height: 18 }}
      title={`${tier.label}-tier`}
    >
      {tier.label}
    </span>
  );
}
