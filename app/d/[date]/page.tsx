import type { Metadata } from "next";
import { encodeShare } from "@/lib/shareCode";
import { verifyDailyShare } from "@/lib/dailyShareToken";
import { DailyShareLanding, type Sharer } from "@/components/DailyShareLanding";

export const dynamic = "force-dynamic";

type Params = Promise<{ date: string }>;
type Search = Promise<{ s?: string }>;

function prettyDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// The sharer's record comes ONLY from a server-signed token — an unsigned/edited
// link yields no sharer (so the head-to-head numbers can't be forged). The token
// must also be bound to the date being viewed: a valid token for a DIFFERENT
// daily is rejected, so a real result can't be re-pinned onto another day's board.
function sharerFrom(s: string | undefined, routeDate: string): Sharer | null {
  const v = s ? verifyDailyShare(s, routeDate) : null;
  if (!v) return null;
  return { name: v.u || "A player", wins: v.w, losses: v.l, margin: v.n, perfect: v.p };
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}): Promise<Metadata> {
  const { date } = await params;
  const { s } = await searchParams;
  const sharer = sharerFrom(s, date);
  const day = prettyDate(date);
  const title = sharer
    ? `82-0+ Daily ${day} — ${sharer.name} went ${sharer.wins}–${sharer.losses}. Can you beat it?`
    : `82-0+ Daily Challenge · ${day}`;
  const description =
    "Same five team/era rolls for everyone. Draft the best five and chase 82-0.";
  // OG = redacted card (record + margin, no roster), built from the VERIFIED
  // sharer only — never from raw query input.
  const ogImage = sharer
    ? `/api/og?r=${encodeURIComponent(
        encodeShare({
          w: sharer.wins, l: sharer.losses, n: sharer.margin, p: sharer.perfect,
          m: `Daily ${date}`, r: [], u: sharer.name,
        }),
      )}`
    : "/api/og";

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
  const { s } = await searchParams;
  return <DailyShareLanding date={date} sharer={sharerFrom(s, date)} />;
}
