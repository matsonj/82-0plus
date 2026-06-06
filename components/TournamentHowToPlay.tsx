"use client";

// First-visit explainer for Tournament Edition (mirrors HowToPlay). Shown once,
// gated by localStorage in the entry flow.
export function TournamentHowToPlay({ onClose }: { onClose: () => void }) {
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
          <h2 className="font-display text-2xl font-bold">Tournament Edition</h2>
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
            <strong>Enter your five.</strong> The team you just built goes in
            as-is — then draft a <strong>sixth man</strong> and choose a{" "}
            <strong>captain</strong> — they buff your team in unique ways.
          </li>
          <li>
            <strong>Get seeded into a 16-team bracket.</strong> Teams split into
            East &amp; West by their players&rsquo; real conferences, seeded by net
            rating. Classic teams play Classic, HoopIQ plays HoopIQ.
          </li>
          <li>
            <strong>Survive the series.</strong> Every round is a best-of-7. Home
            court, height, a sixth-man-driven recovery, fatigue (older teams fade)
            and a roster-fit <strong>game score</strong> all swing the games.
          </li>
          <li>
            <strong>Come back any time.</strong> Your account (name + PIN)
            remembers every team you enter — look them up to replay the bracket.
            🤖 teams are AI fillers; the rest are real people.
          </li>
        </ol>

        <button
          className="md-btn md-btn--lg md-btn--ink mt-5 w-full justify-center"
          onClick={onClose}
        >
          Let&rsquo;s go
        </button>
      </div>
    </div>
  );
}
