"use client";

import { useEffect, useState } from "react";
import { getSavedUser, saveUser } from "@/lib/tournamentSession";
import {
  validateName,
  validatePin,
  NAME_MAX_LEN,
} from "@/lib/tournamentValidation";
import { privateModeLabel } from "@/lib/privateTournament";
import { copyText } from "@/lib/copyText";
import { SITE_URL } from "@/lib/site";
import { PrivateTournamentDraft } from "@/components/private/PrivateTournamentDraft";
import { DeleteTournamentControl } from "@/components/private/DeleteTournamentControl";
import type {
  PrivateLobbyResponse,
  PrivateRegisterResponse,
} from "@/components/private/types";

// Countdown to a fixed ISO instant (the tournament's expires_at). Mirrors the
// daily Countdown's tick style but targets an arbitrary timestamp.
function ExpiryCountdown({ expiresAt }: { expiresAt: string }) {
  const [left, setLeft] = useState("");
  useEffect(() => {
    const target = Date.parse(expiresAt);
    const tick = () => {
      const ms = Math.max(0, target - Date.now());
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const s = Math.floor((ms % 60_000) / 1000);
      const pad = (n: number) => String(n).padStart(2, "0");
      setLeft(`${pad(h)}:${pad(m)}:${pad(s)}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return <span className="tabular-nums">{left}</span>;
}

export function PrivateTournamentLobby({
  data,
  onRefresh,
}: {
  data: PrivateLobbyResponse;
  // Re-fetch the GET (after a submit or to update the lobby count).
  onRefresh: () => void;
}) {
  // Saved-account-aware creds (used to register + draft).
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [hasSaved, setHasSaved] = useState(false);

  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The active draft session (entry + board), once registered.
  const [session, setSession] = useState<PrivateRegisterResponse | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    const saved = getSavedUser();
    if (saved) {
      setName(saved.username);
      setPin(saved.pin);
      setHasSaved(true);
    }
  }, []);

  const you = data.you;
  // Is the viewer the admin? The admin's account handle equals the tournament
  // name (one field server-side); match the saved/typed name against it.
  const isAdmin =
    hasSaved && validateName(name).ok &&
    name.trim().toUpperCase() === data.adminName.toUpperCase();
  // Entrant mid-draft (registered/partial) → "Continue draft".
  const midDraft = you && (you.status === "registered" || you.status === "partial");
  const submitted = you && you.status === "submitted";

  const fullShare = `${SITE_URL}/p/${data.tournamentId}`;

  const nameOk = validateName(name).ok;
  const pinOk = validatePin(pin);

  // Register (idempotent server-side) then drop into the draft.
  const startDraft = async () => {
    if (!nameOk || !pinOk) {
      setError("Enter a name and PIN to draft.");
      return;
    }
    setRegistering(true);
    setError(null);
    try {
      const res = await fetch("/api/private-tournament/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, pin, tournamentId: data.tournamentId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d?.error ?? "Couldn't register for this tournament.");
        return;
      }
      const reg = (await res.json()) as PrivateRegisterResponse;
      saveUser({ username: name, pin });
      setHasSaved(true);
      setSession(reg);
    } catch {
      setError("Couldn't register right now. Try again.");
    } finally {
      setRegistering(false);
    }
  };

  // ---- Active draft. ----
  if (session) {
    return (
      <PrivateTournamentDraft
        tournamentId={data.tournamentId}
        entryId={session.entryId}
        board={session.board}
        mode={session.mode}
        name={name}
        pin={pin}
        onComplete={() => {
          setSession(null);
          onRefresh();
        }}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      {/* Header card. */}
      <div className="md-card md-card--lift flex flex-col gap-3 p-5">
        <div className="text-center">
          <div className="md-capsule mb-2">🏀 Private tournament</div>
          <div className="font-display text-3xl font-bold break-words">
            {data.name}
          </div>
          <div className="mt-1 font-display text-xs uppercase tracking-wide text-[var(--md-ink-muted)]">
            Hosted by {data.adminName}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <span
            className="md-capsule"
            style={
              data.mode === "hoopiq"
                ? { background: "var(--md-ink)", color: "var(--md-white)" }
                : undefined
            }
          >
            {privateModeLabel(data.mode)}
          </span>
          <span className="md-capsule">{data.size} teams</span>
          <span className="md-capsule md-capsule--sky">
            {data.submitted} submitted
          </span>
        </div>

        <div className="text-center font-display text-[13px] text-[var(--md-ink-muted)]">
          Entry window closes in <ExpiryCountdown expiresAt={data.expiresAt} />
        </div>
      </div>

      {/* Your status (submitted) or the draft CTA. */}
      {submitted ? (
        <div className="md-card flex flex-col items-center gap-2 p-4 text-center">
          <div className="md-capsule md-capsule--teal">Your team is in</div>
          {you?.regW != null && you?.regL != null && (
            <div className="font-display text-sm text-[var(--md-ink-muted)]">
              Regular season: {you.regW}–{you.regL}
              {you.seedNet != null && (
                <>
                  {" · "}
                  <span
                    style={{
                      color: you.seedNet >= 0 ? "var(--md-teal)" : "var(--md-coral)",
                    }}
                  >
                    {you.seedNet >= 0 ? "+" : "−"}
                    {Math.abs(you.seedNet).toFixed(1)} net
                  </span>
                </>
              )}
            </div>
          )}
          {you?.provisionalRecordW != null && you?.provisionalRecordL != null && (
            <div className="font-display text-sm text-[var(--md-ink-muted)]">
              Provisional bracket: {you.provisionalRecordW}–{you.provisionalRecordL}
              {you.provisionalStatus ? ` · ${you.provisionalStatus}` : ""}
            </div>
          )}
          <p className="font-display text-[13px] text-[var(--md-ink-muted)]">
            Final results post once every slot is in (or the window closes).
          </p>
        </div>
      ) : (
        <div className="md-card flex flex-col gap-3 p-4">
          {/* Creds: shown only when not logged in. */}
          {!hasSaved && (
            <>
              <label className="flex flex-col gap-1">
                <span className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
                  Your name
                </span>
                <input
                  className="md-input md-input--name"
                  value={name}
                  maxLength={NAME_MAX_LEN}
                  autoCapitalize="characters"
                  onChange={(e) =>
                    setName(e.target.value.toUpperCase().replace(/[^A-Z0-9 ]/g, ""))
                  }
                  placeholder="PHILJACKSON"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
                  PIN
                </span>
                <input
                  className="md-input"
                  value={pin}
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="4–6 digits"
                />
              </label>
            </>
          )}
          {hasSaved && (
            <div className="font-display text-[13px]">
              Playing as{" "}
              <strong className="text-[var(--md-orange-deep)]">{name}</strong>
            </div>
          )}

          {error && (
            <div className="border-2 border-[var(--md-coral)] bg-[var(--md-white)] p-2 font-display text-sm text-[var(--md-coral)]">
              {error}
            </div>
          )}

          <button
            className="md-btn md-btn--lg md-btn--teal"
            disabled={registering}
            onClick={startDraft}
          >
            {registering
              ? "Starting…"
              : midDraft
                ? "Continue draft"
                : isAdmin
                  ? "Start tournament"
                  : "Register & draft"}
          </button>
        </div>
      )}

      {/* Share link. */}
      <div className="md-card flex flex-col gap-1 p-4">
        <span className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
          Invite link
        </span>
        <div className="flex items-stretch gap-2">
          <input
            readOnly
            value={fullShare}
            className="md-input flex-1 text-[13px]"
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            type="button"
            className="md-btn md-btn--sm md-btn--secondary"
            onClick={async () => {
              if (await copyText(fullShare)) {
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 1500);
              }
            }}
          >
            {linkCopied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      {/* Lobby roster (names + status only — no rosters before completion). */}
      <div className="md-card flex flex-col gap-2 p-4">
        <span className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
          Entrants ({data.filled}/{data.size})
        </span>
        {data.entries.length === 0 ? (
          <p className="font-display text-[13px] text-[var(--md-ink-muted)]">
            No one&rsquo;s joined yet. Be the first.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-[var(--md-paper-3)]">
            {data.entries.map((e, i) => (
              <div
                key={`${e.userName}-${i}`}
                className="flex items-center justify-between gap-2 py-1.5"
              >
                <span className="font-display text-sm font-bold">
                  {e.teamName ?? e.userName}
                </span>
                <span className="font-display text-[10px] uppercase tracking-wide text-[var(--md-ink-muted)]">
                  {e.status === "submitted"
                    ? "✓ submitted"
                    : e.status === "partial"
                      ? "drafting"
                      : "joined"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Host-only teardown — quiet, confirm-gated. */}
      {you?.isAdmin && (
        <div className="mt-1 flex justify-center">
          <DeleteTournamentControl tournamentId={data.tournamentId} />
        </div>
      )}
    </div>
  );
}
