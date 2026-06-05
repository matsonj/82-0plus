"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  TournamentLookupResponse,
  TournamentTeamSummary,
  TournamentRunResponse,
} from "@/lib/types";
import {
  validateName,
  validatePin,
  NAME_MAX_LEN,
} from "@/lib/tournamentValidation";
import { TournamentResults } from "@/components/TournamentResults";
import { getSavedUser, saveUser, clearUser } from "@/lib/tournamentSession";

// reachedRound: 0 = lost R1 … 4 = champion. Short list-row phrasing.
function reachedPhrase(reachedRound: number): string {
  switch (reachedRound) {
    case 0:
      return "Lost R1";
    case 1:
      return "Lost Conf. Semis";
    case 2:
      return "Lost Conf. Finals";
    case 3:
      return "Lost the Final";
    case 4:
      return "🏆 Champion";
    default:
      return "Eliminated";
  }
}

// Signed realized margin, teal if ≥0 else coral, using U+2212 for negatives.
function MarginTag({ value }: { value: number }) {
  const positive = value >= 0;
  const text = `${positive ? "+" : "−"}${Math.abs(value).toFixed(1)}`;
  return (
    <span
      className="font-display text-sm font-bold tabular-nums"
      style={{ color: positive ? "var(--md-teal)" : "var(--md-coral)" }}
    >
      {text}
    </span>
  );
}

// A single memorialized team, rendered as a clickable md-card row.
function TeamRow({
  team,
  onOpen,
  loading,
}: {
  team: TournamentTeamSummary;
  onOpen: () => void;
  loading: boolean;
}) {
  const isChampion = team.reachedRound === 4;
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={loading}
      className="md-card md-card--lift flex w-full flex-col gap-2 p-4 text-left transition-transform hover:translate-x-[-2px] hover:translate-y-[-2px] disabled:opacity-60"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-display text-lg font-bold leading-tight break-words">
          {team.teamName}
        </span>
        <span className="font-display text-xs text-[var(--md-ink-muted)] whitespace-nowrap">
          {new Date(team.createdAt).toLocaleDateString()}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {team.mode === "hoopiq" ? (
          <span className="md-capsule md-capsule--ink">HoopIQ</span>
        ) : (
          <span className="md-capsule">Classic</span>
        )}
        {isChampion && (
          <span className="md-capsule md-capsule--teal">🏆 Champion</span>
        )}
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <span className="font-display text-3xl font-bold tabular-nums">
          {team.recordW}&ndash;{team.recordL}
        </span>
        <MarginTag value={team.realizedMargin} />
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-display text-sm font-bold">
          {reachedPhrase(team.reachedRound)}
        </span>
        {isChampion ? (
          <span className="font-display text-sm text-[var(--md-teal)]">
            🏆 You won it all
          </span>
        ) : (
          <span className="font-display text-sm text-[var(--md-ink-muted)]">
            Won by {team.championName}
          </span>
        )}
      </div>

      {loading && (
        <div className="font-display text-xs text-[var(--md-ink-muted)]">
          Loading bracket…
        </div>
      )}
    </button>
  );
}

type View = "form" | "list" | "team";

export function TournamentLookup({ onBack }: { onBack?: () => void }) {
  const [view, setView] = useState<View>("form");

  // Form state.
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // List + detail state.
  const [lookup, setLookup] = useState<TournamentLookupResponse | null>(null);
  const [run, setRun] = useState<TournamentRunResponse | null>(null);
  const [loadingTeamId, setLoadingTeamId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const nameCheck = validateName(name);
  const pinOk = validatePin(pin);
  const canSubmit = nameCheck.ok && pinOk && !submitting;

  const resetToForm = () => {
    setLookup(null);
    setRun(null);
    setLoadingTeamId(null);
    setListError(null);
    setError(null);
    setView("form");
  };

  // Run a lookup for explicit credentials. `silent` (used by auto-login from a
  // saved session) suppresses the error and clears stale creds instead.
  const runLookup = useCallback(
    async (uname: string, upin: string, silent = false) => {
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch("/api/tournament/lookup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: uname, pin: upin }),
        });
        if (!res.ok) {
          // Any non-2xx (incl. no-match) → a single generic message.
          if (silent) clearUser();
          else setError("No team found for that name and PIN.");
          return;
        }
        const data = (await res.json()) as TournamentLookupResponse;
        saveUser({ username: uname, pin: upin }); // stay logged in
        setLookup(data);
        setView("list");
      } catch {
        if (!silent) setError("Couldn't check your team right now. Try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [],
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    void runLookup(name, pin);
  };

  // Auto-login from a saved session: jump straight to the teams list.
  useEffect(() => {
    const saved = getSavedUser();
    if (saved) {
      setName(saved.username);
      setPin(saved.pin);
      void runLookup(saved.username, saved.pin, true);
    }
  }, [runLookup]);

  const logOut = () => {
    clearUser();
    setName("");
    setPin("");
    resetToForm();
  };

  const openTeam = async (teamId: string) => {
    if (loadingTeamId) return;
    setLoadingTeamId(teamId);
    setListError(null);
    try {
      const res = await fetch(
        `/api/tournament/team?id=${encodeURIComponent(teamId)}`,
      );
      if (!res.ok) {
        setListError("Couldn't load that team. Try again.");
        return;
      }
      const data = (await res.json()) as TournamentRunResponse;
      setRun(data);
      setView("team");
    } catch {
      setListError("Couldn't load that team. Try again.");
    } finally {
      setLoadingTeamId(null);
    }
  };

  // ---- Team detail view: a single run; reset returns to the list. ----
  if (view === "team" && run) {
    return (
      <TournamentResults
        data={run}
        onReset={() => {
          setRun(null);
          setView("list");
        }}
      />
    );
  }

  // ---- Teams list view. ----
  if (view === "list" && lookup) {
    const teams = lookup.teams;
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="font-display text-2xl font-bold">{lookup.name}</div>
            <p className="mt-0.5 font-display text-xs uppercase tracking-wide text-[var(--md-ink-muted)]">
              {teams.length} {teams.length === 1 ? "team" : "teams"}
            </p>
          </div>
          <button
            type="button"
            className="font-display text-[11px] font-bold uppercase tracking-wide text-[var(--md-blue)] underline"
            onClick={logOut}
          >
            Log out
          </button>
        </div>

        {listError && (
          <div className="border-2 border-[var(--md-coral)] bg-[var(--md-white)] p-2 font-display text-sm text-[var(--md-coral)]">
            {listError}
          </div>
        )}

        {teams.length === 0 ? (
          <div className="md-card flex flex-col gap-1 p-5 text-center">
            <div className="font-display text-lg font-bold">No teams yet</div>
            <p className="text-[13px] text-[var(--md-ink-muted)]">
              Play a Classic or HoopIQ season and hit Enter Tournament.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {teams.map((team) => (
              <TeamRow
                key={team.teamId}
                team={team}
                onOpen={() => openTeam(team.teamId)}
                loading={loadingTeamId === team.teamId}
              />
            ))}
          </div>
        )}

        <div className="flex">
          <button
            type="button"
            className="md-btn md-btn--secondary"
            onClick={resetToForm}
          >
            ← Check a different name
          </button>
        </div>
      </div>
    );
  }

  // ---- Form view (default). ----
  return (
    <form
      onSubmit={submit}
      className="md-card md-card--lift mx-auto flex w-full max-w-md flex-col gap-4 p-5"
    >
      <div>
        <div className="font-display text-xl font-bold">Check your teams</div>
        <p className="mt-1 text-[13px] text-[var(--md-ink-muted)]">
          Enter the account name and PIN you used to enter the tournament.
        </p>
      </div>

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
        <span className="font-display text-[11px] text-[var(--md-ink-muted)]">
          Your account name
        </span>
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
          {submitting ? "Checking…" : "Find my teams"}
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
