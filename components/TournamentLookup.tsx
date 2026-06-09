"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  TournamentLookupResponse,
  TournamentTeamSummary,
  TournamentRunResponse,
  TournamentMode,
  BracketPlayer,
} from "@/lib/types";
import {
  validateName,
  validateTournamentName,
  validatePin,
  NAME_MAX_LEN,
  TOURNAMENT_NAME_MAX_LEN,
} from "@/lib/tournamentValidation";
import { TournamentResults } from "@/components/TournamentResults";
import { TierBadge } from "@/components/TierBadge";
import { PrivateTournamentCreate } from "@/components/private/PrivateTournamentCreate";
import { getSavedUser, saveUser, clearUser } from "@/lib/tournamentSession";

// One private tournament row from POST /api/private-tournament/my — the full
// list of tournaments the account has an entry in (newest first), INCLUDING
// viewed-completed ones (unlike /notifications). `needsAttention` drives the
// unread dot.
interface MyPrivateRow {
  tournamentId: string;
  name: string;
  mode: string;
  modeLabel: string;
  size: number;
  status: "open" | "completed";
  championName: string | null;
  expiresAt: string;
  finalizedAt: string | null;
  viewedFinalAt: string | null;
  entryStatus: string;
  finalRecordW: number | null;
  finalRecordL: number | null;
  finalStatus: string | null;
  provisionalRecordW: number | null;
  provisionalRecordL: number | null;
  provisionalStatus: string | null;
  needsAttention: boolean;
}

// The My-Teams filters. daily/hoopiq/classic filter the existing team list by
// TournamentMode; "private" swaps to the private-tournament feed; "all" clears the
// mode filter and shows every (non-private) team.
type Tab = "all" | "daily" | "hoopiq" | "classic" | "private";

const TAB_LABEL: Record<Tab, string> = {
  all: "All",
  daily: "Daily",
  hoopiq: "Ranked",
  classic: "Classic",
  private: "Private",
};

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
          {team.mode !== "daily" && <TierBadge seedNet={team.seedNet} size="capsule" />}
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

// One private-tournament row in the Private tab. Unfinished → opens the lobby;
// completed → opens the final results. Both live at /p/<id>. A red dot marks a
// row that needs attention (unviewed final / unfinished draft).
function PrivateRow({ row }: { row: MyPrivateRow }) {
  const completed = row.status === "completed";
  return (
    <Link
      href={`/p/${row.tournamentId}`}
      className="md-card md-card--lift flex flex-col gap-2 p-4 transition-transform hover:translate-x-[-2px] hover:translate-y-[-2px]"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          {row.needsAttention && (
            <span
              aria-label="Needs attention"
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-[var(--md-ink)]"
              style={{ background: "var(--md-coral)" }}
            />
          )}
          <span className="min-w-0 truncate font-display text-lg font-bold leading-tight">
            {row.name}
          </span>
        </span>
        <span
          className="md-capsule shrink-0"
          style={
            row.mode === "hoopiq"
              ? { background: "var(--md-ink)", color: "var(--md-white)" }
              : undefined
          }
        >
          {row.modeLabel}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="font-display text-sm font-bold">
          {completed
            ? row.finalRecordW != null && row.finalRecordL != null
              ? `${row.finalRecordW}–${row.finalRecordL} · ${row.finalStatus ?? "Final"}`
              : row.championName
                ? `🏆 ${row.championName}`
                : "Final ready"
            : row.entryStatus === "submitted"
              ? "Submitted · awaiting results"
              : row.entryStatus === "partial"
                ? "Draft in progress"
                : "Draft not started"}
        </span>
        <span className="font-display text-[11px] uppercase tracking-wide text-[var(--md-blue)]">
          {completed ? "View results →" : "Open lobby →"}
        </span>
      </div>
    </Link>
  );
}

type View = "form" | "list" | "team";

export function TournamentLookup({
  onBack,
  initialTab,
}: {
  onBack?: () => void;
  initialTab?: Tab;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>("form");
  const [tab, setTab] = useState<Tab>(initialTab ?? "daily");
  // Private-tab state.
  const [privateRows, setPrivateRows] = useState<MyPrivateRow[] | null>(null);
  const [privateLoading, setPrivateLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  // "Join by tournament name + PIN" form state (the private landing). Distinct
  // from the account login below it: this collects the TOURNAMENT's identity
  // (joinName/joinPin) plus the player's ACCOUNT identity (the `name`/`pin`
  // login state, prefilled from the saved session) needed to reserve a slot.
  const [joinName, setJoinName] = useState("");
  const [joinPin, setJoinPin] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

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
  // saved session) suppresses the error message. NOTE: a non-2xx here is NOT an
  // auth failure — the legacy lookup returns no-match for a valid account that
  // simply has no Daily/Ranked/Classic teams (e.g. a private-only account). So
  // the silent path must NEVER clear the saved user; doing so would log out a
  // valid private-only account (and kill the GlobalHeader notification dot,
  // which polls with the saved account). Only an explicit "Log out" or a real
  // private-auth 401 clears the session.
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
          // Any non-2xx (incl. no-match) → a single generic message. Keep the
          // saved session intact on the silent (auto-login) path.
          if (!silent) setError("No team found for that name and PIN.");
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

  // Fetch the user's full private-tournament list (newest-first, incl. viewed-
  // completed) via /my. Re-authenticates with name+PIN. When `boot` is set (the
  // saved-session auto-login landing on the Private tab), a successful auth also
  // switches to the Private list view so a private-only account lands directly
  // on its private feed instead of the logged-out private landing. A 401 there
  // is a genuine auth failure (stale/bad saved creds) and clears the session;
  // any other failure leaves the saved user intact and just shows an empty list.
  const loadPrivate = useCallback(
    async (uname: string, upin: string, boot = false) => {
      setPrivateLoading(true);
      try {
        const res = await fetch("/api/private-tournament/my", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: uname, pin: upin }),
        });
        if (!res.ok) {
          // A 401 is a real auth failure: clear the stale saved session so the
          // boot path falls back to the login/landing instead of looping.
          if (res.status === 401) clearUser();
          setPrivateRows([]);
          return;
        }
        const data = (await res.json()) as { tournaments: MyPrivateRow[] };
        saveUser({ username: uname, pin: upin }); // stay logged in
        setPrivateRows(data.tournaments ?? []);
        if (boot) {
          setTab("private");
          setPage(0);
          setView("list");
        }
      } catch {
        setPrivateRows([]);
      } finally {
        setPrivateLoading(false);
      }
    },
    [],
  );

  // Auto-login from a saved session: jump straight to the teams list (showing a
  // loader, never the login form, while it resolves).
  //
  // When the active tab is `private` (e.g. arriving at /tournament?tab=private),
  // authenticate via the private feed (/api/private-tournament/my) instead of
  // the legacy team lookup. A private-only account has no Daily/Ranked/Classic
  // teams, so the legacy lookup would return no-match — which must not be
  // treated as a logout. Routing the private boot through loadPrivate lands the
  // account on its private list and keeps the saved user (and header dot) alive.
  useEffect(() => {
    const saved = getSavedUser();
    if (!saved) {
      setBootingSession(false);
      return;
    }
    setName(saved.username);
    setPin(saved.pin);
    const boot =
      initialTab === "private"
        ? loadPrivate(saved.username, saved.pin, true)
        : runLookup(saved.username, saved.pin, true);
    boot.finally(() => setBootingSession(false));
  }, [runLookup, loadPrivate, initialTab]);

  const logOut = () => {
    clearUser();
    setName("");
    setPin("");
    setPrivateRows(null);
    resetToForm();
  };

  // Private-tab account login ("Already joined one?"). Authenticates DIRECTLY
  // against /api/private-tournament/my (NOT /api/tournament/lookup), so an
  // account with only private entries — and zero Daily/Ranked/Classic teams —
  // still reaches its private list. On success: remember the account, populate
  // the private rows, and switch to the list view (Private tab). A 401 means
  // bad name/PIN; any other failure is a generic retry message. An authenticated
  // account with no private tournaments is NOT an error — it lands on the list
  // with an empty `privateRows`, showing the friendly empty state.
  const submitPrivateLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/private-tournament/my", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, pin }),
      });
      if (!res.ok) {
        setError(
          res.status === 401
            ? "No account found for that name and PIN."
            : "Couldn't load your private tournaments right now. Try again.",
        );
        return;
      }
      const data = (await res.json()) as { tournaments: MyPrivateRow[] };
      saveUser({ username: name, pin }); // stay logged in
      setPrivateRows(data.tournaments ?? []);
      setTab("private");
      setPage(0);
      setView("list");
    } catch {
      setError("Couldn't load your private tournaments right now. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Join a private tournament by its NAME + PIN. Two-step: (1) verify the
  // tournament's name+PIN via /lookup to resolve a tournamentId (a generic 404
  // covers both "no such name" and "wrong PIN"); (2) reserve a slot for the
  // signed-in account via /register (idempotent — returns the existing entry if
  // already in). On success, remember the account and navigate to the lobby at
  // /p/<id>, where the draft flow continues.
  const submitJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const tNameCheck = validateTournamentName(joinName);
    const tPinOk = validatePin(joinPin);
    const aNameCheck = validateName(name);
    const aPinOk = validatePin(pin);
    if (!tNameCheck.ok || !tPinOk || !aNameCheck.ok || !aPinOk || joining) {
      return;
    }
    setJoining(true);
    setJoinError(null);
    try {
      const lookupRes = await fetch("/api/private-tournament/lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: joinName, pin: joinPin }),
      });
      if (!lookupRes.ok) {
        // Single generic message — never leak whether the name exists.
        setJoinError("No tournament with that name + PIN.");
        return;
      }
      const { tournamentId } = (await lookupRes.json()) as {
        tournamentId: string;
      };

      const regRes = await fetch("/api/private-tournament/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, pin, tournamentId }),
      });
      if (!regRes.ok) {
        const data = await regRes.json().catch(() => ({}));
        setJoinError(data?.error ?? "Couldn't join that tournament.");
        return;
      }

      // Reserved (or already in) — remember the account and head to the lobby.
      saveUser({ username: name, pin });
      router.push(`/p/${tournamentId}`);
    } catch {
      setJoinError("Couldn't join right now. Try again.");
    } finally {
      setJoining(false);
    }
  };

  // Load the private feed the first time the Private tab is opened on the list.
  useEffect(() => {
    if (view !== "list" || tab !== "private" || privateRows !== null) return;
    if (!nameCheck.ok || !pinOk) return;
    void loadPrivate(name, pin);
  }, [view, tab, privateRows, name, pin, nameCheck.ok, pinOk, loadPrivate]);

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
  // Rendered when a generic lookup succeeded (`lookup` set) OR when a Private-tab
  // account login succeeded for an account with no Daily/Ranked/Classic teams
  // (`lookup` null but `privateRows` populated). The Private tab reads from
  // `privateRows`, so it never needs `lookup`; the other tabs read from
  // `lookup.teams`.
  if (view === "list" && (lookup || privateRows !== null)) {
    // Filter the existing team list by the active mode tab (daily/hoopiq/classic).
    const filtered =
      tab === "private"
        ? []
        : tab === "all"
          ? (lookup?.teams ?? [])
          : (lookup?.teams ?? []).filter((t) => t.mode === (tab as TournamentMode));
    const pageCount = Math.max(1, Math.ceil(filtered.length / TEAMS_PER_PAGE));
    const safePage = Math.min(page, pageCount - 1);
    const shown = filtered.slice(
      safePage * TEAMS_PER_PAGE,
      safePage * TEAMS_PER_PAGE + TEAMS_PER_PAGE,
    );
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <div className="flex items-end justify-between gap-3">
          <div className="font-display text-2xl font-bold">
            {lookup?.name ?? name}
          </div>
          <button
            type="button"
            className="font-display text-[11px] font-bold uppercase tracking-wide text-[var(--md-blue)] underline"
            onClick={logOut}
          >
            Log out
          </button>
        </div>

        {/* Filter tabs. */}
        <div className="flex flex-wrap gap-1.5">
          {(["daily", "hoopiq", "classic", "private"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTab(t);
                setPage(0);
              }}
              className="border-2 border-[var(--md-ink)] px-3 py-1.5 font-display text-[11px] font-bold uppercase tracking-wide"
              style={{
                background: tab === t ? "var(--md-ink)" : "var(--md-white)",
                color: tab === t ? "var(--md-white)" : "var(--md-ink)",
                cursor: "pointer",
              }}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>

        {/* Clear the mode filter to show every (non-private) team. Shown on the
            Private tab too, so it reads as just another selected filter with a
            consistent way back to the unfiltered "all" list. */}
        {tab !== "all" && (
          <button
            type="button"
            onClick={() => {
              setTab("all");
              setPage(0);
            }}
            className="self-start font-display text-[11px] font-bold uppercase tracking-wide text-[var(--md-blue)] underline"
          >
            Clear filter · show all
          </button>
        )}

        {listError && (
          <div className="border-2 border-[var(--md-coral)] bg-[var(--md-white)] p-2 font-display text-sm text-[var(--md-coral)]">
            {listError}
          </div>
        )}

        {/* ---- Private tab ---- */}
        {tab === "private" ? (
          <div className="flex flex-col gap-3">
            {showCreate ? (
              <PrivateTournamentCreate onCancel={() => setShowCreate(false)} />
            ) : (
              <button
                type="button"
                className="md-btn md-btn--teal"
                onClick={() => setShowCreate(true)}
              >
                + Create private tournament
              </button>
            )}

            {!showCreate &&
              (privateLoading ? (
                <div className="py-6 text-center font-display text-sm text-[var(--md-ink-muted)]">
                  Loading your private tournaments…
                </div>
              ) : privateRows && privateRows.length > 0 ? (
                privateRows.map((r) => (
                  <PrivateRow key={r.tournamentId} row={r} />
                ))
              ) : (
                <div className="md-card flex flex-col gap-1 p-5 text-center">
                  <div className="font-display text-lg font-bold">
                    No active private tournaments
                  </div>
                  <p className="text-[13px] text-[var(--md-ink-muted)]">
                    Create one above, or open a friend&rsquo;s invite link.
                  </p>
                </div>
              ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="md-card flex flex-col gap-1 p-5 text-center">
            <div className="font-display text-lg font-bold">No teams yet</div>
            <p className="text-[13px] text-[var(--md-ink-muted)]">
              {tab === "daily"
                ? "Play a Daily Challenge to see it here."
                : "Play a Classic or Ranked season and hit Enter Tournament."}
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

        {tab !== "private" && pageCount > 1 && (
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

  // ---- Private landing (logged-out). ----
  // Reaching the Private tab without a saved session: hosting needs no My Teams
  // login (PrivateTournamentCreate collects its own creds), so surface Create +
  // a compact "see my tournaments" login instead of the generic team-lookup form.
  if (tab === "private") {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        {/* Tab switcher so they can still jump to the team-lookup tabs. */}
        <div className="flex flex-wrap gap-1.5">
          {(["daily", "hoopiq", "classic", "private"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="border-2 border-[var(--md-ink)] px-3 py-1.5 font-display text-[11px] font-bold uppercase tracking-wide"
              style={{
                background: tab === t ? "var(--md-ink)" : "var(--md-white)",
                color: tab === t ? "var(--md-white)" : "var(--md-ink)",
                cursor: "pointer",
              }}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>

        {showCreate ? (
          <PrivateTournamentCreate onCancel={() => setShowCreate(false)} />
        ) : (
          <>
            <div className="md-card md-card--lift flex flex-col gap-3 p-5">
              <div>
                <div className="font-display text-xl font-bold">
                  Private tournament
                </div>
                <p className="mt-1 text-[13px] text-[var(--md-ink-muted)]">
                  Host an invite-only bracket for your friends, or open an invite
                  link someone shared with you.
                </p>
              </div>
              <button
                type="button"
                className="md-btn md-btn--teal"
                onClick={() => setShowCreate(true)}
              >
                + Create private tournament
              </button>
            </div>

            {/* Join by tournament name + PIN. Verifies the tournament's own
                name+PIN, then reserves a slot for the signed-in account and
                drops the player into the lobby/draft. */}
            <form
              onSubmit={submitJoin}
              className="md-card flex flex-col gap-3 p-5"
            >
              <div>
                <div className="font-display text-sm font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
                  Join a private tournament
                </div>
                <p className="mt-1 text-[13px] text-[var(--md-ink-muted)]">
                  Enter the tournament&rsquo;s name + PIN to grab a slot and
                  start building your team.
                </p>
              </div>

              <label className="flex flex-col gap-1">
                <span className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
                  Tournament name
                </span>
                <input
                  className="md-input md-input--name"
                  value={joinName}
                  maxLength={TOURNAMENT_NAME_MAX_LEN}
                  autoCapitalize="characters"
                  onChange={(e) =>
                    setJoinName(
                      e.target.value.toUpperCase().replace(/[^A-Z0-9 ]/g, ""),
                    )
                  }
                  placeholder="FRIDAY NIGHT HOOPS CUP"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
                  Tournament PIN
                </span>
                <input
                  className="md-input"
                  value={joinPin}
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(e) => setJoinPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="4–6 digits"
                />
              </label>

              <div className="border-t-2 border-dashed border-[var(--md-ink)] pt-3">
                <span className="font-display text-[11px] uppercase tracking-wide text-[var(--md-ink-muted)]">
                  Your account (to enter as)
                </span>
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
                    setName(
                      e.target.value.toUpperCase().replace(/[^A-Z0-9 ]/g, ""),
                    )
                  }
                  placeholder="PHILJACKSON"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
                  Your PIN
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

              {joinError && (
                <div className="border-2 border-[var(--md-coral)] bg-[var(--md-white)] p-2 font-display text-sm text-[var(--md-coral)]">
                  {joinError}
                </div>
              )}
              <button
                type="submit"
                className="md-btn md-btn--teal"
                disabled={
                  !validateTournamentName(joinName).ok ||
                  !validatePin(joinPin) ||
                  !nameCheck.ok ||
                  !pinOk ||
                  joining
                }
              >
                {joining ? "Joining…" : "Join & start building"}
              </button>
            </form>

            <form
              onSubmit={submitPrivateLogin}
              className="md-card flex flex-col gap-3 p-5"
            >
              <div className="font-display text-sm font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
                Already joined one?
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
                    setName(
                      e.target.value.toUpperCase().replace(/[^A-Z0-9 ]/g, ""),
                    )
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
              {error && (
                <div className="border-2 border-[var(--md-coral)] bg-[var(--md-white)] p-2 font-display text-sm text-[var(--md-coral)]">
                  {error}
                </div>
              )}
              <button
                type="submit"
                className="md-btn md-btn--secondary"
                disabled={!canSubmit}
              >
                {submitting ? "Checking…" : "Show my private tournaments"}
              </button>
            </form>
          </>
        )}

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
