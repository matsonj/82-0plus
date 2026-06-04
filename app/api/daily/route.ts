import { NextRequest, NextResponse } from "next/server";
import { getDecades, getPlayableTeams, getTeamWeights } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUNDS = 5;

// Deterministic RNG so everyone gets the same five team+era slots on a given day.
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function weightedPick<T>(items: T[], weights: number[], rng: () => number): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

const todayUtc = () => new Date().toISOString().slice(0, 10);

export async function GET(req: NextRequest) {
  try {
    const date = (req.nextUrl.searchParams.get("date") ?? todayUtc()).slice(0, 10);
    const rng = mulberry32(hashStr(`82-0+:${date}`));

    const decades = await getDecades();
    const playableByDecade = new Map(
      await Promise.all(
        decades.map(
          async (d) => [d, await getPlayableTeams(d)] as [number, Set<string>],
        ),
      ),
    );
    const teamWeightsCache = new Map<number, { team: string; weight: number }[]>();
    const teamWeightsFor = async (d: number) => {
      if (!teamWeightsCache.has(d)) teamWeightsCache.set(d, await getTeamWeights(d));
      return teamWeightsCache.get(d)!;
    };

    const usedTeams = new Set<string>();
    const usage: Record<number, number> = {};
    const slots: { team: string; decade: number }[] = [];

    for (let round = 0; round < ROUNDS; round++) {
      // Decades that still have an un-used, playable team — drafted teams never repeat.
      const candidates = decades.filter((d) =>
        [...playableByDecade.get(d)!].some((t) => !usedTeams.has(t)),
      );
      if (candidates.length === 0) break;
      // Used decades decay 30% per use.
      const decade = weightedPick(
        candidates,
        candidates.map((d) => Math.pow(0.7, usage[d] ?? 0)),
        rng,
      );

      const playable = playableByDecade.get(decade)!;
      // Sort deterministically (DB tie order isn't stable) so the seed reproduces.
      const pool = (await teamWeightsFor(decade))
        .filter((t) => playable.has(t.team) && !usedTeams.has(t.team))
        .sort((a, b) => b.weight - a.weight || a.team.localeCompare(b.team));
      const team = weightedPick(
        pool.map((t) => t.team),
        pool.map((t) => t.weight),
        rng,
      );

      usedTeams.add(team);
      usage[decade] = (usage[decade] ?? 0) + 1;
      slots.push({ team, decade });
    }

    return NextResponse.json({ date, slots });
  } catch (err) {
    console.error("[/api/daily]", err);
    return NextResponse.json(
      { error: "Couldn't load today's challenge." },
      { status: 500 },
    );
  }
}
