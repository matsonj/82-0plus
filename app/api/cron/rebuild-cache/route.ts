import { NextRequest, NextResponse } from "next/server";
import { refreshCacheIfStale } from "@/lib/appCache";

// Daily cache-rebuild cron — the ONLY thing that wakes the MotherDuck duckling now.
// It recomputes the heavy analytics on MotherDuck (the game_quality self-join +
// aggregations) ONLY when the NBA source changed or the cache aged out, then pushes
// the three small derived tables into the Postgres serving cache that every request
// reads. Between runs the duckling sleeps — which is the whole point: MotherDuck
// bills wall-clock awake time, and the old per-request reads kept it awake ~24/7.
//
// Scheduled via vercel.json `crons`. Vercel attaches `Authorization: Bearer
// $CRON_SECRET` to the invocation when CRON_SECRET is set in the project env; we
// require it so the (side-effecting) endpoint can't be triggered by the public.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A full rebuild (game_quality snapshot + aggregations + push) is ~tens of seconds;
// allow generous headroom (platform ceiling is 300s).
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  try {
    const started = Date.now();
    const result = await refreshCacheIfStale();
    return NextResponse.json({
      ok: true,
      ...result,
      elapsedMs: Date.now() - started,
    });
  } catch (err) {
    console.error("[cron/rebuild-cache]", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}
