import { NextRequest } from "next/server";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { isPlayableDailyDate } from "@/lib/dailyDate";
import { computeDailyBoard } from "@/lib/daily";
import { getOfferedIds, hydrateRoster } from "@/lib/queries";
import { simulateRoster } from "@/lib/scoring";
import { authenticate, recordDailyResult } from "@/lib/dailyResults";
import type { SimPick } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Record a signed-in player's daily-challenge completion (one per account per day).
// The result is RECOMPUTED server-side from the submitted picks — the client never
// supplies the record/box/roster, so a stored compare result can't be forged: the
// picks must match that date's deterministic board and be real offered players.
export async function POST(req: NextRequest) {
  const sessionHint = getSessionHint(req);
  const queryOptions = { sessionHint: sessionHint.value };
  try {
    const body = await req.json();
    const date = String(body?.date ?? "").slice(0, 10);
    if (!isPlayableDailyDate(date)) {
      return jsonWithSessionHint(sessionHint, { error: "that daily isn't playable" }, { status: 400 });
    }

    const auth = await authenticate(String(body?.name ?? ""), String(body?.pin ?? ""));
    if (!auth.ok) {
      return jsonWithSessionHint(sessionHint, { error: auth.reason }, { status: 401 });
    }

    // Parse the five reg-season picks.
    const rawPicks = Array.isArray(body?.picks) ? body.picks : [];
    const picks: SimPick[] = rawPicks.map((p: Record<string, unknown>, i: number) => ({
      entity_id: String(p?.entity_id ?? ""),
      team: String(p?.team ?? ""),
      decade: Number(p?.decade),
      slot: Number.isInteger(p?.slot) ? (p.slot as number) : i,
    }));

    // The picks must match THAT date's deterministic board, set-based (each board
    // team/era used once) — the daily analog of a roll receipt.
    const board = await computeDailyBoard(date, queryOptions);
    if (board.slots.length === 0 || picks.length !== board.slots.length) {
      return jsonWithSessionHint(sessionHint, { error: "those picks aren't from that daily challenge" }, { status: 400 });
    }
    const boardKeys = new Set(board.slots.map((s) => `${s.team}|${s.decade}`));
    const pickKeys = picks.map((p) => `${p.team}|${p.decade}`);
    const slotsMatch =
      new Set(pickKeys).size === pickKeys.length && pickKeys.every((k) => boardKeys.has(k));
    if (!slotsMatch) {
      return jsonWithSessionHint(sessionHint, { error: "those picks aren't from that daily challenge" }, { status: 400 });
    }
    // Each pick must be a real top-60 offered player for its (team, decade).
    for (const p of picks) {
      const offered = await getOfferedIds(p.team, p.decade, queryOptions);
      if (!offered.has(p.entity_id)) {
        return jsonWithSessionHint(sessionHint, { error: "that player wasn't in the draft list" }, { status: 400 });
      }
    }

    // Recompute the result authoritatively (server-side stats, never the client's).
    let hydrated;
    try {
      hydrated = await hydrateRoster(picks, queryOptions);
    } catch {
      return jsonWithSessionHint(sessionHint, { error: "unknown pick" }, { status: 400 });
    }
    const result = simulateRoster(hydrated.scoring);
    const tb = result.teamBox;
    const stored = await recordDailyResult({
      userId: auth.userId,
      date,
      wins: result.wins,
      losses: result.losses,
      margin: result.netRating,
      perfect: result.perfect,
      box: {
        pts: tb.pts, reb: tb.reb, ast: tb.ast, stl: tb.stl, blk: tb.blk,
        fgPct: tb.fgPct, ftPct: tb.ftPct, tov: tb.tov, fg3m: tb.fg3m,
      },
      roster: hydrated.lines.map((l) => ({
        team: l.team, season: l.best_season, name: l.player_name,
        pts: l.pts, reb: l.reb, ast: l.ast, gq: l.gq,
      })),
    });
    return jsonWithSessionHint(sessionHint, { result: stored });
  } catch (err) {
    console.error("[/api/daily/complete]", err);
    return jsonWithSessionHint(sessionHint, { error: "Couldn't save that result." }, { status: 500 });
  }
}
