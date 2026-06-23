"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  TournamentLookupResponse,
  TournamentTeamSummary,
  TournamentRunResponse,
  TournamentMode,
  MyPrivateRow,
} from "@/lib/types";
import {
  validateName,
  validateTournamentName,
  validatePin,
} from "@/lib/tournamentValidation";
import { TournamentResults } from "@/components/TournamentResults";
import { TierBadge } from "@/components/TierBadge";
import { PrivateTournamentCreate } from "@/components/private/PrivateTournamentCreate";
import { getSavedUser, saveUser, clearUser } from "@/lib/tournamentSession";
import { getCachedTeams, setCachedTeams } from "@/lib/tournamentTeamsCache";
import { regWinsFromSeedNet } from "@/lib/tier";
import {
  reachedRoundLabel,
  formatPrivateEntryStatus,
  formatTournamentStatus,
  formatSignedMargin,
} from "@/lib/tournamentLabels";
import { Button, Capsule, EmptyState, LoadingState, Notice } from "@/components/ui";
import {
  AccountFields,
  TournamentCredentialFields,
  TournamentLookupTabs,
  type TournamentLookupTab,
} from "@/components/tournament/TournamentLookupControls";

// The My-Teams filters. daily/hoopiq/classic filter the existing team list by
// TournamentMode; "private" swaps to the private-tournament feed; "all" clears the
// mode filter and shows every (non-private) team.
type Tab = TournamentLookupTab;

// "2026-06-11" → "Jun 11" (plain calendar date, no TZ shift).
function shortDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// The actual 82-game record for daily teams (from daily_results); ranked/classic
// have no stored season record, so fall back to the seed-net projection.
function regSeasonRecord(team: TournamentTeamSummary): { w: number; l: number } {
  if (team.seasonW != null && team.seasonL != null) {
    return { w: team.seasonW, l: team.seasonL };
  }
  const w = regWinsFromSeedNet(team.seedNet);
  return { w, l: 82 - w };
}

// Shared "press stamp" chrome for the TIER lane. Matches TierBadge exactly (same
// border, misregistration double-shadow, +2° tilt, size) so the outcome stamps
// (champ / runner-up), the daily rank, and the season tier all read as ONE family
// — and a stacked outcome + rank reads as a single tilted stamp stack.
function RowStamp({
  fill,
  text,
  title,
  children,
}: {
  fill: string;
  text: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className="md-stamp inline-flex items-center justify-center gap-1 px-2 py-0.5 font-cond text-[11px] font-bold uppercase tracking-[0.04em]"
      style={{ background: fill, color: text, transform: "rotate(2deg)", minWidth: 60 }}
      title={title}
    >
      {children}
    </span>
  );
}

// The daily leaderboard placement (TIER lane), as a RowStamp + "of N" caption.
function DailyRankStamp({
  rank,
  field,
}: {
  rank: number;
  field: number | null | undefined;
}) {
  return (
    <span className="flex flex-col items-end gap-0.5">
      <RowStamp fill="var(--md-coral)" text="var(--md-paper)">
        #{rank}
      </RowStamp>
      {field != null && (
        <span className="font-mono text-[9px] text-[var(--md-ink-muted)]">
          of {field}
        </span>
      )}
    </span>
  );
}

// ---- One team row in the logged-in list — desktop data table style ----
// Fixed-width sub-lanes inside "THE RUN": REG lane → arrow → BRACKET lane → arrow
// → OUTCOME lane. Each sub-lane has an explicit width + flexShrink:0 so values
// line up vertically across all rows regardless of content length.
// All record tokens are whitespace-nowrap to prevent mid-value line breaks.
//
// Lane widths (match mockup 8TU-0):
//   REG sub-lane:     170px  (label + bold W-L + net)
//   arrow:             24px
//   BRACKET sub-lane: 110px  (label + bold W-L)
//   arrow:             24px
//   OUTCOME sub-lane: 130px  (plain text, left-aligned)
//
// TIER column: fixed 100px right-aligned, always last.
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
  const isRunnerUp = team.reachedRound === 3 && team.recordL > 0;
  const didntEnter = team.reachedRound === 0 && team.recordW === 0 && team.recordL === 0;
  const reg = regSeasonRecord(team);
  const { text: netText, positive: netPositive } = formatSignedMargin(team.seedNet);

  // Mode label for the team subtitle.
  const modeLabel =
    team.mode === "daily"
      ? team.dailyDate
        ? `Daily · ${shortDay(team.dailyDate)}`
        : "Daily"
      : team.mode === "hoopiq"
        ? "Ranked"
        : "Classic";

  // Outcome text — unified plain text across all rows; champion is bold.
  // No chips here — chips live in the TIER column only.
  const outcomeText: string = isChampion
    ? "CHAMPION"
    : isRunnerUp
      ? "LOST FINAL"
      : didntEnter
        ? "DIDN'T ENTER"
        : `OUT · ${reachedRoundLabel(team.reachedRound).toUpperCase()}`;

  const outcomeColor: string = isChampion
    ? "var(--md-ink)"
    : isRunnerUp
      ? "var(--md-ink)"
      : "var(--md-ink-muted)";

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={loading}
      className="group flex w-full items-center border-b border-[var(--md-paper-3)] px-4 py-3 text-left transition-colors hover:bg-[var(--md-paper-2)] disabled:opacity-60"
      style={isChampion ? { background: "var(--md-paper-2)" } : undefined}
    >
      {/* Crown for champion — fixed 20px slot so team name aligns */}
      <span className="mr-3 w-5 shrink-0 text-center">
        {isChampion && (
          <span style={{ color: "var(--md-yellow)", fontSize: 16 }}>♛</span>
        )}
      </span>

      {/* Team name + mode subtitle */}
      <span className="flex min-w-0 flex-[2] flex-col">
        <span
          className="font-archivo truncate leading-tight"
          style={{ fontSize: 15, fontWeight: 800, fontVariationSettings: '"wdth" 100' }}
        >
          {team.teamName}
        </span>
        <span className="font-byline text-[11px] text-[var(--md-ink-muted)]">
          {modeLabel}
        </span>
      </span>

      {/* THE RUN — fixed-width sub-lanes, all whitespace-nowrap */}
      <span className="hidden items-center font-mono text-[12px] tabular-nums sm:flex">

        {/* Sub-lane: REG record + net rating */}
        <span
          className="flex items-baseline gap-1"
          style={{ width: 170, flexShrink: 0, whiteSpace: "nowrap" }}
        >
          <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
            {team.mode === "daily" ? "DAILY" : "REG"}
          </span>
          <span className="font-bold">{reg.w}–{reg.l}</span>
          <span
            className="text-[11px]"
            style={{ color: netPositive ? "var(--md-teal)" : "var(--md-coral-deep)" }}
          >
            ({netText})
          </span>
        </span>

        {/* Arrow + BRACKET lane — hidden when team didn't enter */}
        {!didntEnter ? (
          <>
            <span
              className="text-center text-[var(--md-ink-muted)]"
              style={{ width: 24, flexShrink: 0 }}
            >
              →
            </span>
            <span
              className="flex items-baseline gap-1"
              style={{ width: 110, flexShrink: 0, whiteSpace: "nowrap" }}
            >
              <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
                BRACKET
              </span>
              <span className="font-bold">{team.recordW}–{team.recordL}</span>
            </span>
            <span
              className="text-center text-[var(--md-ink-muted)]"
              style={{ width: 24, flexShrink: 0 }}
            >
              →
            </span>
          </>
        ) : (
          /* Ghost spacer keeps outcome lane in the same x position */
          <span style={{ width: 24 + 110 + 24, flexShrink: 0 }} />
        )}

        {/* Sub-lane: outcome — plain text, consistent across all rows */}
        <span
          className="font-cond text-[12px] font-bold uppercase tracking-[0.06em]"
          style={{ width: 130, flexShrink: 0, whiteSpace: "nowrap", color: outcomeColor }}
        >
          {isChampion && <span className="mr-1">♛</span>}
          {outcomeText}
        </span>
      </span>

      {/* TIER column — fixed 100px. One consistent stamp family, right-aligned:
          an optional outcome stamp (champ / runner-up) stacked over the qualifier
          — the daily leaderboard rank for daily teams, or the season tier badge
          for Classic/Ranked. Champ omits the tier (the crown says it all). */}
      <span
        className="flex shrink-0 flex-col items-end gap-2"
        style={{ width: 100 }}
      >
        {isChampion && (
          <RowStamp fill="var(--md-yellow)" text="var(--md-ink)" title="Champion">
            ♛ CHAMP
          </RowStamp>
        )}
        {isRunnerUp && (
          <RowStamp fill="var(--md-white)" text="var(--md-ink)" title="Runner-up">
            RUNNER-UP
          </RowStamp>
        )}
        {team.mode === "daily"
          ? team.dailyRank != null && (
              <DailyRankStamp rank={team.dailyRank} field={team.dailyFieldSize} />
            )
          : !isChampion && <TierBadge seedNet={team.seedNet} size="capsule" />}
      </span>

      {loading && (
        <span className="ml-2 font-mono text-[11px] text-[var(--md-ink-muted)]">…</span>
      )}
    </button>
  );
}

// ---- Mobile team card — shown below md breakpoint ----
function TeamCard({
  team,
  onOpen,
  loading,
}: {
  team: TournamentTeamSummary;
  onOpen: () => void;
  loading: boolean;
}) {
  const isChampion = team.reachedRound === 4;
  const isRunnerUp = team.reachedRound === 3 && team.recordL > 0;
  const didntEnter = team.reachedRound === 0 && team.recordW === 0 && team.recordL === 0;
  const reg = regSeasonRecord(team);
  const { text: netText, positive: netPositive } = formatSignedMargin(team.seedNet);

  const modeLabel =
    team.mode === "daily"
      ? team.dailyDate
        ? `Daily · ${shortDay(team.dailyDate)}`
        : "Daily"
      : team.mode === "hoopiq"
        ? "Ranked"
        : "Classic";

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={loading}
      className="md-card w-full text-left p-0 overflow-hidden transition-transform hover:translate-x-[-2px] hover:translate-y-[-2px] disabled:opacity-60"
      style={
        isChampion
          ? { border: "2px solid var(--md-yellow)", boxShadow: "5px 5px 0 0 var(--md-yellow)" }
          : undefined
      }
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-4 pb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {isChampion && <span style={{ color: "var(--md-yellow)", fontSize: 16 }}>♛</span>}
            <span
              className="font-archivo truncate leading-tight"
              style={{ fontSize: 16, fontWeight: 800, fontVariationSettings: '"wdth" 100' }}
            >
              {team.teamName}
            </span>
          </div>
          <div className="mt-0.5 font-byline text-[11px] text-[var(--md-ink-muted)]">
            {modeLabel}
          </div>
        </div>
        {/* Outcome + qualifier stamps — same family as the desktop TIER lane. */}
        <div className="flex shrink-0 flex-col items-end gap-2">
          {isChampion && (
            <RowStamp fill="var(--md-yellow)" text="var(--md-ink)" title="Champion">
              ♛ CHAMP
            </RowStamp>
          )}
          {isRunnerUp && (
            <RowStamp fill="var(--md-white)" text="var(--md-ink)" title="Runner-up">
              RUNNER-UP
            </RowStamp>
          )}
          {team.mode === "daily"
            ? team.dailyRank != null && (
                <DailyRankStamp rank={team.dailyRank} field={team.dailyFieldSize} />
              )
            : !isChampion && <TierBadge seedNet={team.seedNet} size="capsule" />}
        </div>
      </div>

      {/* Reg + Bracket records */}
      <div className="flex gap-0 border-t-2 border-y-2 border-[var(--md-ink)]">
        <div className="flex-1 px-4 py-2.5">
          <div className="font-cond text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--md-ink-muted)]">Regular</div>
          <div className="mt-0.5 font-mono text-[18px] font-bold tabular-nums leading-none">
            {reg.w}–{reg.l}
          </div>
          <div
            className="mt-0.5 font-mono text-[11px] tabular-nums"
            style={{ color: netPositive ? "var(--md-teal)" : "var(--md-coral-deep)" }}
          >
            {netText}
          </div>
        </div>
        {!didntEnter && (
          <div className="flex-1 border-l-2 border-[var(--md-ink)] px-4 py-2.5">
            <div className="font-cond text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--md-ink-muted)]">Bracket</div>
            <div className="mt-0.5 font-mono text-[18px] font-bold tabular-nums leading-none">
              {team.recordW}–{team.recordL}
            </div>
          </div>
        )}
      </div>

      {/* Outcome footer */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-2.5"
        style={
          isChampion
            ? { background: "var(--md-yellow)", color: "var(--md-ink)" }
            : { background: "var(--md-paper-2)" }
        }
      >
        <span className="font-cond text-[12px] font-bold uppercase tracking-[0.06em]">
          {isChampion ? (
            "Champion · ran the table"
          ) : didntEnter ? (
            "Didn't enter"
          ) : (
            <>
              {reachedRoundLabel(team.reachedRound)}
              {team.championName ? ` · Won by ${team.championName}` : ""}
            </>
          )}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-[var(--md-ink-muted)]">
          {loading ? "Loading…" : "View →"}
        </span>
      </div>
    </button>
  );
}

// One private-tournament row in the Private tab.
function PrivateRow({ row }: { row: MyPrivateRow }) {
  const completed = row.status === "completed";
  const isChampion = completed && row.finalStatus === "Champion";
  const recW = completed ? row.finalRecordW : row.provisionalRecordW;
  const recL = completed ? row.finalRecordL : row.provisionalRecordL;
  const hasRec = recW != null && recL != null;
  const dateText =
    completed && row.finalizedAt
      ? new Date(row.finalizedAt).toLocaleDateString()
      : "Open";

  return (
    <Link
      href={`/p/${row.tournamentId}`}
      className="md-card md-card--lift flex w-full flex-col gap-2 p-4 text-left transition-transform hover:translate-x-[-2px] hover:translate-y-[-2px]"
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
          <span
            className="font-archivo min-w-0 truncate leading-tight"
            style={{ fontSize: 15, fontWeight: 800, fontVariationSettings: '"wdth" 100' }}
          >
            {row.name}
          </span>
        </span>
        <span className="font-byline text-[11px] text-[var(--md-ink-muted)] whitespace-nowrap">
          {dateText}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Capsule
          style={
            row.mode === "hoopiq"
              ? { background: "var(--md-ink)", color: "var(--md-white)" }
              : undefined
          }
        >
          {row.modeLabel}
        </Capsule>
        <Capsule>{row.size} teams</Capsule>
        {isChampion && (
          <Capsule tone="press">♛ Champion</Capsule>
        )}
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[28px] font-bold tabular-nums">
          {hasRec ? (
            <>
              {recW}&ndash;{recL}
            </>
          ) : (
            "—"
          )}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-wide text-[var(--md-blue)]">
          {completed ? "View results →" : "Open lobby →"}
        </span>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-cond text-[12px] font-semibold uppercase tracking-[0.06em]">
          {completed
            ? formatTournamentStatus(row.finalStatus)
            : formatPrivateEntryStatus(row.entryStatus)}
        </span>
        {completed &&
          (isChampion ? (
            <span className="font-mono text-[12px] text-[var(--md-teal)]">
              ♛ You won it all
            </span>
          ) : row.championName ? (
            <span className="font-mono text-[12px] text-[var(--md-ink-muted)]">
              Won by {row.championName}
            </span>
          ) : null)}
      </div>
    </Link>
  );
}

type View = "form" | "list" | "team";

export function TournamentLookup({
  onBack,
  initialTab,
  initialDaily,
  onResultActive,
}: {
  onBack?: () => void;
  initialTab?: Tab;
  // Auto-open the team for this daily date (YYYY-MM-DD) once the list loads — used
  // when arriving from a home-calendar date click (/tournament?daily=…).
  initialDaily?: string;
  // Called with true when a bracket result is being shown, false when the user
  // navigates away. The parent page uses this to suppress lookup chrome and go
  // full-width during the result view.
  onResultActive?: (active: boolean) => void;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>("form");
  // Filter off by default — land on the unfiltered "all" list unless a caller
  // explicitly deep-links to a specific tab.
  const [tab, setTab] = useState<Tab>(initialTab ?? "all");
  // Private-tab state.
  const [privateRows, setPrivateRows] = useState<MyPrivateRow[] | null>(null);
  const [privateLoading, setPrivateLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  // "Join by tournament name + PIN" form state (the private landing).
  const [joinName, setJoinName] = useState("");
  const [joinPin, setJoinPin] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  // True until we've checked for a saved session on mount.
  const [bootingSession, setBootingSession] = useState(true);

  // Form state.
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // List + detail state.
  const [lookup, setLookup] = useState<TournamentLookupResponse | null>(null);
  const [run, setRun] = useState<TournamentRunResponse | null>(null);
  const [openSummary, setOpenSummary] = useState<TournamentTeamSummary | null>(null);
  const [loadingTeamId, setLoadingTeamId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [page, setPage] = useState(0); // teams-list page (10 per page)
  const TEAMS_PER_PAGE = 10;
  const autoOpenedDaily = useRef(false); // one-shot guard for ?daily= deep-link

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
          if (!silent) setError("No team found for that name and PIN.");
          return;
        }
        const data = (await res.json()) as TournamentLookupResponse;
        saveUser({ username: uname, pin: upin });
        setCachedTeams(uname, upin, data);
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
          if (res.status === 401) clearUser();
          setPrivateRows([]);
          return;
        }
        const data = (await res.json()) as { tournaments: MyPrivateRow[] };
        saveUser({ username: uname, pin: upin });
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

  // Auto-login from a saved session.
  useEffect(() => {
    const saved = getSavedUser();
    if (!saved) {
      setBootingSession(false);
      return;
    }
    setName(saved.username);
    setPin(saved.pin);

    const cachedLookup =
      initialTab === "private" || initialDaily
        ? null
        : getCachedTeams(saved.username, saved.pin);
    if (cachedLookup) {
      setLookup(cachedLookup);
      setPage(0);
      setView("list");
      setBootingSession(false);
      void runLookup(saved.username, saved.pin, true);
      return;
    }

    const boot =
      initialTab === "private"
        ? loadPrivate(saved.username, saved.pin, true)
        : runLookup(saved.username, saved.pin, true);
    boot.finally(() => setBootingSession(false));
  }, [runLookup, loadPrivate, initialTab, initialDaily]);

  const logOut = () => {
    clearUser();
    setName("");
    setPin("");
    setPrivateRows(null);
    resetToForm();
  };

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
      saveUser({ username: name, pin });
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

  // Notify the parent page whenever the result view becomes active/inactive so it
  // can suppress the lookup chrome and go full-width for the bracket desk.
  useEffect(() => {
    onResultActive?.(view === "team");
  }, [view, onResultActive]);

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

  // Deep-link from a home-calendar date.
  useEffect(() => {
    if (autoOpenedDaily.current || !initialDaily || !lookup) return;
    autoOpenedDaily.current = true;
    const match = lookup.teams.find((t) => t.dailyDate === initialDaily);
    if (match) {
      void openTeam(match.teamId);
    } else {
      window.location.replace(`/d/${initialDaily}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookup, initialDaily]);

  // ---- Team detail view ----
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

  // ---- Teams list view ----
  if (view === "list" && (lookup || privateRows !== null)) {
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
    const totalTeams = lookup?.teams.length ?? 0;

    return (
      <div className="flex w-full flex-col gap-4">
        {/* Identity header */}
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2
              className="font-cover uppercase leading-none"
              style={{ fontSize: "clamp(36px, 8vw, 72px)", letterSpacing: "-0.02em" }}
            >
              MY TEAMS
            </h2>
            <p className="mt-1 font-byline text-[12px] text-[var(--md-ink-muted)]">
              {lookup?.name ?? name} · {totalTeams} season{totalTeams !== 1 ? "s" : ""} logged
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 font-mono text-[11px] font-bold uppercase tracking-wide text-[var(--md-blue)] underline"
            onClick={logOut}
          >
            Log out
          </button>
        </div>

        {/* Tab bar */}
        <TournamentLookupTabs tab={tab} onSelect={(t) => { setTab(t); setPage(0); }} />

        {/* Clear filter */}
        {tab !== "all" && tab !== "private" && (
          <button
            type="button"
            onClick={() => { setTab("all"); setPage(0); }}
            className="self-start font-mono text-[11px] font-bold uppercase tracking-wide text-[var(--md-blue)] underline"
          >
            Clear filter · show all
          </button>
        )}

        {listError && (
          <Notice tone="error" className="p-3 text-[13px]">
            {listError}
          </Notice>
        )}

        {/* ---- Private tab ---- */}
        {tab === "private" ? (
          <div className="flex flex-col gap-3">
            {showCreate ? (
              <PrivateTournamentCreate onCancel={() => setShowCreate(false)} />
            ) : (
              <Button
                type="button"
                variant="teal"
                onClick={() => setShowCreate(true)}
              >
                + Create private tournament
              </Button>
            )}

            {!showCreate &&
              (privateLoading ? (
                <LoadingState className="py-6 font-mono text-[13px] normal-case tracking-normal">
                  Loading your private tournaments…
                </LoadingState>
              ) : privateRows && privateRows.length > 0 ? (
                privateRows.map((r) => (
                  <PrivateRow key={r.tournamentId} row={r} />
                ))
              ) : (
                <EmptyState title="No active private tournaments">
                  Create one above, or open a friend&rsquo;s invite link.
                </EmptyState>
              ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState title="No teams yet">
            {tab === "daily"
              ? "Play a Daily Challenge to see it here."
              : "Play a Classic or Ranked season and hit Enter Tournament."}
          </EmptyState>
        ) : (
          <>
            {/* Desktop: table with column headers. Gated at md (not sm) — the
                fixed-width sub-lanes need ~740px and overflow 640–767px screens,
                which fall back to the mobile cards. */}
            <div className="hidden md:block">
              {/* Column header row */}
              <div
                className="flex items-center border-b-2 border-[var(--md-ink)] px-4 py-2"
                style={{ background: "var(--md-ink)" }}
              >
                <span className="mr-3 w-5 shrink-0" />
                <span className="flex-[2] font-cond text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--md-paper)]">
                  Team
                </span>
                {/* "The Run" header spans the same fixed total width as the
                    sub-lanes in each TeamRow (170+24+110+24+130 = 458px). */}
                <span
                  className="hidden font-cond text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--md-paper)] sm:block"
                  style={{ width: 458, flexShrink: 0 }}
                >
                  The Run
                </span>
                {/* TIER header: fixed 100px matching the data rows */}
                <span
                  className="font-cond text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--md-paper)]"
                  style={{ width: 100, flexShrink: 0, textAlign: "right" }}
                >
                  Tier
                </span>
              </div>
              <div
                className="border-x-2 border-b-2 border-[var(--md-ink)]"
                style={{ background: "var(--md-white)" }}
              >
                {shown.map((team) => (
                  <TeamRow
                    key={team.teamId}
                    team={team}
                    onOpen={() => openTeam(team.teamId)}
                    loading={loadingTeamId === team.teamId}
                  />
                ))}
              </div>
            </div>

            {/* Mobile + small-tablet (< md): cards */}
            <div className="flex flex-col gap-3 md:hidden">
              {shown.map((team) => (
                <TeamCard
                  key={team.teamId}
                  team={team}
                  onOpen={() => openTeam(team.teamId)}
                  loading={loadingTeamId === team.teamId}
                />
              ))}
            </div>
          </>
        )}

        {tab !== "private" && pageCount > 1 && (
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              ← Newer
            </Button>
            <span className="font-mono text-[11px] uppercase tracking-wide text-[var(--md-ink-muted)]">
              Page {safePage + 1} of {pageCount}
            </span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              Older →
            </Button>
          </div>
        )}
      </div>
    );
  }

  // While restoring a saved session, show a loader.
  if (bootingSession) {
    return (
      <div className="mx-auto w-full py-16 text-center font-mono text-[13px] text-[var(--md-ink-muted)]">
        Loading your teams…
      </div>
    );
  }

  // ---- Private landing (logged-out) ----
  if (tab === "private") {
    return (
      <div className="flex w-full flex-col gap-4">
        <TournamentLookupTabs tab={tab} onSelect={setTab} />

        {showCreate ? (
          <PrivateTournamentCreate onCancel={() => setShowCreate(false)} />
        ) : (
          <>
            <div className="md-card md-card--lift flex flex-col gap-3 p-5">
              <div>
                <div
                  className="font-archivo leading-tight"
                  style={{ fontSize: 20, fontWeight: 800, fontVariationSettings: '"wdth" 88' }}
                >
                  Private tournament
                </div>
                <p className="mt-1 text-[13px] text-[var(--md-ink-muted)]">
                  Host an invite-only bracket for your friends, or open an invite
                  link someone shared with you.
                </p>
              </div>
              <Button
                type="button"
                variant="teal"
                onClick={() => setShowCreate(true)}
              >
                + Create private tournament
              </Button>
            </div>

            <form onSubmit={submitJoin} className="md-card flex flex-col gap-3 p-5">
              <div>
                <div className="font-cond text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--md-ink-muted)]">
                  Join a private tournament
                </div>
                <p className="mt-1 text-[13px] text-[var(--md-ink-muted)]">
                  Enter the tournament&rsquo;s name + PIN to grab a slot and
                  start building your team.
                </p>
              </div>

              <TournamentCredentialFields
                name={joinName}
                pin={joinPin}
                onName={setJoinName}
                onPin={setJoinPin}
              />

              <div className="border-t-2 border-dashed border-[var(--md-ink)] pt-3">
                <span className="font-cond text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--md-ink-muted)]">
                  Your account (to enter as)
                </span>
              </div>
              <AccountFields
                name={name}
                pin={pin}
                onName={setName}
                onPin={setPin}
                pinLabel="Your PIN"
              />

              {joinError && (
                <Notice tone="error" className="text-[13px]">
                  {joinError}
                </Notice>
              )}
              <Button
                type="submit"
                variant="teal"
                disabled={
                  !validateTournamentName(joinName).ok ||
                  !validatePin(joinPin) ||
                  !nameCheck.ok ||
                  !pinOk ||
                  joining
                }
              >
                {joining ? "Joining…" : "Join & start building"}
              </Button>
            </form>

            <form
              onSubmit={submitPrivateLogin}
              className="md-card flex flex-col gap-3 p-5"
            >
              <div className="font-cond text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--md-ink-muted)]">
                Already joined one?
              </div>
              <AccountFields
                name={name}
                pin={pin}
                onName={setName}
                onPin={setPin}
              />
              {error && (
                <Notice tone="error" className="text-[13px]">
                  {error}
                </Notice>
              )}
              <Button
                type="submit"
                variant="secondary"
                disabled={!canSubmit}
              >
                {submitting ? "Checking…" : "Show my private tournaments"}
              </Button>
            </form>
          </>
        )}

        {onBack && (
          <Button type="button" variant="secondary" onClick={onBack}>
            Back
          </Button>
        )}
      </div>
    );
  }

  // ---- Form view (default / logged-out lookup) ----
  return (
    <div className="flex w-full flex-col gap-6">
      {/* Tab bar above the form */}
      <TournamentLookupTabs tab={tab} onSelect={setTab} />

      {/* The "FIND YOUR TEAMS" lookup card — ink-spread cover card */}
      <form
        onSubmit={submit}
        className="md-card md-card--cover w-full max-w-lg flex flex-col gap-4 p-5"
        style={{ background: "var(--md-ink)", color: "var(--md-white)" }}
      >
        {/* Kicker */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-[15px]" style={{ color: "var(--md-yellow)" }}>⌕</span>
          <span className="font-cond text-[13px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--md-white)" }}>
            Find Your Teams
          </span>
        </div>

        <AccountFields
          name={name}
          pin={pin}
          onName={setName}
          onPin={setPin}
          dark
          nameLabel="Your Name"
        />

        {error && (
          <Notice tone="error" className="bg-transparent text-[13px]">
            {error}
          </Notice>
        )}

        <Button
          type="submit"
          size="lg"
          fullWidth
          className="justify-between"
          style={{ background: "var(--md-coral)", color: "var(--md-white)", borderColor: "var(--md-ink)" }}
          disabled={!canSubmit}
        >
          <span>{submitting ? "CHECKING…" : "LOOK UP MY TEAMS"}</span>
          <span>→</span>
        </Button>

        <p className="font-mono text-[11px] italic" style={{ color: "var(--md-paper-3)" }}>
          🔒 Your name + PIN is your account — same one as the Daily.
        </p>
      </form>

      {onBack && (
        <Button type="button" variant="secondary" className="self-start" onClick={onBack}>
          Back
        </Button>
      )}
    </div>
  );
}
