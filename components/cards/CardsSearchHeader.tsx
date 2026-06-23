import { PageHeader } from "@/components/layout/PageHeader";

export function CardsSearchHeader({
  query,
  onQueryChange,
}: {
  query: string;
  onQueryChange: (query: string) => void;
}) {
  return (
    <PageHeader
      eyebrowLeft="The daily 82 archive"
      eyebrowRight="Search the archive"
      kicker="Flip through history."
      title={<>Player<br />Cards.</>}
      titleStyle={{
        fontSize: "clamp(42px, 10vw, 80px)",
        lineHeight: 0.88,
        letterSpacing: "-0.01em",
      }}
      description={
        <>
          Every team is a stack of eras. Open one, then flip through each
          player&rsquo;s career card.
        </>
      }
      descriptionClassName="max-w-sm"
      aside={
        <div className="sm:w-[340px]">
          <div className="font-cond mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--md-ink-muted)]">
            Search
          </div>
          <div className="relative">
            <span
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--md-ink-muted)]"
              aria-hidden
              style={{ fontSize: 14 }}
            >
              &#128269;
            </span>
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search a team, player, or year (e.g. LAL, Jokić, 1996)…"
              className="md-input w-full pl-8 text-[13px]"
              style={{ fontSize: 13, padding: "10px 12px 10px 32px" }}
            />
          </div>
        </div>
      }
    />
  );
}
