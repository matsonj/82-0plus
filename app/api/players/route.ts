import { NextRequest, NextResponse } from "next/server";
import { getPlayers } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const team = sp.get("team");
    const decade = Number(sp.get("decade"));
    const mode = sp.get("mode") === "hoopiq" ? "hoopiq" : "classic";

    if (!team || !/^[A-Z]{3}$/.test(team)) {
      return NextResponse.json({ error: "invalid team" }, { status: 400 });
    }
    if (!Number.isInteger(decade) || decade < 1900 || decade > 2100) {
      return NextResponse.json({ error: "invalid decade" }, { status: 400 });
    }

    const players = await getPlayers(team, decade, mode);
    return NextResponse.json({ players });
  } catch (err) {
    console.error("[/api/players]", err);
    return NextResponse.json(
      { error: "Couldn't load that roster right now." },
      { status: 500 },
    );
  }
}
