import Link from "next/link";

// Full-bleed "live public tournaments" beacon, shown under the masthead on the
// home menu. Flame red is THE SLAM live-beacon / CTA ink (type on flame is cream);
// the JOIN chip is a press-yellow stamp (ink type). Renders nothing when no
// tournaments are open, so it never shows a dead "0 open" bar.
//
// Full-bleed trick (same as GlobalHeader): width:100vw + marginLeft:calc(50% - 50vw)
// breaks it out of the PageShell max-width; body has overflow-x:hidden to absorb
// the scrollbar gutter. The inner content is re-constrained to the page width.
export function HomeLiveBar({
  count,
  entrants,
}: {
  count: number;
  entrants: number;
}) {
  if (count <= 0) return null;
  return (
    <div
      className="border-y-2 border-[var(--md-ink)]"
      style={{
        width: "100vw",
        marginLeft: "calc(50% - 50vw)",
        background: "var(--md-coral)",
      }}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex shrink-0 items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: "var(--md-yellow)" }}
              aria-hidden
            />
            <span className="font-cond text-[12px] font-bold uppercase tracking-[0.18em] text-[var(--md-white)]">
              Live
            </span>
          </span>
          <span
            className="font-archivo text-[18px] font-extrabold text-[var(--md-white)]"
            style={{ fontVariationSettings: '"wdth" 100' }}
          >
            {count} public tournament{count === 1 ? "" : "s"} open now
          </span>
          {entrants > 0 && (
            <span className="font-mono text-[12px] text-[var(--md-paper)]">
              · {entrants} in the field
            </span>
          )}
        </div>
        <Link
          href="/tournament?tab=private&intent=public"
          className="inline-flex shrink-0 items-center gap-2 border-2 border-[var(--md-ink)] px-4 py-2 font-cond text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--md-ink)] transition-transform hover:-translate-y-0.5"
          style={{ background: "var(--md-yellow)", boxShadow: "var(--md-shadow-sm)" }}
        >
          Join the field <span aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}
