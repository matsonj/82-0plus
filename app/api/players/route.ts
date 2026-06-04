import { NextRequest } from "next/server";
import { getPlayers } from "@/lib/queries";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sessionHint = getSessionHint(req);
  const queryOptions = { sessionHint: sessionHint.value };
  try {
    const sp = req.nextUrl.searchParams;
    const team = sp.get("team");
    const decade = Number(sp.get("decade"));
    const mode = sp.get("mode") === "hoopiq" ? "hoopiq" : "classic";

    if (!team || !/^[A-Z]{3}$/.test(team)) {
      return jsonWithSessionHint(
        sessionHint,
        { error: "invalid team" },
        { status: 400 },
      );
    }
    if (!Number.isInteger(decade) || decade < 1900 || decade > 2100) {
      return jsonWithSessionHint(
        sessionHint,
        { error: "invalid decade" },
        { status: 400 },
      );
    }

    const players = await getPlayers(team, decade, mode, queryOptions);
    return jsonWithSessionHint(sessionHint, { players });
  } catch (err) {
    console.error("[/api/players]", err);
    return jsonWithSessionHint(
      sessionHint,
      { error: "Couldn't load that roster right now." },
      { status: 500 },
    );
  }
}
