import { NextRequest } from "next/server";
import { getTeamWeights, getPlayableTeams } from "@/lib/queries";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { signRoll } from "@/lib/tournamentToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Largest exclude set a real draft ever sends: 5 already-drafted teams plus the
// current team on a team-skip re-roll. Anything beyond this is pool-shaping.
const MAX_EXCLUDES = 6;

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
    // plus the current team on a team-skip re-roll. Capped at the legitimate
    // maximum (5 drafted + 1 team-skip) so a caller can't shape the pool down
    // to a single chosen team and mint a deterministic receipt for it.
    const excludeParam = sp.get("exclude");
    const excludes = new Set(
      excludeParam ? excludeParam.split(",").filter(Boolean) : [],
    );
    if (excludes.size > MAX_EXCLUDES) {
      return jsonWithSessionHint(
        sessionHint,
        { error: "too many exclusions" },
        { status: 400 },
      );
    }

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
      // Only narrow the pool when ≥2 candidates remain. This keeps the roll
      // non-deterministic: a caller can never exclude down to a single team and
      // force the result. If exclusions would leave fewer than two (a sparse
      // decade whose teams are nearly all used), fall back to the full weighted
      // pool rather than handing the caller a guaranteed pick.
      if (filtered.length >= 2) pool = filtered;
    }
    const team = weightedPick(pool);
    // Signed receipt: proof the server randomly rolled this team, redeemable when
    // entering the tournament. Bound to the team only (the decade-skip keeps it).
    return jsonWithSessionHint(sessionHint, {
      team,
      decade,
      receipt: signRoll(team),
    });
  } catch (err) {
    console.error("[/api/slot]", err);
    return jsonWithSessionHint(
      sessionHint,
      { error: "Couldn't roll a team right now." },
      { status: 500 },
    );
  }
}
