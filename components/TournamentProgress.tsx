"use client";

// The three-step progress meter for the playoff-entry flow (Sixth Man →
// Captain → Submit). Mirrors the in-draft round meter: a labelled segment per
// step, coral for done, press-yellow for the current step, muted for upcoming.
// Replaces the old stacked "header soup" so the player always knows where they
// are. (Internal name stays "tournament"; the user-facing copy reads "Playoffs".)

export type EntryStep = "sixth" | "captain" | "submit";

const STEPS: { key: EntryStep; label: string }[] = [
  { key: "sixth", label: "Sixth Man" },
  { key: "captain", label: "Captain" },
  { key: "submit", label: "Submit" },
];

export function TournamentProgress({ step }: { step: EntryStep }) {
  const current = STEPS.findIndex((s) => s.key === step) + 1; // 1-based

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between">
        <span className="font-cond text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--md-coral-deep)] sm:text-[15px]">
          Playoff Entry
        </span>
        <span className="font-mono text-[11px] font-bold tracking-[0.06em] text-[var(--md-ink-muted)] sm:text-[13px]">
          STEP {current} / {STEPS.length}
        </span>
      </div>
      <div className="flex gap-2 sm:gap-2.5">
        {STEPS.map((s, i) => {
          const n = i + 1;
          const done = n < current;
          const active = n === current;
          return (
            <div key={s.key} className="flex flex-1 flex-col gap-1.5">
              <div
                className="h-[7px] sm:h-[8px]"
                style={{
                  background: done
                    ? "var(--md-coral)"
                    : active
                      ? "var(--md-yellow)"
                      : "var(--md-paper-3)",
                }}
              />
              <span
                className="font-cond text-[10px] font-semibold uppercase tracking-[0.1em] sm:text-[12px]"
                style={{ color: active ? "var(--md-ink)" : "var(--md-ink-muted)" }}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
