import { NextResponse } from "next/server";
import { getDecades } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const decades = await getDecades();
    return NextResponse.json({ decades });
  } catch (err) {
    console.error("[/api/decades]", err);
    return NextResponse.json(
      { error: "Couldn't load the league right now." },
      { status: 500 },
    );
  }
}
