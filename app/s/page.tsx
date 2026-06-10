import type { Metadata } from "next";
import Link from "next/link";
import { decodeShare } from "@/lib/shareCode";
import { SITE_URL } from "@/lib/site";
import { GlobalHeader } from "@/components/GlobalHeader";

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
      title: "82-0+ · Build an undefeated season",
      description: "Draft a 5-man roster across the decades and see if it can go 82-0.",
    };
  }

  const sign = data.n >= 0 ? "+" : "";
  const title = data.p
    ? `82-0+ 🏆 ${data.w}–${data.l} — a PERFECT season!`
    : `82-0+ 🏀 ${data.w}–${data.l} (${sign}${data.n.toFixed(1)} net)`;
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
      siteName: "82-0+",
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

  const sign = data && data.n >= 0 ? "+" : "";

  return (
    <main className="relative mx-auto flex min-h-full max-w-xl flex-col px-4 pb-12 text-center">
      <div className="md-sunbeam" />
      <GlobalHeader />

      <div className="md-card md-card--lift relative z-10 mt-8 flex w-full flex-col gap-4 p-6">
        {data ? (
          <>
            <div className="text-center">
              {data.p ? (
                <div className="md-capsule md-capsule--teal mb-2">🏆 Perfect Season</div>
              ) : (
                <div className="md-capsule mb-2">{data.m}</div>
              )}
              <div
                className="font-display font-bold"
                style={{ fontSize: "clamp(46px, 13vw, 64px)", lineHeight: 1 }}
              >
                {data.w}&ndash;{data.l}
              </div>
              <div className="mt-1 font-display text-sm text-[var(--md-ink-muted)]">
                <span
                  style={{
                    color: data.n >= 0 ? "var(--md-teal)" : "var(--md-coral)",
                  }}
                >
                  {sign}
                  {data.n.toFixed(1)} net
                </span>
              </div>
            </div>

            <div className="grid gap-1">
              <div className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
                The roster
              </div>
              {data.r.map((p, i) => (
                <div
                  key={i}
                  className="flex items-baseline justify-between gap-2 border-b border-[var(--md-paper-3)] py-0.5 font-display text-sm"
                >
                  <span>
                    <span className="text-[var(--md-orange-deep)]">{p.t}</span> &rsquo;
                    {String(p.s).slice(2)} · {p.name}
                  </span>
                  <span className="text-[var(--md-ink-muted)]">
                    {p.pts}/{p.reb}/{p.ast}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="font-display text-sm text-[var(--md-ink-muted)]">
            This share link is missing or invalid — but you can still build your own
            undefeated season.
          </p>
        )}

        <Link href="/" className="md-btn md-btn--lg md-btn--teal">
          Build your own season
        </Link>
      </div>
    </main>
  );
}
