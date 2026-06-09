import { tierForSeedNet, tierForWins } from "@/lib/tier";

// A small tier chip (S / AA / A / B / C / D), colored per lib/tier. Derived from
// either the finished regular-season win total or an unrounded tournament seedNet.
// Renders nothing for an ineligible team (under 40 wins).
type TierBadgeProps = {
  className?: string;
} & ({ wins: number; seedNet?: never } | { seedNet: number; wins?: never });

export function TierBadge(props: TierBadgeProps) {
  const { className = "" } = props;
  const tier =
    props.wins !== undefined
      ? tierForWins(props.wins)
      : tierForSeedNet(props.seedNet);
  if (!tier) return null;
  return (
    <span
      className={`md-badge px-1.5 text-[11px] leading-none ${className}`}
      style={{ background: tier.color, minWidth: 22, height: 18 }}
      title={`${tier.label}-tier`}
    >
      {tier.label}
    </span>
  );
}
