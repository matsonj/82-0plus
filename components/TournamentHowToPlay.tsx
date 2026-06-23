"use client";

// First-visit explainer for Tournament Edition. SLAM editorial treatment:
// ink masthead band, Archivo headline, numbered rules in Space Grotesk body.
export function TournamentHowToPlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(21,17,14,0.7)" }}
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-auto border-2 border-[var(--md-ink)]"
        style={{ background: "var(--md-white)", boxShadow: "var(--md-shadow-md)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ink masthead */}
        <div
          className="flex items-start justify-between gap-3 px-6 py-5"
          style={{ background: "var(--md-ink)", borderBottom: "2px solid var(--md-coral)" }}
        >
          <h2
            className="font-archivo leading-tight"
            style={{ fontSize: 26, fontWeight: 800, fontVariationSettings: '"wdth" 88', color: "var(--md-white)" }}
          >
            Tournament Edition
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="font-cond text-lg font-bold transition-colors hover:text-[var(--md-coral)]"
            style={{ color: "var(--md-paper-3)" }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-0 px-6 py-5">
          <ol className="flex flex-col gap-4 text-[14px] leading-relaxed">
            <li className="flex gap-3">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center border-2 border-[var(--md-ink)] font-mono text-[11px] font-bold"
                style={{ background: "var(--md-coral)", color: "var(--md-white)" }}
              >
                1
              </span>
              <span>
                <strong>Enter your five.</strong> The team you just built goes in
                as-is — then draft a <strong>sixth man</strong> and choose a{" "}
                <strong>captain</strong> — they buff your team in unique ways.
              </span>
            </li>
            <li className="flex gap-3">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center border-2 border-[var(--md-ink)] font-mono text-[11px] font-bold"
                style={{ background: "var(--md-coral)", color: "var(--md-white)" }}
              >
                2
              </span>
              <span>
                <strong>Get seeded into a 16-team bracket.</strong> Teams split into
                East &amp; West by their players&rsquo; real conferences, seeded by net
                rating. Classic teams play Classic, Ranked plays Ranked.
              </span>
            </li>
            <li className="flex gap-3">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center border-2 border-[var(--md-ink)] font-mono text-[11px] font-bold"
                style={{ background: "var(--md-coral)", color: "var(--md-white)" }}
              >
                3
              </span>
              <span>
                <strong>Survive the series.</strong> Every round is a best-of-7.
                Home court, height, a sixth-man-driven recovery, fatigue (older
                teams fade) and a roster-fit <strong>game score</strong> all swing
                the games.
              </span>
            </li>
            <li className="flex gap-3">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center border-2 border-[var(--md-ink)] font-mono text-[11px] font-bold"
                style={{ background: "var(--md-coral)", color: "var(--md-white)" }}
              >
                4
              </span>
              <span>
                <strong>Come back any time.</strong> Your account (name + PIN)
                remembers every team you enter — look them up to replay the
                bracket. 🤖 teams are AI fillers; the rest are real people.
              </span>
            </li>
          </ol>
        </div>

        {/* CTA */}
        <div className="px-6 pb-6">
          <button
            className="md-btn md-btn--lg w-full justify-center"
            style={{ background: "var(--md-coral)", color: "var(--md-white)" }}
            onClick={onClose}
          >
            Let&rsquo;s go
          </button>
        </div>
      </div>
    </div>
  );
}
