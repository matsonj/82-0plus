import { NextResponse } from "next/server";
import { getDecades, warmPlayerIndex } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const decades = await getDecades();
    warmPlayerIndex(); // start the expensive GQ precompute now; first team load awaits it
    return NextResponse.json({ decades });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
