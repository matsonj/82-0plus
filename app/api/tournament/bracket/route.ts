import { NextRequest } from "next/server";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { getBracketByIdRO } from "@/lib/tournamentReadQueries";
import { stripBreakdown } from "@/lib/tournamentRun";
import type { BracketResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEBUG = process.env.NEXT_PUBLIC_DEBUG === "1";

// Brackets aren't secret — this is a read-only, no-PIN endpoint for the public
// share page: GET /api/tournament/bracket?id=<team_id>. It reads through the
// read-scaling pool (never the RW pool) and runs no schema DDL.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    const row = await getBracketByIdRO(id, { sessionHint: sessionHint.value });
    if (!row) {
      return jsonWithSessionHint(
        sessionHint,
        { error: "tournament not found" },
        { status: 404 },
      );
    }

    // getBracketByIdRO already parses the JSON column; guard the shape.
    const bracket = row.bracketJson as BracketResult;
    if (!bracket || !Array.isArray(bracket.teams)) {
      return jsonWithSessionHint(
        sessionHint,
        { error: "tournament not found" },
        { status: 404 },
      );
    }

    const out = DEBUG ? bracket : stripBreakdown(bracket);
    return jsonWithSessionHint(sessionHint, { bracket: out });
  } catch (err) {
    console.error("[/api/tournament/bracket]", err);
    return jsonWithSessionHint(
      sessionHint,
      { error: "Couldn't load that bracket right now." },
      { status: 500 },
    );
  }
}
