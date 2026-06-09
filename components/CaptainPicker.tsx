"use client";

import type { SlotKind } from "@/lib/positions";

// The five-starter captain grid, shared by the main-game TournamentEntry and the
// private-tournament finalize (they rendered byte-identical copies). Tap a starter
// to make him captain; the chosen slot gets the yellow lift treatment.
//
// Takes the minimal shape both call sites already have on hand (a LineupEntry or a
// private Placed both expose `player.player_name`, `player.best_season`, `team`).

export interface CaptainPickerEntry {
  player: { player_name: string; best_season: number };
  team: string;
}

export function CaptainPicker({
  kinds,
  entries,
  value,
  onChange,
}: {
  kinds: SlotKind[];
  entries: (CaptainPickerEntry | null)[];
  value: number | null;
  onChange: (slot: number) => void;
}) {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {entries.map((e, i) => {
        const entry = e as CaptainPickerEntry;
        const isCap = value === i;
        return (
          <button
            key={i}
            onClick={() => onChange(i)}
            className="md-card flex min-h-[80px] flex-col p-1.5 text-left transition-transform"
            style={{
              background: isCap ? "var(--md-yellow)" : "var(--md-white)",
              borderWidth: isCap ? "3px" : "2px",
              boxShadow: isCap ? "var(--md-shadow-sm)" : "none",
              cursor: "pointer",
            }}
          >
            <span
              className="self-start border border-[var(--md-ink)] px-1 font-display text-[9px] font-bold"
              style={{ background: "var(--md-yellow)" }}
            >
              {kinds[i] === "FLEX" ? "FLEX" : kinds[i]}
            </span>
            <span className="mt-1 font-display text-[10px] font-bold leading-tight break-words">
              {entry.player.player_name}
            </span>
            <span className="mt-auto font-display text-[9px] text-[var(--md-orange-deep)]">
              {entry.team} &rsquo;{String(entry.player.best_season).slice(2)}
            </span>
            {isCap && (
              <span className="font-display text-[9px] font-bold">★ CAPTAIN</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
