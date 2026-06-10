"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { GameMode, PublicPlayer } from "@/lib/types";
import { canFill, type SlotKind } from "@/lib/positions";
import { SlotMachine } from "@/components/SlotMachine";
import { PlayerList } from "@/components/PlayerList";
import { LineupBoard, type LineupEntry } from "@/components/LineupBoard";

// The SHARED draft engine for the five starters. Both the main game (which ROLLS
// random team/era sources, with skips) and a private tournament (which REVEALS a
// fixed shared board) use this — they differ only in where `source` comes from and
// what `controls` they render. The placement/rearrange logic lives here once:
//   • pick a player from the current source → auto-place if one slot fits, else
//     stash as `pending` and let the user tap an eligible (glowing) slot;
//   • tap a placed player then a slot to move/swap him between legal positions;
//   • placing a NEW player from the source calls onConsumeSource so the parent can
//     advance (roll the next team / reveal the next board slot).
// Rearranging already-placed players never advances the source.
//
// The lineup itself is LIFTED to the parent (it needs it to simulate/submit). This
// component owns only the transient placement state (pending pick / selected slot).

export function LineupDraftBoard({
  kinds,
  lineup,
  setLineup,
  source,
  sourcePlayers = null,
  sourcePlayersMode = null,
  rolling = false,
  mode,
  allowRespin = false,
  allowCancelPending = true,
  onConsumeSource,
  onNoneEligible,
  headerLabel = "Your lineup",
  counterLabel,
  controls,
}: {
  kinds: SlotKind[];
  lineup: (LineupEntry | null)[];
  setLineup: (
    next: (prev: (LineupEntry | null)[]) => (LineupEntry | null)[],
  ) => void;
  // The current (team, era) to draft from — null while the parent is rolling /
  // advancing. `team` is null while a roll's team reel is still spinning. `receipt`
  // is the signed roll receipt (main game) or "" (board play).
  source: { team: string | null; decade: number; receipt?: string } | null;
  sourcePlayers?: PublicPlayer[] | null;
  sourcePlayersMode?: GameMode | null;
  rolling?: boolean;
  mode: GameMode;
  allowRespin?: boolean;
  // Whether a mid-placement pick can be CANCELED. Default true (main game): you
  // can back out of a just-tapped player and choose a different one. Private
  // tournaments pass false — the slot-choice (the "where does he play?" step with
  // glowing eligible slots) still appears exactly like the main game, but there's
  // no Cancel, so a chosen player can't be swapped for a different one (he can
  // still be rearranged between legal slots after placing).
  allowCancelPending?: boolean;
  // Called after a player drafted FROM the source is placed (not on rearrange), so
  // the parent advances to the next source.
  onConsumeSource: () => void;
  onNoneEligible?: () => void;
  headerLabel?: string;
  // The little "Round N of 5" / "Reveal N of 5" label above the reel.
  counterLabel?: (placedCount: number, total: number) => string;
  // Skip buttons / reveal hints, rendered between the reel and the player list.
  // Receives `pending` so the parent can disable skips mid-placement.
  controls?: (state: { pending: boolean; rolling: boolean }) => ReactNode;
}) {
  // A just-picked player awaiting placement into an eligible slot (null = none).
  // Only ever set in the exploratory (non-lock) flow.
  const [pending, setPending] = useState<PublicPlayer | null>(null);
  // A placed slot selected for a rearrange move/swap (null = none).
  const [selected, setSelected] = useState<number | null>(null);

  // When the source changes (a new team rolled / board slot revealed), drop any
  // transient placement state — the parent used to clear these on every roll.
  const sourceKey = source ? `${source.team}|${source.decade}` : null;
  useEffect(() => {
    setPending(null);
    setSelected(null);
  }, [sourceKey]);

  const placedCount = lineup.filter(Boolean).length;
  const allPlaced = placedCount === kinds.length;
  const usedIds = lineup
    .filter(Boolean)
    .map((e) => (e as LineupEntry).player.entity_id);

  // Place `player` (from the current source) into slot `i`, then advance.
  const placeAt = (player: PublicPlayer, i: number) => {
    if (!source || source.team === null) return;
    const entry: LineupEntry = {
      player,
      team: source.team,
      decade: source.decade,
      receipt: source.receipt ?? "",
    };
    setLineup((prev) => prev.map((s, idx) => (idx === i ? entry : s)));
    setPending(null);
    setSelected(null);
    onConsumeSource();
  };

  // Pick from the source: auto-place if exactly one open slot fits, else stash the
  // pick as `pending` so the user chooses the slot (glowing eligible slots). Same
  // for every mode — private just hides the Cancel affordance (allowCancelPending).
  const pick = (player: PublicPlayer) => {
    const eligible = kinds
      .map((kind, i) => ({ kind, i }))
      .filter(({ i }) => lineup[i] === null)
      .filter(({ kind }) => canFill(player.positions, kind))
      .map(({ i }) => i);
    if (eligible.length === 0) return;
    if (eligible.length === 1) placeAt(player, eligible[0]);
    else setPending(player);
  };

  // Tap a slot: place the pending pick, or move/swap already-placed players. There
  // is no delete — a committed pick can be rearranged but not removed or replaced.
  const onSlotClick = (i: number) => {
    if (pending) {
      if (lineup[i] === null && canFill(pending.positions, kinds[i]))
        placeAt(pending, i);
      return;
    }
    if (selected === null) {
      if (lineup[i]) setSelected(i);
      return;
    }
    if (i === selected) {
      setSelected(null);
      return;
    }
    const sel = lineup[selected] as LineupEntry;
    const target = lineup[i];
    if (target === null) {
      if (canFill(sel.player.positions, kinds[i])) {
        setLineup((prev) =>
          prev.map((s, idx) => (idx === i ? sel : idx === selected ? null : s)),
        );
        setSelected(null);
      }
    } else if (
      canFill(sel.player.positions, kinds[i]) &&
      canFill(target.player.positions, kinds[selected])
    ) {
      setLineup((prev) =>
        prev.map((s, idx) => (idx === i ? sel : idx === selected ? target : s)),
      );
      setSelected(null);
    }
  };

  const draftable = (p: PublicPlayer) => {
    if (usedIds.includes(p.entity_id)) return false;
    return kinds.some((kind, i) => lineup[i] === null && canFill(p.positions, kind));
  };

  // Glowing target slots: where the pending pick may land, or where the selected
  // player may move/swap.
  let targets: number[] = [];
  if (pending) {
    targets = kinds
      .map((kind, i) => ({ kind, i }))
      .filter(({ i }) => lineup[i] === null)
      .filter(({ kind }) => canFill(pending.positions, kind))
      .map(({ i }) => i);
  } else if (selected !== null) {
    const sel = lineup[selected] as LineupEntry;
    targets = kinds
      .map((_, i) => i)
      .filter((i) => {
        if (i === selected) return false;
        const t = lineup[i];
        if (t === null) return canFill(sel.player.positions, kinds[i]);
        return (
          canFill(sel.player.positions, kinds[i]) &&
          canFill(t.player.positions, kinds[selected])
        );
      });
  }

  const counter =
    counterLabel?.(placedCount, kinds.length) ??
    `Round ${placedCount + 1} of ${kinds.length}`;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="mb-2 font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
          {headerLabel} · {placedCount}/{kinds.length}
        </div>
        <LineupBoard
          kinds={kinds}
          entries={lineup}
          targets={targets}
          selected={selected}
          onSlotClick={onSlotClick}
        />
        <div className="mt-2 text-center font-display text-[11px] text-[var(--md-ink-muted)]">
          {pending
            ? "Tap a glowing slot to place him."
            : selected !== null
              ? "Tap a glowing slot to move him (or tap him again to cancel)."
              : allPlaced
                ? "Tap a player, then a slot, to rearrange."
                : "Tip: tap a drafted player then a slot to move him."}
        </div>
      </div>

      {pending && (
        <div className="md-card md-card--lift flex flex-col items-center gap-3 p-4">
          <div className="font-display text-sm">
            Where does <span className="font-bold">{pending.player_name}</span> play?
          </div>
          <div className="font-display text-[11px] text-[var(--md-ink-muted)]">
            Tap a glowing slot above.
          </div>
          {allowCancelPending && (
            <button
              className="md-btn md-btn--sm md-btn--secondary"
              onClick={() => setPending(null)}
            >
              Cancel pick
            </button>
          )}
        </div>
      )}

      {!allPlaced && !pending && source && (
        <div className="md-card md-card--lift flex flex-col items-center gap-3 p-3 sm:gap-4 sm:p-5">
          <div className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
            {counter}
          </div>
          <SlotMachine team={rolling ? null : source.team} decade={source.decade} size="lg" />
          {controls?.({ pending: pending !== null, rolling })}
          <div className="w-full">
            {!rolling && source.team !== null ? (
              <PlayerList
                team={source.team}
                decade={source.decade}
                mode={mode}
                players={sourcePlayers}
                playersMode={
                  sourcePlayers !== null && sourcePlayers !== undefined
                    ? sourcePlayersMode
                    : null
                }
                allowRespin={allowRespin}
                draftable={draftable}
                onPick={pick}
                onNoneEligible={onNoneEligible ?? (() => {})}
              />
            ) : (
              <div className="py-8 text-center font-display text-sm text-[var(--md-ink-muted)]">
                Spinning the reel…
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
