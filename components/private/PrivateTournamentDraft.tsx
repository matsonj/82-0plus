"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  GameMode,
  PublicPlayer,
  SimResult,
  SimRosterLine,
} from "@/lib/types";
import { type SlotKind } from "@/lib/positions";
import { type LineupEntry } from "@/components/LineupBoard";
import { LineupDraftBoard } from "@/components/LineupDraftBoard";
import { ResultsPanel } from "@/components/ResultsPanel";
import { TournamentEntry } from "@/components/TournamentEntry";
import { Button, ButtonLink, Capsule } from "@/components/ui";
import { EntryCountdown } from "@/components/private/EntryCountdown";
import { SITE_URL } from "@/lib/site";
import type { PrivateBoard } from "@/lib/privateBoard";
import type { PrivateMode } from "@/lib/privateTournament";
import {
  makeDraftKey,
  savePrivateDraft,
  loadPrivateDraft,
  clearPrivateDraft,
  type PrivateDraftData,
  type DraftPick,
} from "@/lib/privateDraftStorage";
import type { PrivatePartialResponse } from "@/components/private/types";
import { draftSourceKey, type DraftRosterMap } from "@/lib/draftSources";

// The five lineup positions, board order [G,FLEX,W,FLEX,B].
const KINDS: SlotKind[] = ["G", "FLEX", "W", "FLEX", "B"];

type Step = "draft" | "interstitial" | "finalize" | "done";

// The private draft now COMPOSES the shared building blocks instead of
// reinventing them:
//   • the five-starter draft → <LineupDraftBoard> (same engine the main game uses),
//     in lockOnPick mode (picks commit immediately, rearrange-only — no cancelable
//     pending to lose on refresh);
//   • the interstitial → <ResultsPanel> (the same post-selection screen the main
//     game shows), with an "Add sixth man & captain" button instead of "Enter";
//   • the "add sixth man + captain + submit" finalize → <TournamentEntry> with a
//     privateConfig (the EXACT same component the main game's tournament entry
//     uses, so private behaves identically — including letting you change your
//     sixth man).
// The board's five starter slots are a fixed REVEAL ORDER; because lockOnPick
// commits each pick in order, the next reveal is simply board.slots[placedCount].

function listMode(mode: PrivateMode): GameMode {
  return mode === "classic" ? "classic" : "hoopiq";
}

export function PrivateTournamentDraft({
  tournamentId,
  entryId,
  board,
  mode,
  name,
  pin,
  rosters,
  entryExpiresAt,
  onComplete,
}: {
  tournamentId: string;
  entryId: string;
  board: PrivateBoard;
  mode: PrivateMode;
  name: string;
  pin: string;
  rosters?: DraftRosterMap;
  // ISO deadline for the 10-minute completion window (PUBLIC only; null/undefined
  // for private tournaments → no countdown, no auto-kick).
  entryExpiresAt?: string | null;
  onComplete: () => void;
}) {
  const gameMode = listMode(mode);
  const draftKey = makeDraftKey({ tournamentId, entryId, name, pin });

  // The five starters indexed by LINEUP slot (0..4). Each entry's (team, decade)
  // equals the board reveal it was drafted from, so the five set-match the board.
  const [lineup, setLineup] = useState<(LineupEntry | null)[]>([
    null, null, null, null, null,
  ]);
  const [step, setStep] = useState<Step>("draft");

  // The interstitial's full season result (from /partial) so we can render the
  // shared ResultsPanel.
  const [partial, setPartial] = useState<{
    result: SimResult;
    roster: SimRosterLine[];
  } | null>(null);
  const [savingPartial, setSavingPartial] = useState(false);
  const [partialError, setPartialError] = useState<string | null>(null);
  // Flipped when the per-entry 10-minute window closes (PUBLIC only) — the entrant
  // was kicked and their slot freed. Server is the source of truth; this drives the
  // in-tab "you were removed" screen.
  const [removed, setRemoved] = useState(false);

  // Don't persist before the initial IndexedDB load resolves.
  const hydrated = useRef(false);

  // ---- Per-entry completion deadline. ---- Runs across EVERY step (draft,
  // interstitial, finalize) so a slow drafter is caught even mid-TournamentEntry,
  // unlike a countdown that only lives in one subtree. entryExpiresAt is null for
  // private tournaments, so this is a no-op there.
  useEffect(() => {
    if (!entryExpiresAt) return;
    const ms = Date.parse(entryExpiresAt) - Date.now();
    if (ms <= 0) {
      setRemoved(true);
      return;
    }
    const id = setTimeout(() => setRemoved(true), ms);
    return () => clearTimeout(id);
  }, [entryExpiresAt]);

  // Discard the local draft once removed (hygiene — a rejoin mints a new entryId
  // and draft key anyway, so the dead draft is already orphaned).
  useEffect(() => {
    if (removed) void clearPrivateDraft(draftKey);
  }, [removed, draftKey]);

  // ---- Resume from IndexedDB on mount. ----
  useEffect(() => {
    let active = true;
    (async () => {
      const saved = await loadPrivateDraft(draftKey);
      if (!saved) {
        if (active) hydrated.current = true;
        return;
      }
      // We persisted only ids/team/decade for the five; re-fetch each involved
      // roster to recover the full PublicPlayer the board card needs. (The sixth
      // man / captain / team name are owned by TournamentEntry now and not
      // persisted — a resume re-enters at the draft and re-runs /partial.)
      const combos = new Map<string, { team: string; decade: number }>();
      for (const p of saved.picks) combos.set(`${p.team}|${p.decade}`, p);
      const loadedRosters = new Map<string, PublicPlayer[]>(
        Object.entries(rosters ?? {}),
      );
      await Promise.all(
        [...combos.values()].map(async (c) => {
          const key = draftSourceKey(c);
          if (loadedRosters.has(key)) return;
          try {
            const r = await fetch(
              `/api/players?team=${c.team}&decade=${c.decade}&mode=${gameMode}`,
            );
            if (r.ok) {
              const d = await r.json();
              loadedRosters.set(key, (d.players as PublicPlayer[]) ?? []);
            }
          } catch {
            /* a missing roster leaves a stub */
          }
        }),
      );
      if (!active) {
        hydrated.current = true;
        return;
      }
      const findPlayer = (id: string, team: string, decade: number): PublicPlayer =>
        loadedRosters
          .get(draftSourceKey({ team, decade }))
          ?.find((p) => p.entity_id === id) ??
        stubPlayer(id);

      const next: (LineupEntry | null)[] = [null, null, null, null, null];
      for (const p of saved.picks) {
        const slot =
          typeof p.slot === "number" && p.slot >= 0 && p.slot < KINDS.length
            ? p.slot
            : -1;
        if (slot >= 0 && next[slot] === null) {
          next[slot] = {
            player: findPlayer(p.entity_id, p.team, p.decade),
            team: p.team,
            decade: p.decade,
            receipt: "",
          };
        }
      }
      setLineup(next);
      // The interstitial result + sixth/captain/team name aren't persisted, so a
      // resume always lands on the DRAFT (the board is fully placed → the "See
      // your record" button re-runs /partial → finalize via TournamentEntry).
      setStep("draft");
      hydrated.current = true;
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, gameMode, rosters]);

  // ---- Persist on every change (after the initial load). ----
  useEffect(() => {
    if (!hydrated.current) return;
    const picks: DraftPick[] = lineup
      .map((e, i): DraftPick | null =>
        e
          ? {
              entity_id: e.player.entity_id,
              team: e.team,
              decade: e.decade,
              reveal: board.slots.findIndex(
                (s) => s.team === e.team && s.decade === e.decade,
              ),
              slot: i,
            }
          : null,
      )
      .filter((p): p is DraftPick => p !== null);
    // Only the five picks persist now; the sixth/captain/team name are owned by
    // TournamentEntry at finalize and aren't resumed (kept null/empty here).
    const data: PrivateDraftData = {
      picks,
      captainSlot: null,
      sixthPick: null,
      teamName: "",
      step: step === "done" ? "finalize" : step,
    };
    void savePrivateDraft(draftKey, data);
  }, [lineup, step, draftKey, board.slots]);

  const placedCount = lineup.filter(Boolean).length;
  const allPlaced = placedCount === KINDS.length;
  // The board's five starter slots are a reveal order; the next reveal is the slot
  // at index placedCount (lockOnPick commits picks strictly in order).
  const reveal = placedCount < KINDS.length ? board.slots[placedCount] : null;
  const revealPools = useMemo(
    () => ({
      teams: board.slots.map((slot) => slot.team),
      decades: board.slots.map((slot) => slot.decade),
    }),
    [board.slots],
  );

  // ---- Interstitial: persist the five server-side + get the full season. ----
  const goToInterstitial = useCallback(async () => {
    setSavingPartial(true);
    setPartialError(null);
    try {
      const roster = lineup
        .map((e, i) =>
          e ? { entity_id: e.player.entity_id, team: e.team, decade: e.decade, slot: i } : null,
        )
        .filter((p): p is { entity_id: string; team: string; decade: number; slot: number } => p !== null);
      const res = await fetch("/api/private-tournament/partial", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // The captain + team name are chosen later (in TournamentEntry's
        // finalize); /partial only needs the five to compute the season record.
        body: JSON.stringify({
          name,
          pin,
          tournamentId,
          roster,
        }),
      });
      if (!res.ok) {
        // 410 Gone = the 10-minute window expired and the server removed us.
        if (res.status === 410) {
          setRemoved(true);
          return;
        }
        const d = await res.json().catch(() => ({}));
        setPartialError(d?.error ?? "Couldn't save your draft.");
        return;
      }
      const data = (await res.json()) as PrivatePartialResponse;
      setPartial({ result: data.result, roster: data.roster });
      setStep("interstitial");
    } catch {
      setPartialError("Couldn't save your draft right now. Try again.");
    } finally {
      setSavingPartial(false);
    }
  }, [lineup, name, pin, tournamentId]);

  // ---- Finalize submitted: TournamentEntry posted to the private submit
  // endpoint; clear the draft + advance to "done", then notify the parent. ----
  const handleSubmitted = useCallback(async () => {
    await clearPrivateDraft(draftKey);
    setStep("done");
    onComplete();
  }, [draftKey, onComplete]);

  // ===================== render =====================

  // A compact per-entry countdown, shown atop every drafting step (PUBLIC only).
  const deadlineBanner = entryExpiresAt ? (
    <div className="flex items-center justify-between gap-3 border-2 border-[var(--md-coral)] bg-[var(--md-white)] px-3 py-2">
      <span className="font-cond text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--md-ink-muted)]">
        Lock in your six before the clock runs out
      </span>
      <span className="font-cond text-[14px] font-bold tabular-nums text-[var(--md-coral)]">
        ⏱ <EntryCountdown expiresAt={entryExpiresAt} compact />
      </span>
    </div>
  ) : null;

  // Successful submit wins over a just-crossed deadline.
  if (step === "done") {
    return (
      <div className="md-card md-card--lift mx-auto flex max-w-md flex-col items-center gap-3 p-5 text-center">
        <Capsule tone="teal">Team submitted</Capsule>
        <p className="font-display text-sm text-[var(--md-ink-muted)]">
          Your six are locked in. Watch this tournament for the final bracket.
        </p>
        <ButtonLink href={`/p/${tournamentId}`} size="lg" variant="teal">
          Back to the tournament
        </ButtonLink>
      </div>
    );
  }

  // ---- REMOVED: the 10-minute window closed and the slot was freed. ----
  if (removed) {
    return (
      <div className="md-card md-card--lift mx-auto flex max-w-md flex-col items-center gap-3 p-5 text-center">
        <Capsule tone="coral">Time&rsquo;s up</Capsule>
        <p className="font-display text-sm text-[var(--md-ink-muted)]">
          Your 10-minute window closed and your slot was freed. If there&rsquo;s
          still room, you can rejoin and draft again.
        </p>
        <Button size="lg" variant="teal" onClick={onComplete}>
          Back to the tournament
        </Button>
      </div>
    );
  }

  // ---- INTERSTITIAL: the shared post-selection screen, with a "continue" CTA. ----
  if (step === "interstitial" && partial) {
    return (
      <div className="flex flex-col gap-4">
        {deadlineBanner}
        <ResultsPanel
          roster={partial.roster}
          result={partial.result}
          shareText={`Daily82 🏀 my ${partial.result.wins}-${partial.result.losses} private-tournament five`}
          shareLink={`${SITE_URL}/p/${tournamentId}`}
          modeLabel={mode === "hoopiq" ? "Private - Ranked" : "Private - Classic"}
          mode={gameMode}
          onReset={() => setStep("draft")}
          onEnterTournament={() => setStep("finalize")}
          entryCtaLabel="Add sixth man & captain"
          entryRequiresEligible={false}
          entryOnly
        />
      </div>
    );
  }

  // ---- FINALIZE: add sixth man + captain + team name + submit. This now REUSES
  // the main game's <TournamentEntry> (with a privateConfig) so private behaves
  // identically — including letting you change your sixth man. The five starters
  // are fully placed by the time we reach finalize. ----
  if (step === "finalize") {
    return (
      <div className="flex flex-col gap-4">
        {deadlineBanner}
        <TournamentEntry
          initialLineup={lineup}
          mode={mode}
          dailyBench={board.benchSlot}
          preloadedRosters={rosters}
          privateConfig={{
            tournamentId,
            name,
            pin,
            onSubmitted: handleSubmitted,
          }}
          onBack={() => setStep("interstitial")}
        />
      </div>
    );
  }

  // ---- DRAFT: the shared draft engine, board-reveal sourced. Same slot-choice
  // ("where does he play?" + glowing slots) as the main game; no Cancel, so a
  // chosen player can't be swapped for a different one (rearrange-only). ----
  return (
    <div className="flex flex-col gap-5">
      {deadlineBanner}
      <LineupDraftBoard
        kinds={KINDS}
        lineup={lineup}
        setLineup={setLineup}
        source={reveal ? { team: reveal.team, decade: reveal.decade, receipt: "" } : null}
        sourcePlayers={reveal ? rosters?.[draftSourceKey(reveal)] ?? null : null}
        sourcePlayersMode={reveal ? gameMode : null}
        sourcePools={revealPools}
        mode={gameMode}
        allowCancelPending={false}
        allowRespin={false}
        spinOnMount
        onConsumeSource={() => {}}
        headerLabel="Your starting five"
        counterLabel={(placed, total) => `Reveal ${placed + 1} of ${total}`}
      />

      {allPlaced && (
        <div className="md-card md-card--lift flex flex-col items-center gap-3 p-5 text-center">
          <div className="font-display text-base font-bold">Starting five locked.</div>
          {partialError && (
            <div className="border-2 border-[var(--md-coral)] bg-[var(--md-white)] p-2 font-display text-sm text-[var(--md-coral)]">
              {partialError}
            </div>
          )}
          <Button
            size="lg"
            variant="teal"
            disabled={savingPartial}
            onClick={goToInterstitial}
          >
            {savingPartial ? "Saving…" : "See your record"}
          </Button>
        </div>
      )}
    </div>
  );
}

// Minimal PublicPlayer for resuming a draft (we only stored ids/team/decade/slot);
// on resume we re-fetch each roster to recover full players, falling back to this.
function stubPlayer(entity_id: string): PublicPlayer {
  return {
    entity_id,
    player_name: "—",
    best_season: 0,
    positions: [],
    pos: null,
    allDef: null,
    mpg: null,
    pts: null,
    reb: null,
    ast: null,
    stl: null,
    blk: null,
  };
}
