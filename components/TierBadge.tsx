import { tierForSeedNet } from "@/lib/tier";

// A small tier chip (S / AA / A / B / C / D), colored per lib/tier. Derived from
// the team's seedNet so there's a single source of truth. Renders nothing for an
// ineligible team (under 40 wins) — those are gated at submit and shouldn't reach
// a bracket, but degrade gracefully if an old row sneaks through.
export function TierBadge({
  seedNet,
  className = "",
}: {
  seedNet: number;
  className?: string;
}) {
  const tier = tierForSeedNet(seedNet);
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
