import { NextRequest } from "next/server";
import { getSessionHint, jsonWithSessionHint } from "@/lib/sessionHint";
import { requireAuth } from "@/lib/apiAuth";
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
    const auth = await requireAuth(req, sessionHint, body?.name, body?.pin);
    if (!auth.ok) return auth.response;
    const notif = await getPrivateNotifications(auth.userId);
    return jsonWithSessionHint(sessionHint, notif);
  } catch (err) {
    console.error("[/api/private-tournament/notifications]", err);
    return jsonWithSessionHint(sessionHint, { error: "Couldn't load notifications right now." }, { status: 500 });
  }
}
