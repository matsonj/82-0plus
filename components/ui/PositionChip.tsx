import type { Role } from "@/lib/positions";
import { ROLE_COLOR } from "@/lib/positions";

/**
 * The single position-chip renderer for the whole app. Two structural
 * variants, both sourced from the same lib/positions ROLE_COLOR map so the
 * three surfaces that show a role letter (browse list, player-card modal,
 * lineup board) can never disagree on its color again (issue #105):
 *
 *  - "filled" (default): loud, cream-on-ink-bordered role color — the browse
 *    list and player-card modal treatment.
 *  - "outline": quiet ink-on-stock chip with a role-colored border/text
 *    instead of a full-bleed fill — the lineup board's "loud chrome, quiet
 *    data" treatment. Structurally different (bordered, not filled) but
 *    still drawn from ROLE_COLOR so it can't fall out of sync.
 */
export function PositionChip({
  role,
  variant = "filled",
  className = "",
}: {
  role: Role;
  variant?: "filled" | "outline";
  className?: string;
}) {
  const color = ROLE_COLOR[role];
  if (variant === "outline") {
    return (
      <span
        className={`border px-1 font-mono text-[9px] font-bold leading-[1.5] ${className}`}
        style={{ borderColor: color, background: "var(--md-white)", color }}
      >
        {role}
      </span>
    );
  }
  return (
    <span
      className={`border border-[var(--md-ink)] px-1 font-display text-[10px] font-bold text-[var(--md-paper)] ${className}`}
      style={{ background: color }}
    >
      {role}
    </span>
  );
}

/** A row of PositionChips for a player's full eligibility list. */
export function PositionChipGroup({
  positions,
  variant = "filled",
  className = "",
}: {
  positions?: Role[];
  variant?: "filled" | "outline";
  className?: string;
}) {
  if (!positions || positions.length === 0) return null;
  return (
    <span className={`flex shrink-0 gap-0.5 ${className}`}>
      {positions.map((r) => (
        <PositionChip key={r} role={r} variant={variant} />
      ))}
    </span>
  );
}
