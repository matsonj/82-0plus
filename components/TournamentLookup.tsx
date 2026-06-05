"use client";

import { useState } from "react";
import type { TournamentRunResponse } from "@/lib/types";
import {
  validateName,
  validatePin,
  NAME_MAX_LEN,
} from "@/lib/tournamentValidation";
import { TournamentResults } from "@/components/TournamentResults";

export function TournamentLookup({ onBack }: { onBack?: () => void }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<TournamentRunResponse | null>(null);

  const nameCheck = validateName(name);
  const pinOk = validatePin(pin);
  const canSubmit = nameCheck.ok && pinOk && !submitting;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/tournament/lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, pin }),
      });
      if (!res.ok) {
        // Any non-2xx (incl. no-match) → a single generic message.
        setError("No team found for that name and PIN.");
        return;
      }
      const data = (await res.json()) as TournamentRunResponse;
      setResult(data);
    } catch {
      setError("Couldn't check your team right now. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    // Standalone (no onBack) → "reset" returns to the lookup form.
    return (
      <TournamentResults data={result} onReset={onBack ?? (() => setResult(null))} />
    );
  }

  return (
    <form
      onSubmit={submit}
      className="md-card md-card--lift mx-auto flex w-full max-w-md flex-col gap-4 p-5"
    >
      <div>
        <div className="font-display text-xl font-bold">Check your team</div>
        <p className="mt-1 text-[13px] text-[var(--md-ink-muted)]">
          Enter the name and PIN you used to enter the tournament.
        </p>
      </div>

      <label className="flex flex-col gap-1">
        <span className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
          Team name
        </span>
        <input
          className="md-input md-input--name"
          value={name}
          maxLength={NAME_MAX_LEN}
          autoCapitalize="characters"
          onChange={(e) => setName(e.target.value.toUpperCase())}
          placeholder="MJ23"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
          PIN
        </span>
        <input
          className="md-input"
          value={pin}
          inputMode="numeric"
          maxLength={6}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          placeholder="4–6 digits"
        />
      </label>

      {error && (
        <div className="border-2 border-[var(--md-coral)] bg-[var(--md-white)] p-2 font-display text-sm text-[var(--md-coral)]">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className="md-btn md-btn--teal"
          disabled={!canSubmit}
        >
          {submitting ? "Checking…" : "Find my team"}
        </button>
        {onBack && (
          <button
            type="button"
            className="md-btn md-btn--secondary"
            onClick={onBack}
          >
            Back
          </button>
        )}
      </div>
    </form>
  );
}
