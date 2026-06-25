"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/layout/PageShell";
import { getSavedUser } from "@/lib/tournamentSession";
import { PrivateTournamentLobby } from "@/components/private/PrivateTournamentLobby";
import { PrivateTournamentResult } from "@/components/private/PrivateTournamentResult";
import type {
  PrivateGetResponse,
  PrivateLobbyResponse,
  PrivateCompletedResponse,
  PrivateYou,
} from "@/components/private/types";

type Status = "loading" | "ok" | "error" | "retry";

// The PUBLIC share page for a private tournament. UUID route, no PIN to view.
// Loads the shared view via GET /api/private-tournament?id=<id> (CREDENTIAL-FREE
// — no PIN ever in the URL), then, if a saved account exists, POSTs creds in the
// BODY to /api/private-tournament for the entrant-specific `you` (entry status,
// standing, host control) and merges it in. Composes the Lobby (open) or Result
// (completed) by status. A retryable 503 (lazy finalize in progress) shows Retry.
export default function PrivateTournamentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<PrivateGetResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    setErrorMsg(null);
    try {
      // 1) Shared view — credential-free GET. Never put the PIN in the URL.
      const res = await fetch(`/api/private-tournament?id=${encodeURIComponent(id)}`);
      if (res.status === 503) {
        // Lazy finalization still running — the GET is idempotent; let the user retry.
        const d = await res.json().catch(() => ({}));
        if (d?.retryable) {
          setErrorMsg(d?.error ?? "Still finalizing. Try again in a moment.");
          setStatus("retry");
          return;
        }
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErrorMsg(d?.error ?? "Couldn't load that tournament.");
        setStatus("error");
        return;
      }
      const json = (await res.json()) as PrivateGetResponse;
      // The credential-free GET omits `you`; default it so components see null.
      json.you = null;

      // 2) Entrant-specific `you` — creds in the POST BODY (never the URL). Only
      // when a saved account exists; failures are non-fatal (shared view stands).
      const saved = getSavedUser();
      if (saved) {
        try {
          const meRes = await fetch("/api/private-tournament", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              tournamentId: id,
              name: saved.username,
              pin: saved.pin,
            }),
          });
          if (meRes.ok) {
            const me = (await meRes.json()) as { you?: PrivateYou | null };
            json.you = me?.you ?? null;
          }
        } catch {
          /* leave the shared view's you as-is (null) */
        }
      }

      setData(json);
      setStatus("ok");
    } catch {
      setErrorMsg("Couldn't load that tournament right now.");
      setStatus("error");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PageShell
      width="wide"
      paddingClassName="px-4 pb-12 sm:px-6 sm:pb-16"
      footer={false}
    >
      <section className="relative z-10">
        {status === "loading" && (
          <div className="py-20 text-center font-cond text-sm uppercase tracking-widest text-[var(--md-ink-muted)]">
            Loading the tournament…
          </div>
        )}

        {status === "retry" && (
          <div
            className="mx-auto flex max-w-md flex-col items-center gap-3 border-2 border-[var(--md-ink)] bg-[var(--md-white)] p-5 text-center"
            style={{ boxShadow: "var(--md-shadow-md)" }}
          >
            <p className="font-cond text-base font-semibold uppercase tracking-wide">
              Wrapping up…
            </p>
            <p className="font-display text-[13px] text-[var(--md-ink-muted)]">{errorMsg}</p>
            <button className="md-btn md-btn--sm" onClick={() => void load()}>
              ↻ Retry
            </button>
          </div>
        )}

        {status === "error" && (
          <div
            className="mx-auto max-w-md border-2 border-[var(--md-ink)] bg-[var(--md-white)] p-5 text-center"
            style={{ boxShadow: "var(--md-shadow-md)" }}
          >
            <p className="font-cond text-base font-semibold uppercase tracking-wide">
              {errorMsg ?? "Tournament not found."}
            </p>
            <Link
              href="/tournament"
              className="md-btn md-btn--sm md-btn--secondary mt-4 inline-flex"
            >
              My teams
            </Link>
          </div>
        )}

        {status === "ok" && data?.status === "open" && (
          <PrivateTournamentLobby
            data={data as PrivateLobbyResponse}
            onRefresh={() => void load()}
          />
        )}

        {status === "ok" && data?.status === "completed" && (
          <PrivateTournamentResult data={data as PrivateCompletedResponse} />
        )}
      </section>
    </PageShell>
  );
}
