import type { Metadata } from "next";
import Link from "next/link";
import { decodeShare } from "@/lib/shareCode";
import { GlobalHeader } from "@/components/GlobalHeader";
import { MOTHERDUCK_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ r?: string }>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { r } = await searchParams;
  const data = r ? decodeShare(r) : null;

  if (!data) {
    return {
      title: "daily82 · Build an undefeated season",
      description: "Draft a 5-man roster across the decades and see if it can go 82-0.",
    };
  }

  const sign = data.n >= 0 ? "+" : "";
  const title = data.p
    ? `daily82 🏆 ${data.w}–${data.l} — a PERFECT season!`
    : `daily82 🏀 ${data.w}–${data.l} (${sign}${data.n.toFixed(1)} net)`;
  const description = `${data.m} · ${data.r
    .map((p) => `${p.t} '${String(p.s).slice(2)} ${p.name}`)
    .join(", ")}. Can you do better?`;
  const ogImage = `/api/og?r=${encodeURIComponent(r!)}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "daily82",
      url: `/s?r=${encodeURIComponent(r!)}`,
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function SharePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { r } = await searchParams;
  const data = r ? decodeShare(r) : null;
  const signedNet = data
    ? `${data.n >= 0 ? "+" : ""}${data.n.toFixed(1)}`
    : null;

  const sharerName: string = data?.u ?? "Someone";
  const modeLabel = data?.m ?? "Classic";
  const isPerfect = data?.p ?? false;

  return (
    <main className="relative mx-auto flex min-h-full max-w-6xl flex-col px-4 pb-0">
      <div className="md-sunbeam" />
      <GlobalHeader />

      {data ? (
        /* ── Two-column spread: left = hero score, right = roster panel ── */
        <div className="relative z-10 mt-6 flex flex-col gap-6 sm:mt-8 lg:flex-row lg:items-stretch lg:gap-0">

          {/* ── LEFT: hero score on newsprint ── */}
          <div className="flex flex-col justify-between lg:w-[520px] lg:shrink-0 lg:pr-12">
            {/* Kicker row */}
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-cond text-[13px] font-semibold uppercase tracking-[0.18em] text-[var(--md-ink-muted)]">
                  {sharerName} shared a season
                </span>
                {isPerfect ? (
                  <span className="md-capsule md-capsule--teal text-[11px]">
                    Perfect
                  </span>
                ) : (
                  <span className="md-capsule md-capsule--press font-cond text-[11px] font-bold uppercase tracking-[0.1em]">
                    {modeLabel}
                  </span>
                )}
              </div>

              {/* Giant score */}
              <div
                className="mt-3 flex items-baseline gap-4 leading-none"
                aria-label={`${data.w} wins, ${data.l} losses`}
              >
                <span
                  className="font-cover"
                  style={{
                    fontSize: "clamp(72px, 14vw, 160px)",
                    lineHeight: 0.88,
                    color: "var(--md-coral)",
                    letterSpacing: "-0.02em",
                  }}
                >
                  {data.w}
                </span>
                <span
                  className="font-mono font-bold"
                  style={{
                    fontSize: "clamp(32px, 6vw, 60px)",
                    color: "var(--md-ink-muted)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                  aria-hidden
                >
                  &ndash;
                </span>
                <span
                  className="font-archivo uppercase"
                  style={{
                    fontVariationSettings: '"wdth" 88',
                    fontWeight: 800,
                    fontSize: "clamp(72px, 14vw, 160px)",
                    lineHeight: 0.88,
                    color: "var(--md-white)",
                    letterSpacing: "-0.02em",
                    WebkitTextStroke: "2px var(--md-ink)",
                  }}
                >
                  {data.l}
                </span>
              </div>

              {/* Record label + rule */}
              <div className="mt-4">
                <div className="font-cond text-[12px] font-semibold uppercase tracking-[0.2em] text-[var(--md-ink-muted)]">
                  Regular Season Record
                </div>
                <div className="mt-2 flex flex-col gap-[3px]">
                  <div className="h-[4px] w-full bg-[var(--md-ink)]" />
                  <div className="h-[1px] w-2/3 bg-[var(--md-coral)]" />
                </div>
              </div>

              {/* Net rating */}
              <div className="mt-5 flex items-baseline gap-2">
                <span
                  className="font-mono tabular-nums"
                  style={{
                    fontSize: "clamp(28px, 5vw, 44px)",
                    fontWeight: 700,
                    lineHeight: 1,
                    color: data.n >= 0 ? "var(--md-teal)" : "var(--md-coral-deep)",
                  }}
                >
                  {signedNet}
                </span>
                <span className="font-cond text-[12px] font-semibold uppercase tracking-[0.2em] text-[var(--md-ink-muted)]">
                  Net Rating
                </span>
              </div>

              {/* Deck note */}
              <p className="font-byline mt-3 text-[14px] tracking-[0.02em] text-[var(--md-ink-muted)]">
                Five rolls, everyone the same.
              </p>
            </div>

            {/* CTA */}
            <div className="mt-8 lg:mt-12">
              <Link
                href="/"
                className="md-btn md-btn--lg flex w-full items-center justify-between"
                style={{ maxWidth: 520 }}
              >
                <span>Build your own season</span>
                <span aria-hidden>→</span>
              </Link>
            </div>
          </div>

          {/* ── RIGHT: roster panel — ink cover card ── */}
          <div
            className="flex flex-1 flex-col border-2 border-[var(--md-coral)] p-6 lg:p-8"
            style={{
              background: "var(--md-ink)",
              boxShadow: "var(--md-shadow-pop)",
            }}
          >
            {/* Roster panel header */}
            <div className="mb-4 flex items-baseline justify-between">
              <div>
                <h2
                  className="font-archivo uppercase leading-none"
                  style={{
                    fontVariationSettings: '"wdth" 88',
                    fontWeight: 800,
                    fontSize: "clamp(28px, 4vw, 48px)",
                    color: "var(--md-white)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  The Roster
                </h2>
                <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--md-ink-muted)]">
                  Per-game averages · Simulated 82-game season
                </div>
              </div>
              <span className="font-cond hidden text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--md-ink-muted)] sm:block">
                Starting Lineup
              </span>
            </div>

            {/* Table header */}
            <div
              className="mb-1 grid items-center border-b border-[var(--md-paper-3)] pb-2"
              style={{ gridTemplateColumns: "48px 1fr 60px 52px 52px" }}
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--md-ink-muted)]">#</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--md-ink-muted)]">Player</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-right text-[var(--md-ink-muted)]">PTS</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-right text-[var(--md-ink-muted)]">REB</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-right text-[var(--md-ink-muted)]">AST</span>
            </div>

            {/* Roster rows */}
            <div className="flex flex-col">
              {data.r.map((p, i) => {
                // Split full name: last word = surname for display, rest = first
                const nameParts = p.name.split(" ");
                const lastName = nameParts.slice(1).join(" ") || nameParts[0];
                const firstName = nameParts.length > 1 ? nameParts[0] : "";
                return (
                  <div
                    key={i}
                    className="grid items-center border-b border-[var(--md-paper-3)] py-3"
                    style={{ gridTemplateColumns: "48px 1fr 60px 52px 52px" }}
                  >
                    {/* Number badge */}
                    <span
                      className="font-mono flex h-7 w-7 items-center justify-center border border-[var(--md-yellow)] text-[13px] font-bold tabular-nums"
                      style={{
                        color: "var(--md-yellow)",
                        flexShrink: 0,
                      }}
                    >
                      {i + 1}
                    </span>
                    {/* Name */}
                    <div className="min-w-0">
                      <div
                        className="font-archivo truncate leading-tight"
                        style={{
                          fontVariationSettings: '"wdth" 88',
                          fontWeight: 700,
                          fontSize: "clamp(15px, 2vw, 20px)",
                          color: "var(--md-white)",
                          letterSpacing: "-0.005em",
                        }}
                      >
                        {lastName || p.name}
                      </div>
                      <div className="font-mono mt-0.5 truncate text-[10px] text-[var(--md-ink-muted)]">
                        {firstName && `${firstName} · `}{p.t} &rsquo;{String(p.s).slice(2)}
                      </div>
                    </div>
                    {/* Stats — fixed right-aligned lanes */}
                    <span
                      className="font-mono text-right tabular-nums"
                      style={{ fontSize: 14, fontWeight: 700, color: "var(--md-yellow)", flexShrink: 0 }}
                    >
                      {p.pts?.toFixed(1) ?? "—"}
                    </span>
                    <span
                      className="font-mono text-right tabular-nums"
                      style={{ fontSize: 13, color: "var(--md-paper-3)", flexShrink: 0 }}
                    >
                      {p.reb?.toFixed(1) ?? "—"}
                    </span>
                    <span
                      className="font-mono text-right tabular-nums"
                      style={{ fontSize: 13, color: "var(--md-paper-3)", flexShrink: 0 }}
                    >
                      {p.ast?.toFixed(1) ?? "—"}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Team totals row */}
            {data.r.length > 0 && (() => {
              const totPts = data.r.reduce((s, p) => s + (p.pts ?? 0), 0);
              const totReb = data.r.reduce((s, p) => s + (p.reb ?? 0), 0);
              const totAst = data.r.reduce((s, p) => s + (p.ast ?? 0), 0);
              return (
                <div
                  className="mt-2 grid items-center pt-2"
                  style={{ gridTemplateColumns: "48px 1fr 60px 52px 52px" }}
                >
                  <span />
                  <span className="font-cond text-[12px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--md-yellow)" }}>
                    Team / game
                  </span>
                  <span className="font-mono text-right text-[13px] font-bold tabular-nums" style={{ color: "var(--md-yellow)" }}>
                    {totPts.toFixed(1)}
                  </span>
                  <span className="font-mono text-right text-[13px] font-bold tabular-nums" style={{ color: "var(--md-yellow)" }}>
                    {totReb.toFixed(1)}
                  </span>
                  <span className="font-mono text-right text-[13px] font-bold tabular-nums" style={{ color: "var(--md-yellow)" }}>
                    {totAst.toFixed(1)}
                  </span>
                </div>
              );
            })()}
          </div>
        </div>
      ) : (
        /* ── No / invalid share link ── */
        <div className="relative z-10 mx-auto mt-12 w-full max-w-md">
          <div className="md-card md-card--lift flex flex-col gap-4 p-6 text-center">
            <p className="font-mono text-sm text-[var(--md-ink-muted)]">
              This share link is missing or invalid — but you can still build your own
              undefeated season.
            </p>
            <Link href="/" className="md-btn md-btn--lg">
              Build your own season →
            </Link>
          </div>
        </div>
      )}

      <footer className="relative z-10 mt-10 flex flex-col gap-1 border-t border-[var(--md-ink)] pb-5 pt-5 text-[var(--md-ink-muted)] sm:flex-row sm:items-center sm:justify-between">
        <p className="font-byline text-[12px] tracking-[0.02em]">
          Powered by{" "}
          <a
            href={MOTHERDUCK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-[var(--md-ink)]"
          >
            MotherDuck
          </a>{" "}
          · <span className="font-mono">nba_box_scores_v2</span>
        </p>
        <p className="font-byline text-[12px] tracking-[0.02em]">
          An independent project — not affiliated with or endorsed by the NBA.
        </p>
      </footer>
    </main>
  );
}
