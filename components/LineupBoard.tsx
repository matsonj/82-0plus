"use client";

import type { PlayerOption } from "@/lib/types";
import {
  eligiblePositions,
  SLOT_LABEL,
  type Role,
  type SlotKind,
} from "@/lib/positions";

export interface LineupEntry {
  player: PlayerOption;
  team: string;
  decade: number;
}

const ROLE_BG: Record<Role, string> = {
  G: "var(--md-sky)",
  W: "var(--md-teal-bright)",
  B: "var(--md-orange)",
};

export function LineupBoard({
  kinds,
  entries,
  targets,
  selected,
  onSlotClick,
  onRemove,
}: {
  kinds: SlotKind[];
  entries: (LineupEntry | null)[];
  targets: number[];
  selected: number | null;
  onSlotClick: (i: number) => void;
  onRemove: (i: number) => void;
}) {
  return (
    <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
      {kinds.map((kind, i) => {
        const entry = entries[i];
        const isTarget = targets.includes(i);
        const isSelected = selected === i;
        const clickable = isTarget || (entry && selected === null) || isSelected;
        return (
          <div key={i} className="relative">
            <button
              onClick={() => onSlotClick(i)}
              disabled={!clickable}
              className="md-card flex min-h-[96px] w-full flex-col p-1.5 text-left transition-transform sm:min-h-[112px] sm:p-2"
              style={{
                borderStyle: entry ? "solid" : "dashed",
                borderColor: isTarget
                  ? "var(--md-teal-deep, #068475)"
                  : "var(--md-ink)",
                borderWidth: isTarget || isSelected ? "3px" : "2px",
                background: isSelected
                  ? "var(--md-yellow)"
                  : isTarget
                    ? "var(--md-teal-bright)"
                    : entry
                      ? "var(--md-white)"
                      : "var(--md-paper-2)",
                boxShadow:
                  isSelected || isTarget ? "var(--md-shadow-sm)" : "none",
                cursor: clickable ? "pointer" : "default",
              }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="border border-[var(--md-ink)] px-1 font-display text-[10px] font-bold"
                  style={{
                    background:
                      kind === "FLEX" ? "var(--md-paper-3)" : "var(--md-yellow)",
                  }}
                >
                  {kind === "FLEX" ? "FLEX" : kind}
                </span>
              </div>

              {entry ? (
                <div className="mt-1 flex flex-1 flex-col justify-between gap-1">
                  <div className="flex gap-0.5">
                    {eligiblePositions(entry.player).map((r) => (
                      <span
                        key={r}
                        className="border border-[var(--md-ink)] px-1 font-display text-[9px] font-bold"
                        style={{ background: ROLE_BG[r] }}
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                  <div className="font-display text-[10px] font-bold leading-tight break-words sm:text-[13px]">
                    {entry.player.player_name}
                  </div>
                  <div className="font-display text-[9px] text-[var(--md-orange-deep)] sm:text-[10px]">
                    {entry.team} &rsquo;
                    {String(entry.player.best_season).slice(2)}
                  </div>
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center font-display text-xs uppercase tracking-wide text-[var(--md-ink-muted)]">
                  {SLOT_LABEL[kind]}
                </div>
              )}
            </button>

            {entry && (
              <button
                type="button"
                aria-label="Remove player"
                title="Remove"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(i);
                }}
                className="absolute right-1 top-1 z-10 font-display text-xs text-[var(--md-ink-muted)] hover:text-[var(--md-coral)]"
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
