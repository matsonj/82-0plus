"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { GlobalHeader } from "@/components/GlobalHeader";
import { getSavedUser } from "@/lib/tournamentSession";
import { PrivateTournamentLobby } from "@/components/private/PrivateTournamentLobby";
import { PrivateTournamentResult } from "@/components/private/PrivateTournamentResult";
import type {
  PrivateGetResponse,
  PrivateLobbyResponse,
  PrivateCompletedResponse,
} from "@/components/private/types";

type Status = "loading" | "ok" | "error" | "retry";

// The PUBLIC share page for a private tournament. UUID route, no PIN to view.
// Loads GET /api/private-tournament?id=<id> (+ optional saved creds → `you`),
// then composes the Lobby (open) or Result (completed) by status. A retryable
// 503 (lazy finalize in progress) shows a Retry button.
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
      const saved = getSavedUser();
      const qs = new URLSearchParams({ id });
      if (saved) {
        qs.set("name", saved.username);
        qs.set("pin", saved.pin);
      }
      const res = await fetch(`/api/private-tournament?${qs.toString()}`);
      if (res.status === 503) {
        // Lazy finalization still running — the GET is idempotent; let the user retry.
        const d = await res.json().catch(() => ({}));
        if (d?.retryable) {
          setErrorMsg(d?.error ?? "Still finalizing — try again in a moment.");
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
    <main className="relative mx-auto flex min-h-full max-w-3xl flex-col overflow-x-hidden px-4 pb-12 sm:pb-16">
      <div className="md-sunbeam" />
      <GlobalHeader />

      <section className="relative z-10 mt-4">
        {status === "loading" && (
          <div className="py-20 text-center font-display text-sm text-[var(--md-ink-muted)]">
            Loading the tournament…
          </div>
        )}

        {status === "retry" && (
          <div className="md-card md-card--lift mx-auto flex max-w-md flex-col items-center gap-3 p-5 text-center">
            <p className="font-display text-base font-bold">Wrapping up…</p>
            <p className="text-[13px] text-[var(--md-ink-muted)]">{errorMsg}</p>
            <button className="md-btn md-btn--sm md-btn--teal" onClick={() => void load()}>
              ↻ Retry
            </button>
          </div>
        )}

        {status === "error" && (
          <div className="md-card md-card--lift mx-auto max-w-md p-5 text-center">
            <p className="font-display text-base font-bold">
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
    </main>
  );
}
