"use client";

import type { TournamentRunResponse } from "@/lib/types";
import { BracketView } from "@/components/BracketView";

// reachedRound: 0 = lost R1 … 4 = champion. Maps to a player-facing phrase.
function reachedLabel(reachedRound: number, isChampion: boolean): string {
  if (isChampion) return "🏆 Champion";
  switch (reachedRound) {
    case 0:
      return "Lost in Round 1";
    case 1:
      return "Lost in the Conference Semifinals";
    case 2:
      return "Lost in the Conference Finals";
    case 3:
      return "Lost in the Final";
    default:
      return "Eliminated";
  }
}

export function TournamentResults({
  data,
  onReset,
}: {
  data: TournamentRunResponse;
  onReset?: () => void;
}) {
  const { bracket, you } = data;
  const isChampion = bracket.championId === you.id;

  return (
    <div className="flex flex-col gap-5">
      {/* Summary card — ResultsPanel aesthetic. */}
      <div className="md-card md-card--lift flex flex-col gap-4 p-4 sm:p-5">
        <div className="text-center">
          {isChampion ? (
            <div className="md-capsule md-capsule--teal mb-2">
              🏆 Tournament Champion
            </div>
          ) : (
            <div className="md-capsule mb-2">Tournament Result</div>
          )}
          <div
            className="font-display font-bold break-words"
            style={{ fontSize: "clamp(34px, 10vw, 56px)", lineHeight: 1 }}
          >
            {you.name}
          </div>
          <div className="mt-2 font-display text-sm text-[var(--md-ink-muted)]">
            #{you.seed} seed · {you.conference}
          </div>
          <div
            className="mt-1 font-display text-base font-bold"
            style={{
              color: isChampion ? "var(--md-teal)" : "var(--md-ink)",
            }}
          >
            {reachedLabel(you.reachedRound, isChampion)}
          </div>
        </div>

        <div className="border-t-2 border-[var(--md-ink)] pt-3 text-center">
          <div className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
            Champion
          </div>
          <div className="mt-1 font-display text-xl font-bold">
            🏆 {bracket.championName}
          </div>
        </div>

        {onReset && (
          <div className="flex justify-center">
            <button className="md-btn md-btn--lg md-btn--ink" onClick={onReset}>
              Back to menu
            </button>
          </div>
        )}
      </div>

      {/* The full bracket, with the user's team highlighted across rounds. */}
      <div>
        <div className="mb-2 font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
          The Bracket
        </div>
        <BracketView bracket={bracket} youId={you.id} />
      </div>
    </div>
  );
}
