"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { GameMode, PublicPlayer } from "@/lib/types";
import { canFill, type SlotKind } from "@/lib/positions";
import { SlotMachine } from "@/components/SlotMachine";
import { PlayerList } from "@/components/PlayerList";
import { LineupBoard, type LineupEntry } from "@/components/LineupBoard";
import { Button } from "@/components/ui";

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

  // ── Draft folio header + 5-segment progress bar ──────────────────────────
  // Segments: completed = flame-red solid; current = press-yellow outline;
  // remaining = dashed/empty. The current slot is `placedCount` (0-indexed).
  const ProgressBar = ({ className = "" }: { className?: string }) => (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-end justify-between">
        <span
          className="font-cover uppercase leading-none"
          style={{
            fontSize: "clamp(20px, 3.2vw, 28px)",
            letterSpacing: "-0.01em",
            color: "var(--md-ink)",
          }}
        >
          Draft · {counter}
        </span>
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--md-ink-muted)]">
          {placedCount} locked
        </span>
      </div>
      <div className="flex gap-1">
        {kinds.map((_, i) => {
          const done = i < placedCount;
          const current = i === placedCount && !allPlaced;
          return (
            <div
              key={i}
              className="flex-1"
              style={{
                height: 10,
                background: done ? "var(--md-coral)" : "transparent",
                border: current
                  ? "2px solid var(--md-yellow)"
                  : done
                    ? "none"
                    : "2px dashed var(--md-paper-3)",
              }}
            />
          );
        })}
      </div>
    </div>
  );

  // ── Shared roll card ──────────────────────────────────────────────────────
  const RollCard = () =>
    !allPlaced && !pending && source ? (
      <div className="md-card--cover p-4 sm:p-6">
        <div
          className="flex items-end justify-between pb-3"
          style={{ borderBottom: "1px solid var(--md-paper)", boxShadow: "0 4px 0 -1px var(--md-paper)" }}
        >
          <span className="font-cond text-[13px] font-semibold uppercase tracking-[0.18em] text-[var(--md-paper)]">
            Your Roll · Team + Era
          </span>
          <span className="font-mono text-[12px] font-bold uppercase tracking-[0.06em] text-[var(--md-yellow)]">
            {counter}
          </span>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <SlotMachine team={rolling ? null : source.team} decade={source.decade} size="lg" />
          {controls && (
            <div className="flex flex-col items-end gap-2">
              {controls({ pending: pending !== null, rolling })}
            </div>
          )}
        </div>
      </div>
    ) : null;

  // ── Shared player list section ────────────────────────────────────────────
  const PlayerListSection = () =>
    !allPlaced && !pending && source ? (
      <div>
        <div className="md-rule-double flex items-end justify-between pb-2">
          <span className="font-cover text-[26px] uppercase leading-none tracking-[-0.01em]">
            Draft a Player
          </span>
          {source.team !== null && (
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--md-ink-muted)]">
              {source.team} · {source.decade}s
            </span>
          )}
        </div>
        <div className="mt-3 w-full">
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
            <div className="py-8 text-center font-byline text-sm text-[var(--md-ink-muted)]">
              Spinning the reel…
            </div>
          )}
        </div>
      </div>
    ) : null;

  // ── Right column: roster list + draft count + sim button ─────────────────
  const RosterColumn = ({ listLayout }: { listLayout: "grid" | "list" }) => (
    <div
      className="flex flex-col"
      style={
        listLayout === "list"
          ? { background: "var(--md-ink)", border: "2px solid var(--md-paper-3)" }
          : undefined
      }
    >
      {/* Header */}
      <div
        className={
          listLayout === "list"
            ? "flex items-center justify-between border-b border-[var(--md-paper-3)] px-4 py-3"
            : "md-rule-double flex items-end justify-between pb-2"
        }
      >
        <span
          className={
            listLayout === "list"
              ? "font-archivo uppercase text-[var(--md-white)]"
              : "font-cond text-[14px] font-bold uppercase tracking-[0.16em]"
          }
          style={
            listLayout === "list"
              ? { fontVariationSettings: '"wdth" 88', fontWeight: 800, fontSize: 14, letterSpacing: "0.08em" }
              : undefined
          }
        >
          {headerLabel === "Your lineup" ? "Your Roster" : headerLabel}
        </span>
        <span
          className="font-mono text-[12px] font-bold tabular-nums"
          style={{ color: listLayout === "list" ? "var(--md-paper-3)" : "var(--md-ink-muted)" }}
        >
          {placedCount}/{kinds.length} set
        </span>
      </div>

      {/* Board */}
      <div className={listLayout === "list" ? "" : "mt-3"}>
        <LineupBoard
          kinds={kinds}
          entries={lineup}
          targets={targets}
          selected={selected}
          onSlotClick={onSlotClick}
          layout={listLayout}
          pendingPlayer={pending}
        />
      </div>

      {/* Hint text (grid only — list has inline cues) */}
      {listLayout === "grid" && (
        <div className="mt-2 text-center font-byline text-[12px] text-[var(--md-ink-muted)]">
          {pending
            ? "Tap a glowing slot to place him."
            : selected !== null
              ? "Tap a glowing slot to move him (or tap him again to cancel)."
              : allPlaced
                ? "Tap a player, then a slot, to rearrange."
                : "Draft a player below, then slot him. Eligible open slots light up."}
        </div>
      )}

      {/* List-layout: hint + draft count + simulate ghost */}
      {listLayout === "list" && (
        <>
          {/* Instruction line */}
          <div className="flex items-start gap-2 border-t border-[var(--md-paper-3)] px-4 py-3">
            <span style={{ color: "var(--md-yellow)", fontSize: 16, lineHeight: 1, marginTop: 1 }}>☆</span>
            <span className="font-byline text-[12px] text-[var(--md-paper-3)]">
              {pending
                ? "Click a glowing slot to place him."
                : selected !== null
                  ? "Click a glowing slot to move him (or click him again to cancel)."
                  : allPlaced
                    ? "Click a player, then a slot, to rearrange."
                    : "Draft a player, then slot him at Guard, Wing, Big, or Flex. Eligible open slots light up."}
            </span>
          </div>
        </>
      )}
    </div>
  );

  // ── Pending card (shared between layouts) ────────────────────────────────
  const PendingCard = () =>
    pending ? (
      <div className="md-card md-card--lift flex flex-col items-center gap-3 p-4">
        <div className="text-sm">
          Where does{" "}
          <span className="font-archivo font-bold" style={{ fontVariationSettings: '"wdth" 90' }}>
            {pending.player_name}
          </span>{" "}
          play?
        </div>
        <div className="font-byline text-[12px] text-[var(--md-ink-muted)]">
          Tap a glowing slot above.
        </div>
        {allowCancelPending && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setPending(null)}
          >
            Cancel pick
          </Button>
        )}
      </div>
    ) : null;

  // ── Desktop right column: drafted count + simulate ghost ─────────────────
  const SimGhost = () => (
    <div
      className="mt-auto flex flex-col gap-2"
      style={{ borderTop: "1px solid var(--md-paper-3)" }}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <span className="font-cond text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--md-ink-muted)]">
          Drafted
        </span>
        <span
          className="font-cover tabular-nums leading-none"
          style={{ fontSize: 32, color: "var(--md-yellow)", letterSpacing: "-0.02em" }}
        >
          {placedCount}{" "}
          <span style={{ color: "var(--md-paper-3)", fontSize: 24 }}>/ {kinds.length}</span>
        </span>
      </div>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── MOBILE layout (hidden at lg) ── */}
      <div className="flex flex-col gap-5 lg:hidden">
        {/* Progress bar */}
        <ProgressBar />

        {/* Roll card */}
        <RollCard />

        {/* Roster grid */}
        <RosterColumn listLayout="grid" />

        {/* Pending placement card */}
        <PendingCard />

        {/* Player list */}
        <PlayerListSection />
      </div>

      {/* ── DESKTOP layout (hidden below lg) ── */}
      <div className="hidden lg:flex lg:flex-row lg:items-start lg:gap-8">

        {/* LEFT column: folio + roll + player list */}
        <div className="flex min-w-0 flex-1 flex-col gap-5" style={{ flex: "1.6 1 0" }}>
          {/* Progress bar */}
          <ProgressBar />

          {/* Roll card */}
          <RollCard />

          {/* Pending placement card */}
          <PendingCard />

          {/* Player list */}
          <PlayerListSection />

          {/* When all placed + no source: show rearrange hint in left col */}
          {allPlaced && (
            <div className="font-byline text-[13px] text-[var(--md-ink-muted)]">
              Tap a player, then a slot, to rearrange.
            </div>
          )}
        </div>

        {/* RIGHT column: roster list + drafted count */}
        <div
          className="flex shrink-0 flex-col"
          style={{ flex: "1 1 0", minWidth: 320, maxWidth: 480 }}
        >
          <RosterColumn listLayout="list" />
          <SimGhost />
        </div>
      </div>
    </>
  );
}
