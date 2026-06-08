"use client";

import { useState } from "react";
import { validateName, validatePin } from "@/lib/tournamentValidation";
import { saveUser, type SavedUser } from "@/lib/tournamentSession";

// Daily play requires the same (name, PIN) arcade login the tournament uses, so a
// player's completion is tracked per account and shared across their devices. The
// pair is create-or-match server-side (no "wrong password"); this modal just
// collects + remembers it.
export function DailySignIn({
  onSignedIn,
  onCancel,
  title = "Sign in to play the Daily",
}: {
  onSignedIn: (user: SavedUser) => void;
  onCancel: () => void;
  title?: string;
}) {
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const nameCheck = validateName(username);
  const pinOk = validatePin(pin);
  const canGo = nameCheck.ok && pinOk;

  const submit = () => {
    if (!canGo) return;
    const user = { username, pin };
    saveUser(user);
    onSignedIn(user);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(56,56,56,0.55)" }}
      onClick={onCancel}
    >
      <div
        className="md-card md-card--lift w-full max-w-sm p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-lg font-bold">{title}</h3>
          <button
            type="button"
            aria-label="Close"
            onClick={onCancel}
            className="font-display text-lg text-[var(--md-ink-muted)] hover:text-[var(--md-coral)]"
          >
            ✕
          </button>
        </div>
        <p className="mt-1 text-[13px] leading-snug text-[var(--md-ink-muted)]">
          Your name + PIN is your account — same one as the tournament. It tracks
          your daily results across devices. (Same name, different PIN = a separate
          account; no name is ever taken.)
        </p>

        <label className="mt-4 flex flex-col gap-1">
          <span className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
            Your name
          </span>
          <input
            className="md-input md-input--name"
            value={username}
            maxLength={16}
            autoCapitalize="characters"
            placeholder="PHILJACKSON"
            onChange={(e) =>
              setUsername(e.target.value.toUpperCase().replace(/[^A-Z0-9 ]/g, ""))
            }
          />
          <span className="font-display text-[11px] text-[var(--md-ink-muted)]">
            {username.length > 0 && !nameCheck.ok
              ? nameCheck.reason
              : "Letters, numbers, spaces · 16 max"}
          </span>
        </label>

        <label className="mt-3 flex flex-col gap-1">
          <span className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
            PIN
          </span>
          <input
            className="md-input"
            value={pin}
            type="password"
            inputMode="numeric"
            maxLength={6}
            placeholder="4–6 digits"
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <span className="font-display text-[11px] text-[var(--md-ink-muted)]">
            {pin.length > 0 && !pinOk
              ? "PIN must be 4–6 digits"
              : "Remembers your account so you can check back."}
          </span>
        </label>

        <button
          className="md-btn md-btn--lg md-btn--teal mt-4 w-full"
          disabled={!canGo}
          style={canGo ? undefined : { opacity: 0.5, cursor: "not-allowed" }}
          onClick={submit}
        >
          Play the Daily
        </button>
      </div>
    </div>
  );
}
