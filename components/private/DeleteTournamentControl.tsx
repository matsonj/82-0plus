"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSavedUser } from "@/lib/tournamentSession";

// A quiet, host-only "Delete tournament" affordance. Rendered only when the GET
// payload says the viewer is the admin (you.isAdmin). Deliberately understated —
// an underlined coral text button, not a loud red card. A first click arms an
// inline "Confirm delete?" step (no window.confirm); confirming POSTs to the
// delete route with the saved admin creds and, on success, routes back to the
// private-tournament list. Errors render inline beneath the control.
export function DeleteTournamentControl({
  tournamentId,
}: {
  tournamentId: string;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmDelete = async () => {
    const saved = getSavedUser();
    if (!saved) {
      setError("Sign in as the host to delete this tournament.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/private-tournament/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          adminName: saved.username,
          adminPin: saved.pin,
          tournamentId,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d?.error ?? "Couldn't delete this tournament.");
        setBusy(false);
        return;
      }
      // Replace (the deleted tournament shouldn't sit in history) + refresh to
      // bust the App Router segment cache, so My Teams reloads a fresh private
      // list rather than a stale/empty cached render of /tournament.
      router.replace("/tournament?tab=private");
      router.refresh();
    } catch {
      setError("Couldn't delete this tournament right now. Try again.");
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-1">
      {armed ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={confirmDelete}
            className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-coral)] underline underline-offset-2 disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Confirm delete?"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setArmed(false)}
            className="font-display text-xs uppercase tracking-wide text-[var(--md-ink-muted)] underline underline-offset-2 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setArmed(true)}
          className="font-display text-xs uppercase tracking-wide text-[var(--md-coral)] underline underline-offset-2"
        >
          Delete tournament
        </button>
      )}
      {error && (
        <p className="font-display text-[11px] text-[var(--md-coral)]">{error}</p>
      )}
    </div>
  );
}
