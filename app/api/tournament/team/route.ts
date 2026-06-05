import { NextRequest } from "next/server";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { ensureSchema } from "@/lib/tournamentDb";
import { getTeamBracket } from "@/lib/tournamentQueries";
import { deriveYou, stripBreakdown } from "@/lib/tournamentRun";
import type { BracketResult, TournamentRunResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEBUG = process.env.NEXT_PUBLIC_DEBUG === "1";

// Public, no-PIN endpoint: a team's bracket isn't secret (the PIN only gates the
// user's list of teams). GET /api/tournament/team?id=<team_id>.
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

    await ensureSchema();

    const row = await getTeamBracket(id);
    if (!row) {
      return jsonWithSessionHint(
        sessionHint,
        { error: "team not found" },
        { status: 404 },
      );
    }

    // getTeamBracket already parses JSON columns, but be defensive in case a
    // string ever comes through.
    let bracket: BracketResult;
    try {
      bracket =
        typeof row.bracketJson === "string"
          ? (JSON.parse(row.bracketJson) as BracketResult)
          : (row.bracketJson as BracketResult);
      if (!bracket || !Array.isArray(bracket.teams)) throw new Error("bad shape");
    } catch {
      return jsonWithSessionHint(
        sessionHint,
        { error: "team not found" },
        { status: 404 },
      );
    }

    const you = deriveYou(bracket, `team:${id}`);
    const out = DEBUG ? bracket : stripBreakdown(bracket);
    return jsonWithSessionHint(
      sessionHint,
      { bracket: out, you, teamId: id } satisfies TournamentRunResponse,
    );
  } catch (err) {
    console.error("[/api/tournament/team]", err);
    return jsonWithSessionHint(
      sessionHint,
      { error: "Couldn't load that team right now." },
      { status: 500 },
    );
  }
}
