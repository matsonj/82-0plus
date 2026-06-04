import { NextRequest } from "next/server";
import { getTeamWeights, getPlayableTeams } from "@/lib/queries";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";

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
  const sessionHint = getSessionHint(req);
  const queryOptions = { sessionHint: sessionHint.value };
  try {
    const sp = req.nextUrl.searchParams;
    const decade = Number(sp.get("decade"));
    if (!Number.isInteger(decade) || decade < 1900 || decade > 2100) {
      return jsonWithSessionHint(
        sessionHint,
        { error: "invalid decade" },
        { status: 400 },
      );
    }
    // Teams to exclude (comma-separated): already-drafted teams never repeat,
    // plus the current team on a team-skip re-roll.
    const excludeParam = sp.get("exclude");
    const excludes = new Set(
      excludeParam ? excludeParam.split(",").filter(Boolean) : [],
    );

    // Only offer teams with enough players this decade (≥ MIN_PLAYERS_PER_COMBO),
    // weighted by their season-count.
    const [teamWeights, playable] = await Promise.all([
      getTeamWeights(decade, queryOptions),
      getPlayableTeams(decade, queryOptions),
    ]);
    const teams = teamWeights.filter((t) => playable.has(t.team));
    if (teams.length === 0) {
      return jsonWithSessionHint(
        sessionHint,
        { error: "no teams for decade" },
        { status: 404 },
      );
    }
    let pool = teams;
    if (excludes.size > 0) {
      const filtered = teams.filter((t) => !excludes.has(t.team));
      // Only fall back to the full pool if exclusions would leave nothing
      // (a sparse decade whose teams are all used) — otherwise never repeat.
      if (filtered.length > 0) pool = filtered;
    }
    return jsonWithSessionHint(sessionHint, { team: weightedPick(pool), decade });
  } catch (err) {
    console.error("[/api/slot]", err);
    return jsonWithSessionHint(
      sessionHint,
      { error: "Couldn't roll a team right now." },
      { status: 500 },
    );
  }
}
