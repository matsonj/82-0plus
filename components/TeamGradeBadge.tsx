import type { TierInfo } from "@/lib/tier";

// A letter-grade badge for a team's QUALITY tier (S/AA/A/B/C/D), driven by
// projected wins (see lib/tier.ts). This is NOT the My-Teams placement badge —
// it's the quality letter only, labeled "TEAM GRADE" so it never reads as a
// matchmaking tier (daily is Open/tier-less).
//
// Visual: a solid spot-color chip — the tier's brand color — with an Oswald
// caps "TEAM GRADE" label and the Space Mono letter. The grade letter itself
// thus carries the tier's brand color as its field (B = flame-red, S = press-
// yellow, etc.). Models the GDU-0 "TEAM GRADE B" badge.

// Tiers whose brand color is light enough to need ink (not white) foreground.
// --md-yellow (S) is the only light tier field; everything else is dark enough
// for white to clear contrast.
function foregroundFor(tier: TierInfo): string {
  return tier.key === "S" ? "var(--md-ink)" : "var(--md-white)";
}

export function TeamGradeBadge({ tier }: { tier: TierInfo }) {
  const fg = foregroundFor(tier);
  return (
    <div
      className="inline-flex items-center gap-2 px-3 py-2"
      style={{ background: tier.color, color: fg }}
    >
      <span className="font-cond font-bold uppercase tracking-[0.12em] text-[12px] leading-none">
        Team Grade
      </span>
      <span className="font-mono font-bold text-[20px] leading-none tabular-nums">
        {tier.label}
      </span>
    </div>
  );
}
