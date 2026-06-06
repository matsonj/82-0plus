"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  TournamentLookupResponse,
  TournamentTeamSummary,
  TournamentRunResponse,
  BracketPlayer,
} from "@/lib/types";
import {
  validateName,
  validatePin,
  NAME_MAX_LEN,
} from "@/lib/tournamentValidation";
import { TournamentResults } from "@/components/TournamentResults";
import { TierBadge } from "@/components/TierBadge";
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

// One roster line: name (+ [C] for captain) and a subtle "team 'season".
function RosterLine({ p }: { p: BracketPlayer }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5 font-display text-[12px]">
      <span className="min-w-0 truncate">
        {p.name}
        {p.captain ? (
          <span className="ml-1 inline-block border border-[var(--md-ink)] bg-[var(--md-yellow)] px-1 text-[8px] font-bold uppercase leading-tight tracking-wide align-middle">
            C
          </span>
        ) : null}
      </span>
      <span className="shrink-0 text-[11px] text-[var(--md-orange-deep)]">
        {p.team} &rsquo;{String(p.season).slice(2)}
      </span>
    </div>
  );
}

// A single memorialized team. The card body opens the bracket; a separate
// "Show roster" toggle reveals the five (captain flagged) + sixth man inline.
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
  const [showRoster, setShowRoster] = useState(false);
  return (
    <div className="md-card md-card--lift flex w-full flex-col gap-2 p-4">
      <button
        type="button"
        onClick={onOpen}
        disabled={loading}
        className="flex w-full flex-col gap-2 text-left transition-transform hover:translate-x-[-2px] hover:translate-y-[-2px] disabled:opacity-60"
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
          {/* Daily is "Open" — tier-less — so no tier badge for daily teams. */}
          {team.mode !== "daily" && <TierBadge seedNet={team.seedNet} />}
          {team.mode === "daily" ? (
            <span className="md-capsule md-capsule--sky">Daily</span>
          ) : team.mode === "hoopiq" ? (
            <span className="md-capsule md-capsule--ink">Ranked</span>
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

      {team.roster && team.roster.length > 0 && (
        <div className="border-t-2 border-dashed border-[var(--md-ink)] pt-2">
          <button
            type="button"
            className="font-display text-[12px] font-bold uppercase tracking-wide text-[var(--md-blue)] underline"
            onClick={() => setShowRoster((v) => !v)}
          >
            {showRoster ? "Hide roster" : "Show roster"}
          </button>
          {showRoster && (
            <div className="mt-2">
              {team.roster.map((p, i) => (
                <RosterLine key={`${p.team}-${p.name}-${i}`} p={p} />
              ))}
              {team.sixthMan && (
                <>
                  <div className="my-1 border-t border-[var(--md-paper-3)]" />
                  <div className="font-display text-[9px] font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
                    Sixth Man
                  </div>
                  <RosterLine p={team.sixthMan} />
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type View = "form" | "list" | "team";

export function TournamentLookup({ onBack }: { onBack?: () => void }) {
  const [view, setView] = useState<View>("form");

  // True until we've checked for a saved session on mount. While true (and a
  // saved user exists) we show a loader, not the login form, so a logged-in
  // player never sees the login page.
  const [bootingSession, setBootingSession] = useState(true);

  // Form state.
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // List + detail state.
  const [lookup, setLookup] = useState<TournamentLookupResponse | null>(null);
  const [run, setRun] = useState<TournamentRunResponse | null>(null);
  // The summary of the team currently opened (for the share-card mode label).
  const [openSummary, setOpenSummary] = useState<TournamentTeamSummary | null>(null);
  const [loadingTeamId, setLoadingTeamId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [page, setPage] = useState(0); // teams-list page (10 per page)
  const TEAMS_PER_PAGE = 10;

  const nameCheck = validateName(name);
  const pinOk = validatePin(pin);
  const canSubmit = nameCheck.ok && pinOk && !submitting;

  const resetToForm = () => {
    setLookup(null);
    setRun(null);
    setLoadingTeamId(null);
    setListError(null);
    setError(null);
    setPage(0);
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
        setPage(0);
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

  // Auto-login from a saved session: jump straight to the teams list (showing a
  // loader, never the login form, while it resolves).
  useEffect(() => {
    const saved = getSavedUser();
    if (!saved) {
      setBootingSession(false);
      return;
    }
    setName(saved.username);
    setPin(saved.pin);
    runLookup(saved.username, saved.pin, true).finally(() =>
      setBootingSession(false),
    );
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
      setOpenSummary(
        lookup?.teams.find((t) => t.teamId === teamId) ?? null,
      );
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
        mode={openSummary?.mode}
        dailyDate={openSummary?.dailyDate}
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
    const pageCount = Math.max(1, Math.ceil(teams.length / TEAMS_PER_PAGE));
    const safePage = Math.min(page, pageCount - 1);
    const shown = teams.slice(
      safePage * TEAMS_PER_PAGE,
      safePage * TEAMS_PER_PAGE + TEAMS_PER_PAGE,
    );
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
              Play a Classic or Ranked season and hit Enter Tournament.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {shown.map((team) => (
              <TeamRow
                key={team.teamId}
                team={team}
                onOpen={() => openTeam(team.teamId)}
                loading={loadingTeamId === team.teamId}
              />
            ))}
          </div>
        )}

        {pageCount > 1 && (
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              className="md-btn md-btn--sm md-btn--secondary"
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              ← Newer
            </button>
            <span className="font-display text-xs uppercase tracking-wide text-[var(--md-ink-muted)]">
              Page {safePage + 1} of {pageCount}
            </span>
            <button
              type="button"
              className="md-btn md-btn--sm md-btn--secondary"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              Older →
            </button>
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

  // While restoring a saved session, show a loader — never the login form.
  if (bootingSession) {
    return (
      <div className="mx-auto w-full max-w-md py-16 text-center font-display text-sm text-[var(--md-ink-muted)]">
        Loading your teams…
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
