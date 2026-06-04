import { NextRequest } from "next/server";
import { getDecades } from "@/lib/queries";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sessionHint = getSessionHint(req);
  try {
    const decades = await getDecades({ sessionHint: sessionHint.value });
    return jsonWithSessionHint(sessionHint, { decades });
  } catch (err) {
    console.error("[/api/decades]", err);
    return jsonWithSessionHint(
      sessionHint,
      { error: "Couldn't load the league right now." },
      { status: 500 },
    );
  }
}
