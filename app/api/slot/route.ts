import { NextRequest, NextResponse } from "next/server";
import { getTeamWeights, getPlayerIndex } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Pick a team at random, weighted by its season-count in the decade. This is
 * accurate by design: short-lived / defunct teams (Sonics, Vancouver) are rare
 * now and will naturally show up more as historical seasons are backfilled.
 */
function weightedPick(items: { team: string; weight: number }[]): string {
  const total = items.reduce((acc, i) => acc + i.weight, 0);
  let r = Math.random() * total;
  for (const i of items) {
    r -= i.weight;
    if (r <= 0) return i.team;
  }
  return items[items.length - 1].team;
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const decade = Number(sp.get("decade"));
    if (!Number.isInteger(decade) || decade < 1900 || decade > 2100) {
      return NextResponse.json({ error: "invalid decade" }, { status: 400 });
    }
    const exclude = sp.get("exclude"); // avoid this team on a team-skip re-roll

    // Only offer teams that actually have draftable players this decade. The slot
    // pool (any team with games) and the player index (≥20 qualifying games per
    // season) use different filters, so a sparse team — e.g. CIN in the 1950s —
    // could be offered with nobody to draft. Intersect the two.
    const [teamWeights, index] = await Promise.all([
      getTeamWeights(decade),
      getPlayerIndex(),
    ]);
    const playable = new Set(
      index.filter((p) => p.decade === decade).map((p) => p.team),
    );
    const teams = teamWeights.filter((t) => playable.has(t.team));
    if (teams.length === 0) {
      return NextResponse.json(
        { error: "no teams for decade" },
        { status: 404 },
      );
    }
    let pool = teams;
    if (exclude) {
      const filtered = teams.filter((t) => t.team !== exclude);
      if (filtered.length > 0) pool = filtered;
    }
    return NextResponse.json({ team: weightedPick(pool), decade });
  } catch (err) {
    console.error("[/api/slot]", err);
    return NextResponse.json(
      { error: "Couldn't roll a team right now." },
      { status: 500 },
    );
  }
}
