"use client";

export function HowToPlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(56,56,56,0.55)" }}
      onClick={onClose}
    >
      <div
        className="md-card md-card--lift max-h-[85vh] w-full max-w-md overflow-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-2xl font-bold">How to play</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="font-display text-lg text-[var(--md-ink-muted)] hover:text-[var(--md-coral)]"
          >
            ✕
          </button>
        </div>

        <ol className="mt-4 flex flex-col gap-3 text-[14px] leading-relaxed">
          <li>
            <strong>Five rounds.</strong> Each spin hands you one NBA team + era.
            Pick a player from that team and slot him at{" "}
            <strong>Guard, Wing, Big,</strong> or a <strong>Flex</strong>.
          </li>
          <li>
            <strong>Build a real lineup.</strong> Players can fill multiple
            positions; you need at least one true Guard, Wing, and Big. Tap a
            drafted player, then a slot, to move or swap him.
          </li>
          <li>
            <strong>Fit matters.</strong> The sim rewards spacing, playmaking,
            defense and balanced usage — five ball-dominant stars or two
            non-shooting bigs will cost you. Teams never repeat.
          </li>
          <li>
            <strong>Simulate.</strong> Your roster&rsquo;s era-neutral quality
            becomes a net rating, then a record. <strong>82-0</strong> needs a
            flawlessly built, elite five.
          </li>
        </ol>

        <div className="mt-4 grid gap-1 border-t border-[var(--md-paper-3)] pt-3 text-[13px] text-[var(--md-ink-muted)]">
          <div>
            <strong className="text-[var(--md-ink)]">Daily</strong> — the same
            five team/era rolls for everyone today.
          </div>
          <div>
            <strong className="text-[var(--md-ink)]">Classic</strong> — stats
            shown. <strong className="text-[var(--md-ink)]">HoopIQ</strong> —
            stats hidden, draft from memory.
          </div>
        </div>

        <button
          className="md-btn md-btn--lg md-btn--ink mt-5 w-full justify-center"
          onClick={onClose}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
