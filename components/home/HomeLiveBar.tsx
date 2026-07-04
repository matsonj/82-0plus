import Link from "next/link";

// Full-bleed "live public tournaments" beacon, shown under the masthead on the
// home menu. Flame red is THE SLAM live-beacon / CTA ink (type on flame is cream);
// the JOIN chip is a press-yellow stamp (ink type). Renders nothing when no listed
// tournaments still have room, so it never shows a dead "0 open" bar. A signed-in
// user already in an open tournament sees their own entry instead of the join hook
// (`entered`) — a push to finish an unsubmitted lineup, or a pointer at the field
// once submitted.
//
// Full-bleed trick (same as GlobalHeader): width:100vw + marginLeft:calc(50% - 50vw)
// breaks it out of the PageShell max-width; body has overflow-x:hidden to absorb
// the scrollbar gutter. The inner content is re-constrained to the page width.
export function HomeLiveBar({
  count,
  entrants,
  href,
  entered,
}: {
  count: number;
  entrants: number;
  // Where "Join the field" goes: a single joinable tournament links straight to its
  // lobby (/p/<id>); 2+ go to the browsable list. Computed by the caller.
  href: string;
  // The signed-in user's own open entries (from the home bootstrap). When set, the
  // bar stops selling the join hook and points at their own entry instead — name
  // for a lone entry, count for several. `needsFinish` = an entry's lineup isn't
  // submitted yet (href targets it). null/undefined = signed out or not entered.
  entered?: {
    count: number;
    name: string | null;
    href: string;
    needsFinish: boolean;
  } | null;
}) {
  if (count <= 0) return null;
  return (
    <div
      // -mt cancels GlobalHeader's mb-4/sm:mb-8 so the strip sits flush against the
      // masthead (no newsprint gap); the matching mb re-emits that gap BELOW the
      // strip, before the page content.
      className="-mt-4 mb-4 border-y-2 border-[var(--md-ink)] sm:-mt-8 sm:mb-8"
      style={{
        width: "100vw",
        marginLeft: "calc(50% - 50vw)",
        background: "var(--md-coral)",
      }}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-1.5 px-4 py-2 sm:py-3">
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
            className="font-archivo text-[15px] font-extrabold text-[var(--md-white)] sm:text-[18px]"
            style={{ fontVariationSettings: '"wdth" 100' }}
          >
            {entered ? (
              entered.needsFinish ? (
                <>Finish your entry in {entered.name}</>
              ) : (
                <>You&rsquo;re in {entered.name ?? `${entered.count} tournaments`}</>
              )
            ) : (
              <>
                {count} public tournament{count === 1 ? "" : "s"} open now
              </>
            )}
          </span>
          {/* Social proof for the join hook only — `entrants` counts the joinable
              public tournaments, not the user's own, so it'd mislead when entered. */}
          {!entered && entrants > 0 && (
            <span className="hidden font-mono text-[12px] text-[var(--md-paper)] sm:inline">
              · {entrants} in the field
            </span>
          )}
        </div>
        <Link
          href={entered ? entered.href : href}
          className="inline-flex shrink-0 items-center gap-2 border-2 border-[var(--md-ink)] px-3 py-1.5 font-cond text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--md-ink)] transition-transform hover:-translate-y-0.5 sm:px-4 sm:py-2 sm:text-[13px]"
          style={{ background: "var(--md-yellow)", boxShadow: "var(--md-shadow-sm)" }}
        >
          {entered ? (
            entered.needsFinish ? (
              <>Finish your lineup</>
            ) : entered.count === 1 ? (
              <>See the field</>
            ) : (
              <>See your tournaments</>
            )
          ) : (
            <>Join the field</>
          )}{" "}
          <span aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}
