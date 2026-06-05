import { NextRequest } from "next/server";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { ensureSchema, queryRW, TDB } from "@/lib/tournamentDb";
import type { BracketResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Brackets aren't secret — this is a read-only, no-PIN endpoint for the public
// share page: GET /api/tournament/bracket?id=<team_id>.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface BracketRow {
  bracket_json: unknown;
  champion_name: string;
}

export async function GET(req: NextRequest) {
  const sessionHint = getSessionHint(req);
  try {
    const id = req.nextUrl.searchParams.get("id") ?? "";
    if (!UUID_RE.test(id)) {
      return jsonWithSessionHint(
        sessionHint,
        { error: "invalid team id" },
        { status: 400 },
      );
    }

    await ensureSchema();

    const rows = await queryRW<BracketRow>(
      `SELECT bracket_json, champion_name
         FROM ${TDB}.teams
        WHERE team_id = $1
        LIMIT 1`,
      [id],
    );
    const row = rows[0];
    if (!row) {
      return jsonWithSessionHint(
        sessionHint,
        { error: "tournament not found" },
        { status: 404 },
      );
    }

    // The pg endpoint returns JSON columns as strings — parse defensively.
    let bracket: BracketResult;
    try {
      bracket =
        typeof row.bracket_json === "string"
          ? (JSON.parse(row.bracket_json) as BracketResult)
          : (row.bracket_json as BracketResult);
    } catch {
      return jsonWithSessionHint(
        sessionHint,
        { error: "tournament not found" },
        { status: 404 },
      );
    }

    return jsonWithSessionHint(sessionHint, { bracket });
  } catch (err) {
    console.error("[/api/tournament/bracket]", err);
    return jsonWithSessionHint(
      sessionHint,
      { error: "Couldn't load that bracket right now." },
      { status: 500 },
    );
  }
}
