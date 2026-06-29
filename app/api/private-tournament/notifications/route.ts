import { NextRequest } from "next/server";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { authenticate } from "@/lib/dailyResults";
import { getPrivateNotifications } from "@/lib/privateNotifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/private-tournament/notifications — the menu badge feed for a signed-in
// account. Body: { name, pin }. Authenticate, then return the shared
// getPrivateNotifications() feed ({ pending, completedUnviewed, any }). The home
// page gets the same feed via POST /api/home/bootstrap (one auth for both); this
// route stays for the header's standalone polling on non-home pages.
export async function POST(req: NextRequest) {
  const sessionHint = getSessionHint(req);
  try {
    const body = await req.json();
    const auth = await authenticate(String(body?.name ?? ""), String(body?.pin ?? ""));
    if (!auth.ok) {
      return jsonWithSessionHint(sessionHint, { error: auth.reason }, { status: 401 });
    }
    const notif = await getPrivateNotifications(auth.userId);
    return jsonWithSessionHint(sessionHint, notif);
  } catch (err) {
    console.error("[/api/private-tournament/notifications]", err);
    return jsonWithSessionHint(sessionHint, { error: "Couldn't load notifications right now." }, { status: 500 });
  }
}
