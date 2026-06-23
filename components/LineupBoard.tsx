"use client";

import type React from "react";
import type { PublicPlayer } from "@/lib/types";
import { SLOT_LABEL, type Role, type SlotKind } from "@/lib/positions";
import { canFill } from "@/lib/positions";
import { splitPlayerName } from "@/lib/playerName";

export interface LineupEntry {
  player: PublicPlayer;
  team: string;
  decade: number;
  // Signed roll receipt for (team, decade) from /api/slot or the decade-skip.
  // "" when the slot wasn't server-rolled (Daily's seeded slots) — Daily can't
  // enter the tournament, so it never needs provenance.
  receipt: string;
}

// Position chips are QUIET info (ink outline on stock) — "loud chrome, quiet
// data". Position is shown on each player, never used as a loud accent.
function PosChips({ positions }: { positions: Role[] }) {
  return (
    <span className="flex gap-0.5">
      {positions.map((r) => (
        <span
          key={r}
          className="border border-[var(--md-ink)] bg-[var(--md-white)] px-1 font-mono text-[9px] font-bold leading-[1.5] text-[var(--md-ink)]"
        >
          {r}
        </span>
      ))}
    </span>
  );
}

// ── Grid layout (mobile default, 5 columns) ─────────────────────────────────
function GridBoard({
  kinds,
  entries,
  targets,
  selected,
  onSlotClick,
}: {
  kinds: SlotKind[];
  entries: (LineupEntry | null)[];
  targets: number[];
  selected: number | null;
  onSlotClick: (i: number) => void;
}) {
  return (
    <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
      {kinds.map((kind, i) => {
        const entry = entries[i];
        const isTarget = targets.includes(i);
        const isSelected = selected === i;
        const clickable = isTarget || (entry && selected === null) || isSelected;
        return (
          <button
            key={i}
            onClick={() => onSlotClick(i)}
            disabled={!clickable}
            className="flex min-h-[96px] w-full flex-col p-1.5 text-left transition-transform sm:min-h-[112px] sm:p-2"
            style={{
              borderStyle: entry ? "solid" : "dashed",
              // Eligible target slots glow court-green (a "you may place here"
              // cue); a selected slot pops press-yellow.
              borderColor: isTarget ? "var(--md-teal)" : "var(--md-ink)",
              borderWidth: isTarget || isSelected ? "3px" : "2px",
              background: isSelected
                ? "var(--md-yellow)"
                : entry || isTarget
                  ? "var(--md-white)"
                  : "var(--md-paper-2)",
              boxShadow: isSelected || isTarget ? "var(--md-shadow-sm)" : "none",
              cursor: clickable ? "pointer" : "default",
            }}
          >
            <div className="flex items-center justify-between">
              <span
                className="font-cond text-[10px] font-semibold uppercase tracking-[0.1em]"
                style={{ color: isSelected ? "var(--md-ink)" : "var(--md-ink-muted)" }}
              >
                {kind === "FLEX" ? "Flex" : SLOT_LABEL[kind]}
              </span>
            </div>

            {entry ? (
              <div className="mt-1 flex flex-1 flex-col justify-between gap-1">
                <PosChips positions={entry.player.positions} />
                <div
                  className="font-archivo text-[11px] font-extrabold leading-tight break-words sm:text-[14px]"
                  style={{ fontVariationSettings: '"wdth" 90' }}
                >
                  {entry.player.player_name}
                </div>
                <div className="font-mono text-[9px] text-[var(--md-ink-muted)] sm:text-[10px]">
                  {entry.team} &rsquo;{String(entry.player.best_season).slice(2)}
                </div>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center font-cond text-[11px] uppercase tracking-[0.08em] text-[var(--md-ink-muted)]">
                Open
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── List layout (desktop right column) ──────────────────────────────────────
// Each row: slot label (fixed 60px) | content (flex-1) | chip/assign (fixed)
// Filled rows: solid border-l, white bg. Target rows: coral border, slightly
// warm bg with ASSIGN → button. Ineligible open rows: dashed, N/A.
// Selected (rearrange) rows: press-yellow bg.
const SLOT_LABEL_LONG: Record<SlotKind, string> = {
  G: "Guard",
  W: "Wing",
  B: "Big",
  FLEX: "Flex",
};

function ListBoard({
  kinds,
  entries,
  targets,
  selected,
  onSlotClick,
  pendingPlayer,
}: {
  kinds: SlotKind[];
  entries: (LineupEntry | null)[];
  targets: number[];
  selected: number | null;
  onSlotClick: (i: number) => void;
  // The currently pending (drafted but un-slotted) player, if any.
  // Used to generate "eligible for X" / "can't fill" hint text.
  pendingPlayer: PublicPlayer | null;
}) {
  return (
    <div className="flex flex-col" style={{ background: "var(--md-ink)" }}>
      {kinds.map((kind, i) => {
        const entry = entries[i];
        const name = entry ? splitPlayerName(entry.player.player_name) : null;
        const isTarget = targets.includes(i);
        const isSelected = selected === i;
        const clickable = isTarget || (entry !== null && selected === null) || isSelected;

        // Determine if this open slot is ineligible for the pending player
        const isIneligible =
          pendingPlayer !== null &&
          entry === null &&
          !isTarget &&
          !canFill(pendingPlayer.positions, kind);

        // Row background
        const bg = isSelected
          ? "var(--md-yellow)"
          : isTarget
            ? "rgba(229,38,31,0.12)" // warm coral wash on dark
            : "transparent";

        // Target slots get a full coral box border; selected gets yellow box border;
        // filled/empty rows get a subtle left accent + hairline bottom rule.
        const rowStyle: React.CSSProperties = isTarget
          ? {
              background: bg,
              border: "2px solid var(--md-coral)",
              marginBottom: 2,
              cursor: "pointer",
              minHeight: 56,
            }
          : isSelected
            ? {
                background: bg,
                border: "2px solid var(--md-yellow)",
                marginBottom: 2,
                cursor: "pointer",
                minHeight: 56,
              }
            : {
                background: bg,
                borderBottom: "1px solid var(--md-paper-3)",
                borderLeft: "3px solid var(--md-paper-3)",
                cursor: clickable ? "pointer" : "default",
                minHeight: 56,
              };

        return (
          <button
            key={i}
            onClick={() => onSlotClick(i)}
            disabled={!clickable}
            className="flex w-full items-center gap-3 px-4 py-3 text-left"
            style={rowStyle}
          >
            {/* Slot label — fixed width */}
            <span
              className="font-cond w-[52px] shrink-0 text-[11px] font-bold uppercase tracking-[0.12em]"
              style={{
                color: isTarget
                  ? "var(--md-yellow)"
                  : isSelected
                    ? "var(--md-ink)"
                    : "var(--md-ink-muted)",
              }}
            >
              {SLOT_LABEL_LONG[kind]}
            </span>

            {/* Content — flex-1 */}
            <div className="flex flex-1 flex-col justify-center overflow-hidden">
              {entry ? (
                <>
                  <span
                    className="font-archivo font-extrabold leading-tight"
                    style={{
                      fontVariationSettings: '"wdth" 88',
                      fontSize: 16,
                      color: isSelected ? "var(--md-ink)" : "var(--md-white)",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {/* Surname (keeps Jr/III suffix) bold; first name as the tail */}
                    {name?.last.toUpperCase()}
                    {name && name.first && (
                      <span
                        className="ml-1"
                        style={{
                          fontWeight: 400,
                          fontSize: 13,
                          color: isSelected ? "var(--md-ink)" : "var(--md-paper-3)",
                          letterSpacing: 0,
                        }}
                      >
                        {name.first}
                      </span>
                    )}
                  </span>
                </>
              ) : (
                /* All open states are a single-line "Open" so the row never grows
                   when a player is pending. An eligible (target) slot pops white +
                   gets the coral border & "Assign →"; ineligible stays muted + N/A. */
                <span
                  className="font-cond text-[13px] uppercase tracking-[0.08em]"
                  style={{ color: isTarget ? "var(--md-white)" : "var(--md-ink-muted)" }}
                >
                  Open
                </span>
              )}
            </div>

            {/* Right chip / action — fixed width */}
            <div className="shrink-0">
              {entry ? (
                <span
                  className="font-mono text-[11px] font-bold tabular-nums"
                  style={{
                    border: `1.5px solid ${isSelected ? "var(--md-ink)" : "var(--md-paper-3)"}`,
                    color: isSelected ? "var(--md-ink)" : "var(--md-paper-3)",
                    padding: "2px 7px",
                    display: "inline-block",
                    letterSpacing: "0.04em",
                    background: "transparent",
                  }}
                >
                  {entry.team} &rsquo;{String(entry.player.best_season).slice(2)}
                </span>
              ) : isTarget ? (
                <span
                  className="font-cond text-[11px] font-bold uppercase tracking-[0.1em]"
                  style={{
                    background: "var(--md-coral)",
                    color: "var(--md-white)",
                    padding: "4px 10px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  Assign →
                </span>
              ) : isIneligible ? (
                <span
                  className="font-mono text-[11px] font-bold"
                  style={{
                    border: "1.5px dashed var(--md-paper-3)",
                    color: "var(--md-ink-muted)",
                    padding: "2px 7px",
                    display: "inline-block",
                  }}
                >
                  N/A
                </span>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Public component ─────────────────────────────────────────────────────────

export function LineupBoard({
  kinds,
  entries,
  targets,
  selected,
  onSlotClick,
  layout = "grid",
  pendingPlayer = null,
}: {
  kinds: SlotKind[];
  entries: (LineupEntry | null)[];
  targets: number[];
  selected: number | null;
  onSlotClick: (i: number) => void;
  /** "grid" = 5-column compact grid (mobile default); "list" = vertical rows (desktop right column). */
  layout?: "grid" | "list";
  /** The pending (just-drafted, awaiting slot) player — used by list layout for hint text. */
  pendingPlayer?: PublicPlayer | null;
}) {
  if (layout === "list") {
    return (
      <ListBoard
        kinds={kinds}
        entries={entries}
        targets={targets}
        selected={selected}
        onSlotClick={onSlotClick}
        pendingPlayer={pendingPlayer}
      />
    );
  }
  return (
    <GridBoard
      kinds={kinds}
      entries={entries}
      targets={targets}
      selected={selected}
      onSlotClick={onSlotClick}
    />
  );
}
