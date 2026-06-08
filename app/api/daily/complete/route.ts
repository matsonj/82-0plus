import { NextRequest } from "next/server";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { isPlayableDailyDate } from "@/lib/dailyDate";
import {
  authenticate,
  recordDailyResult,
  type DailyBox,
  type DailyRosterLine,
} from "@/lib/dailyResults";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

// Record a signed-in player's daily-challenge completion (one per account per day).
export async function POST(req: NextRequest) {
  const sessionHint = getSessionHint(req);
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

    const b = body?.box ?? {};
    const box: DailyBox = {
      pts: num(b.pts), reb: num(b.reb), ast: num(b.ast), stl: num(b.stl), blk: num(b.blk),
      fgPct: num(b.fgPct), ftPct: num(b.ftPct), tov: num(b.tov), fg3m: num(b.fg3m),
    };
    const roster: DailyRosterLine[] = Array.isArray(body?.roster)
      ? body.roster.slice(0, 5).map((r: Record<string, unknown>) => ({
          team: String(r?.team ?? ""),
          season: num(r?.season),
          name: String(r?.name ?? ""),
          pts: num(r?.pts), reb: num(r?.reb), ast: num(r?.ast), gq: num(r?.gq),
        }))
      : [];

    const result = await recordDailyResult({
      userId: auth.userId,
      date,
      wins: num(body?.wins),
      losses: num(body?.losses),
      margin: num(body?.margin),
      perfect: !!body?.perfect,
      box,
      roster,
    });
    return jsonWithSessionHint(sessionHint, { result });
  } catch (err) {
    console.error("[/api/daily/complete]", err);
    return jsonWithSessionHint(sessionHint, { error: "Couldn't save that result." }, { status: 500 });
  }
}
