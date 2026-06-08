import type { Metadata } from "next";
import { decodeShare } from "@/lib/shareCode";
import { DailyShareLanding, type Sharer } from "@/components/DailyShareLanding";

export const dynamic = "force-dynamic";

type Params = Promise<{ date: string }>;
type Search = Promise<{ r?: string }>;

function prettyDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function sharerFrom(r?: string): Sharer | null {
  const data = r ? decodeShare(r) : null;
  if (!data) return null;
  return {
    name: data.u || "A player",
    wins: data.w,
    losses: data.l,
    margin: data.n,
    perfect: data.p,
  };
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}): Promise<Metadata> {
  const { date } = await params;
  const { r } = await searchParams;
  const sharer = sharerFrom(r);
  const day = prettyDate(date);
  const title = sharer
    ? `82-0+ Daily ${day} — ${sharer.name} went ${sharer.wins}–${sharer.losses}. Can you beat it?`
    : `82-0+ Daily Challenge · ${day}`;
  const description =
    "Same five team/era rolls for everyone. Draft the best five and chase 82-0.";
  // The OG image is the redacted result card (record + margin, no roster).
  const ogImage = r ? `/api/og?r=${encodeURIComponent(r)}` : "/api/og";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "82-0+",
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [ogImage] },
  };
}

export default async function DailySharePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { date } = await params;
  const { r } = await searchParams;
  return <DailyShareLanding date={date} sharer={sharerFrom(r)} />;
}
