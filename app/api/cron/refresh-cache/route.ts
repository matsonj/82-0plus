import { NextRequest, NextResponse } from "next/server";
import { rebuildCache } from "@/lib/appCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The full rebuild materializes the game_quality self-join once (~tens of seconds).
export const maxDuration = 300;

// Daily Vercel cron (see vercel.json) → rebuild the app_cache derived tables from
// the source NBA data. Vercel attaches `Authorization: Bearer <CRON_SECRET>` when
// CRON_SECRET is set; we reject mismatches so the endpoint can't be triggered
// externally. If CRON_SECRET is unset (local/dev), the check is skipped.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    await rebuildCache();
    return NextResponse.json({ ok: true, refreshedAt: new Date().toISOString() });
  } catch (err) {
    console.error("[/api/cron/refresh-cache]", err);
    return NextResponse.json({ error: "rebuild failed" }, { status: 500 });
  }
}
