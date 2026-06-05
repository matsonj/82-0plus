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

// A four-pip progress meter (R1 → Final). Filled pips = rounds the team won
// through; the last filled pip glows teal for a champion.
function ProgressPips({
  reachedRound,
  isChampion,
}: {
  reachedRound: number;
  isChampion: boolean;
}) {
  const labels = ["R1", "Semis", "Conf F", "Final"];
  return (
    <div className="flex items-stretch justify-center gap-1.5">
      {labels.map((lbl, i) => {
        // A team that reached round R cleared rounds 0..R-1; the champion
        // (reachedRound 4) fills all four.
        const filled = i < reachedRound;
        return (
          <div
            key={lbl}
            className="flex flex-1 flex-col items-center gap-1"
            style={{ maxWidth: 64 }}
          >
            <div
              className="h-2 w-full border-2 border-[var(--md-ink)]"
              style={{
                background: filled
                  ? isChampion
                    ? "var(--md-teal-bright)"
                    : "var(--md-yellow)"
                  : "var(--md-paper-2)",
              }}
            />
            <span className="font-display text-[9px] uppercase tracking-wide text-[var(--md-ink-muted)]">
              {lbl}
            </span>
          </div>
        );
      })}
    </div>
  );
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
    <div className="flex flex-col gap-6">
      {/* Hero — the player's run, ResultsPanel aesthetic. */}
      <div className="md-card md-card--lift flex flex-col gap-4 p-4 sm:p-5">
        <div className="text-center">
          {isChampion ? (
            <div className="md-capsule md-capsule--teal mb-3">
              🏆 Tournament Champion
            </div>
          ) : (
            <div className="md-capsule mb-3">Tournament Result</div>
          )}
          <div
            className="font-display font-bold break-words"
            style={{ fontSize: "clamp(34px, 10vw, 56px)", lineHeight: 1 }}
          >
            {you.name}
          </div>
          {/* Seed + conference as tight capsules, like ResultsPanel's headers. */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <span className="md-capsule">#{you.seed} Seed</span>
            <span
              className={`md-capsule ${
                you.conference === "West" ? "md-capsule--sky" : "md-capsule--coral"
              }`}
            >
              {you.conference}
            </span>
          </div>
          <div
            className="mt-3 font-display text-lg font-bold sm:text-xl"
            style={{ color: isChampion ? "var(--md-teal)" : "var(--md-ink)" }}
          >
            {reachedLabel(you.reachedRound, isChampion)}
          </div>
          <div className="mt-3">
            <ProgressPips reachedRound={you.reachedRound} isChampion={isChampion} />
          </div>
        </div>

        {/* Champion banner. */}
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
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="md-capsule">The Bracket</div>
          <div className="flex items-center gap-1.5 font-display text-[10px] uppercase tracking-wide text-[var(--md-ink-muted)]">
            <span
              className="inline-block h-3 w-3 border-2 border-[var(--md-ink)]"
              style={{ background: "var(--md-yellow)" }}
            />
            <span>★ you</span>
          </div>
        </div>
        <BracketView bracket={bracket} youId={you.id} />
      </div>
    </div>
  );
}
