"use client";

import { useState } from "react";
import { validateName, validatePin } from "@/lib/tournamentValidation";
import { saveUser, type SavedUser } from "@/lib/tournamentSession";
import { Button, ModalFrame, NameField, PinField } from "@/components/ui";

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
    <ModalFrame title={title} onClose={onCancel}>
      <p className="mt-1 text-[13px] leading-snug text-[var(--md-ink-muted)]">
        Your name + PIN is your account — same one as the tournament. It tracks
        your daily results across devices. (Same name, different PIN = a separate
        account; no name is ever taken.)
      </p>

      <NameField
        className="mt-4"
        label="Your name"
        value={username}
        maxLength={16}
        onChange={(event) => setUsername(event.target.value)}
        hint={
          username.length > 0 && !nameCheck.ok
            ? nameCheck.reason
            : "Letters, numbers, spaces · 16 max"
        }
      />

      <PinField
        className="mt-3"
        label="PIN"
        value={pin}
        onChange={(event) => setPin(event.target.value)}
        onKeyDown={(event) => event.key === "Enter" && submit()}
        hint={
          pin.length > 0 && !pinOk
            ? "PIN must be 4–6 digits"
            : "Remembers your account so you can check back."
        }
      />

      <Button
        type="button"
        variant="teal"
        size="lg"
        fullWidth
        className="mt-4"
        disabled={!canGo}
        style={canGo ? undefined : { opacity: 0.5, cursor: "not-allowed" }}
        onClick={submit}
      >
        Play the Daily
      </Button>
    </ModalFrame>
  );
}
