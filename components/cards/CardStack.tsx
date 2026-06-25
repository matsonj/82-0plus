import Link from "next/link";

export function CardStack({
  team,
  eras,
  href,
}: {
  team: string;
  eras: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group relative mr-1.5 mt-1.5 block transition-transform hover:-translate-y-0.5"
      aria-label={`${team} - ${eras} era${eras === 1 ? "" : "s"}`}
    >
      {eras >= 3 && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -translate-y-2 translate-x-2 border-2 border-[var(--md-ink)] bg-[var(--md-paper-3)]"
        />
      )}
      {eras >= 2 && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -translate-y-1 translate-x-1 border-2 border-[var(--md-ink)] bg-[var(--md-paper-2)]"
        />
      )}
      <div
        className="relative flex flex-col border-2 border-[var(--md-ink)] bg-[var(--md-white)]"
        style={{ boxShadow: "var(--md-shadow-md)" }}
      >
        <div className="flex items-center justify-between border-b border-[var(--md-paper-3)] bg-[var(--md-white)] px-2 py-1">
          <span className="font-cond text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--md-ink-muted)]">
            Deck
          </span>
          <svg viewBox="0 0 12 12" width={10} height={10} aria-hidden style={{ color: "var(--md-ink-muted)" }}>
            <rect x="1.5" y="0.5" width="9" height="11" rx="0" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <line x1="3" y1="3.5" x2="9" y2="3.5" stroke="currentColor" strokeWidth="1.1" />
            <line x1="3" y1="6" x2="9" y2="6" stroke="currentColor" strokeWidth="0.9" />
            <line x1="3" y1="8.5" x2="7" y2="8.5" stroke="currentColor" strokeWidth="0.9" />
          </svg>
        </div>
        <div className="flex flex-1 flex-col justify-between p-2.5 pb-3">
          <div
            className="font-cover leading-none"
            style={{ fontSize: "clamp(32px, 4.5vw, 48px)", letterSpacing: "-0.01em", lineHeight: 0.92 }}
          >
            {team}
          </div>
          <div className="mt-3">
            <div
              className="font-cond text-[10px] font-bold uppercase tracking-[0.06em]"
              style={{ color: "var(--md-coral)" }}
            >
              {eras} era{eras === 1 ? "" : "s"}
            </div>
          </div>
        </div>
        <div className="h-[3px] w-full" style={{ background: "var(--md-coral)" }} />
      </div>
    </Link>
  );
}
