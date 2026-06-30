"use client";

import { useEffect, useState } from "react";
import { getSavedUser, saveUser } from "@/lib/tournamentSession";
import {
  validateName,
  validatePin,
  NAME_MAX_LEN,
} from "@/lib/tournamentValidation";
import { privateModeLabel } from "@/lib/privateTournament";
import { SITE_URL } from "@/lib/site";
import { PrivateTournamentDraft } from "@/components/private/PrivateTournamentDraft";
import { DeleteTournamentControl } from "@/components/private/DeleteTournamentControl";
import { Button, Capsule, CopyLinkField, NameField, Notice, PinField } from "@/components/ui";
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

  // ---- Active draft. ---- Full width so LineupDraftBoard's desktop two-column
  // layout (left flex 1.6 + right roster) has room, same as the daily game. The
  // old max-w-lg cap crushed it into one 512px column → the player list clipped.
  if (session) {
    return (
      <div className="w-full">
        <PrivateTournamentDraft
          tournamentId={data.tournamentId}
          entryId={session.entryId}
          board={session.board}
          mode={session.mode}
          name={name}
          pin={pin}
          rosters={session.rosters}
          onComplete={() => {
            setSession(null);
            onRefresh();
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Page header — SLAM kicker + big title + meta */}
      <div className="flex flex-col gap-2">
        {/* PRIVATE TOURNAMENT cobalt kicker */}
        <div>
          <Capsule tone="cobalt" className="inline-flex text-[11px]">
            Private Tournament
          </Capsule>
        </div>
        <h1
          className="font-cover leading-none text-[var(--md-ink)]"
          style={{ fontSize: "clamp(28px, 5vw, 56px)", textTransform: "uppercase" }}
        >
          {data.name}
        </h1>
        <div className="font-byline text-[11px] uppercase tracking-[0.1em] text-[var(--md-ink-muted)]">
          Hosted by {data.adminName} · {data.size}-Team · Single Elim · {privateModeLabel(data.mode)}
        </div>
      </div>

      {/* Status bar: OPEN badge + count + countdown */}
      <div
        className="flex flex-wrap items-center gap-3 border-2 border-[var(--md-ink)] bg-[var(--md-ink)] px-4 py-3"
        style={{ boxShadow: "var(--md-shadow-sm)" }}
      >
        <span
          className="font-cond text-[13px] font-bold uppercase tracking-[0.1em]"
          style={{ background: "var(--md-yellow)", color: "var(--md-ink)", padding: "2px 8px" }}
        >
          Open
        </span>
        <span className="font-cond text-[14px] font-semibold uppercase tracking-wide text-[var(--md-paper)]">
          {data.filled} of {data.size} Entered
        </span>
        <span className="font-cond text-[14px] font-semibold uppercase tracking-wide text-[var(--md-coral)]">
          · Locks in <ExpiryCountdown expiresAt={data.expiresAt} />
        </span>
      </div>

      {/* Main body: two-column on desktop (entrants table left, invite card right) */}
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
        {/* LEFT: entrants table */}
        <div className="min-w-0 flex-1">
          {/* Table header */}
          <div className="flex items-baseline justify-between border-b-2 border-[var(--md-ink)] pb-2">
            <span className="font-cond text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--md-ink)]">
              Entrants
            </span>
            <span className="font-mono text-[11px] text-[var(--md-ink-muted)]">
              {data.filled} / {data.size}
            </span>
          </div>
          {/* Column headers — no Record yet: the lobby is pre-bracket, so entrants
              have no playoff record until the field finalizes. Columns must match
              the data rows below (#, Player, Status). */}
          <div
            className="grid font-cond text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--md-ink-muted)]"
            style={{ gridTemplateColumns: "32px 1fr 80px", borderBottom: "1px solid var(--md-paper-3)", paddingBottom: 4, paddingTop: 6 }}
          >
            <span className="pl-1">#</span>
            <span>Player</span>
            <span className="text-right pr-1">Status</span>
          </div>

          {data.entries.length === 0 ? (
            <p className="mt-4 font-display text-[13px] text-[var(--md-ink-muted)]">
              No one&rsquo;s joined yet. Be the first.
            </p>
          ) : (
            <div className="flex flex-col">
              {data.entries.map((e, i) => {
                const isHost = e.userName.toUpperCase() === data.adminName.toUpperCase();
                // Match the viewer's name (from saved creds) against entry userName.
                const isMine = hasSaved && name.trim().toUpperCase() === e.userName.toUpperCase();
                const isWaiting = e.status !== "submitted" && e.status !== "partial" && e.status !== "registered";
                return (
                  <div
                    key={`${e.userName}-${i}`}
                    className="grid items-center border-b border-[var(--md-paper-3)]"
                    style={{
                      gridTemplateColumns: "32px 1fr 80px",
                      paddingTop: 9,
                      paddingBottom: 9,
                      background: isMine ? "var(--md-yellow)" : undefined,
                    }}
                  >
                    <span className="pl-1 font-mono text-[12px] tabular-nums text-[var(--md-ink-muted)]">
                      {i + 1}
                    </span>
                    <span
                      className="min-w-0 truncate font-archivo"
                      style={{
                        fontSize: 14,
                        fontWeight: 800,
                        fontVariationSettings: '"wdth" 100',
                        color: isWaiting ? "var(--md-ink-muted)" : "var(--md-ink)",
                        fontStyle: isWaiting ? "italic" : undefined,
                      }}
                    >
                      {e.teamName ?? e.userName}
                      {isHost && (
                        <span
                          className="ml-2 font-cond text-[9px] font-semibold uppercase tracking-wide"
                          style={{ background: "var(--md-cobalt)", color: "var(--md-white)", padding: "1px 5px" }}
                        >
                          Host
                        </span>
                      )}
                      {isMine && (
                        <span
                          className="ml-2 font-cond text-[9px] font-semibold uppercase tracking-wide"
                          style={{ background: "var(--md-coral)", color: "var(--md-white)", padding: "1px 5px" }}
                        >
                          You
                        </span>
                      )}
                    </span>
                    <span className="pr-1 text-right font-mono text-[10px] uppercase tracking-wide">
                      {isWaiting ? (
                        <span className="text-[var(--md-ink-muted)]">Waiting…</span>
                      ) : (
                        <span style={{ color: "var(--md-teal)" }}>
                          {e.status === "submitted" ? "■ Locked In" : e.status === "partial" ? "Drafting" : "Joined"}
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Bracket note */}
          <p className="mt-4 flex items-start gap-2 font-display text-[12px] text-[var(--md-ink-muted)]">
            <span className="mt-0.5 shrink-0 text-[10px]">{"{}"}</span>
            <span>The bracket is drawn once all {data.size} entrants lock in their rosters or when the clock runs out, whichever comes first.</span>
          </p>

          {/* Draft / status CTA — shown below table on mobile, above invite on desktop */}
          <div className="mt-4">
            {submitted ? (
              <div className="flex flex-col gap-2 border-2 border-[var(--md-ink)] bg-[var(--md-white)] p-4">
                <div className="flex items-center gap-2">
                  <Capsule tone="teal" className="text-[10px]">Your team is in</Capsule>
                </div>
                {you?.regW != null && you?.regL != null && (
                  <div className="font-mono text-[13px] text-[var(--md-ink-muted)] tabular-nums">
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
                  <div className="font-mono text-[13px] text-[var(--md-ink-muted)] tabular-nums">
                    Provisional bracket: {you.provisionalRecordW}–{you.provisionalRecordL}
                    {you.provisionalStatus ? ` · ${you.provisionalStatus}` : ""}
                  </div>
                )}
                <p className="font-display text-[12px] text-[var(--md-ink-muted)]">
                  Final results post once every slot is in (or the window closes).
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3 border-2 border-[var(--md-ink)] bg-[var(--md-white)] p-4">
                {/* Creds: shown only when not logged in. */}
                {!hasSaved && (
                  <>
                    <NameField
                      label="Your name"
                      value={name}
                      maxLength={NAME_MAX_LEN}
                      onChange={(event) => setName(event.target.value)}
                      labelTextClassName="text-[10px]"
                    />
                    <PinField
                      label="PIN"
                      value={pin}
                      onChange={(event) => setPin(event.target.value)}
                      labelTextClassName="text-[10px]"
                    />
                  </>
                )}
                {hasSaved && (
                  <div className="font-display text-[13px]">
                    Playing as{" "}
                    <strong className="text-[var(--md-coral-deep)]">{name}</strong>
                  </div>
                )}

                {error && (
                  <Notice tone="error" textClassName="font-display text-sm">
                    {error}
                  </Notice>
                )}

                <Button
                  size="lg"
                  disabled={registering}
                  onClick={startDraft}
                >
                  {registering
                    ? "Starting…"
                    : midDraft
                      ? "Continue draft"
                      : isAdmin
                        ? "Submit team"
                        : "Register & draft"}
                </Button>
              </div>
            )}
          </div>

          {/* Host-only teardown — quiet, confirm-gated. */}
          {you?.isAdmin && (
            <div className="mt-4 flex justify-start">
              <DeleteTournamentControl tournamentId={data.tournamentId} />
            </div>
          )}
        </div>

        {/* RIGHT: invite card (dark ink, cobalt accent) */}
        <div className="shrink-0 md:w-[340px]">
          <div
            className="flex flex-col gap-4 border-2 border-[var(--md-coral)] p-5"
            style={{
              background: "var(--md-ink)",
              backgroundImage: "radial-gradient(var(--md-ink-2) 1.4px, transparent 1.5px)",
              backgroundSize: "8px 8px",
              boxShadow: "var(--md-shadow-pop)",
            }}
          >
            <div>
              <div className="font-cond text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--md-yellow)]">
                Invite
              </div>
              <div
                className="font-cover text-[var(--md-paper)]"
                style={{ fontSize: 24, textTransform: "uppercase", lineHeight: 1.05, marginTop: 2 }}
              >
                Bracket Drops When Everyone&rsquo;s In
              </div>
            </div>

            <CopyLinkField
              value={fullShare}
              layout="button"
              copyLabel="Copy Invite Link"
              buttonSize="lg"
              buttonFullWidth
              buttonPrefix={<span>⎘</span>}
              displayValue={fullShare.replace(/^https?:\/\//, "")}
              displayClassName="border-2 border-[#3a322a] px-3 py-2 text-[var(--md-paper)]"
              displayStyle={{ background: "var(--md-ink-2)" }}
            />

            {/* Slots + bracket preview */}
            <div className="font-cond text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--md-paper-3)]">
              ■ {data.size} Slots · Single Elim
            </div>

            {/* Simple bracket silhouette */}
            <div
              className="mx-auto"
              style={{ width: "100%", height: 80, position: "relative", opacity: 0.35 }}
            >
              <svg width="100%" height="80" viewBox="0 0 220 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Left bracket arms */}
                <rect x="0" y="10" width="30" height="2" fill="#CFC5AD" />
                <rect x="0" y="30" width="30" height="2" fill="#CFC5AD" />
                <rect x="30" y="10" width="2" height="22" fill="#CFC5AD" />
                <rect x="30" y="21" width="20" height="2" fill="#CFC5AD" />

                <rect x="0" y="50" width="30" height="2" fill="#CFC5AD" />
                <rect x="0" y="70" width="30" height="2" fill="#CFC5AD" />
                <rect x="30" y="50" width="2" height="22" fill="#CFC5AD" />
                <rect x="30" y="61" width="20" height="2" fill="#CFC5AD" />

                {/* Middle */}
                <rect x="50" y="21" width="2" height="42" fill="#CFC5AD" />
                <rect x="50" y="42" width="20" height="2" fill="#CFC5AD" />

                {/* Champion (dashed) */}
                <rect x="70" y="35" width="30" height="14" stroke="#E5261F" strokeWidth="1.5" strokeDasharray="4 2" fill="none" />

                {/* Right bracket arms */}
                <rect x="190" y="10" width="30" height="2" fill="#CFC5AD" />
                <rect x="190" y="30" width="30" height="2" fill="#CFC5AD" />
                <rect x="188" y="10" width="2" height="22" fill="#CFC5AD" />
                <rect x="168" y="21" width="22" height="2" fill="#CFC5AD" />

                <rect x="190" y="50" width="30" height="2" fill="#CFC5AD" />
                <rect x="190" y="70" width="30" height="2" fill="#CFC5AD" />
                <rect x="188" y="50" width="2" height="22" fill="#CFC5AD" />
                <rect x="168" y="61" width="22" height="2" fill="#CFC5AD" />

                {/* Right middle */}
                <rect x="168" y="21" width="2" height="42" fill="#CFC5AD" />
                <rect x="150" y="42" width="20" height="2" fill="#CFC5AD" />
              </svg>
            </div>
          </div>

          <p className="mt-3 font-display text-[12px] leading-snug text-[var(--md-ink-muted)]">
            Once all {data.size} entrants submit their rosters, seeds lock and the bracket is drawn. If the clock runs out first, it draws with whoever&rsquo;s in.
          </p>
        </div>
      </div>
    </div>
  );
}
