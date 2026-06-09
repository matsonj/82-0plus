"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type {
  GameMode,
  PublicPlayer,
  SimResult,
  SimRosterLine,
} from "@/lib/types";
import { type SlotKind } from "@/lib/positions";
import { SlotMachine } from "@/components/SlotMachine";
import { PlayerList } from "@/components/PlayerList";
import { LineupBoard, type LineupEntry } from "@/components/LineupBoard";
import { LineupDraftBoard } from "@/components/LineupDraftBoard";
import { ResultsPanel } from "@/components/ResultsPanel";
import { CaptainPicker } from "@/components/CaptainPicker";
import { validateTeamName, NAME_MAX_LEN } from "@/lib/tournamentValidation";
import { SITE_URL } from "@/lib/site";
import type { PrivateBoard, PrivateSlot } from "@/lib/privateBoard";
import type { PrivateMode } from "@/lib/privateTournament";
import {
  makeDraftKey,
  savePrivateDraft,
  loadPrivateDraft,
  clearPrivateDraft,
  type PrivateDraftData,
  type DraftPick,
} from "@/lib/privateDraftStorage";
import type {
  PrivatePartialResponse,
  PrivateSubmitResponse,
} from "@/components/private/types";

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
//   • the captain grid → <CaptainPicker> (shared with TournamentEntry).
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
  onComplete,
}: {
  tournamentId: string;
  entryId: string;
  board: PrivateBoard;
  mode: PrivateMode;
  name: string;
  pin: string;
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
  const [captainSlot, setCaptainSlot] = useState<number | null>(null);
  const [sixth, setSixth] = useState<LineupEntry | null>(null);
  const [teamName, setTeamName] = useState("");

  // The interstitial's full season result (from /partial) so we can render the
  // shared ResultsPanel.
  const [partial, setPartial] = useState<{
    result: SimResult;
    roster: SimRosterLine[];
  } | null>(null);
  const [savingPartial, setSavingPartial] = useState(false);
  const [partialError, setPartialError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Don't persist before the initial IndexedDB load resolves.
  const hydrated = useRef(false);

  // ---- Resume from IndexedDB on mount. ----
  useEffect(() => {
    let active = true;
    (async () => {
      const saved = await loadPrivateDraft(draftKey);
      if (!saved) {
        if (active) hydrated.current = true;
        return;
      }
      // We persisted only ids/team/decade; re-fetch each involved roster to recover
      // the full PublicPlayer the board card + captain grid need.
      const combos = new Map<string, { team: string; decade: number }>();
      for (const p of saved.picks) combos.set(`${p.team}|${p.decade}`, p);
      if (saved.sixthPick)
        combos.set(`${saved.sixthPick.team}|${saved.sixthPick.decade}`, saved.sixthPick);
      const rosters = new Map<string, PublicPlayer[]>();
      await Promise.all(
        [...combos.values()].map(async (c) => {
          try {
            const r = await fetch(
              `/api/players?team=${c.team}&decade=${c.decade}&mode=classic`,
            );
            if (r.ok) {
              const d = await r.json();
              rosters.set(`${c.team}|${c.decade}`, (d.players as PublicPlayer[]) ?? []);
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
        rosters.get(`${team}|${decade}`)?.find((p) => p.entity_id === id) ??
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
      setCaptainSlot(saved.captainSlot);
      setTeamName(saved.teamName);
      if (saved.sixthPick) {
        setSixth({
          player: findPlayer(
            saved.sixthPick.entity_id,
            saved.sixthPick.team,
            saved.sixthPick.decade,
          ),
          team: saved.sixthPick.team,
          decade: saved.sixthPick.decade,
          receipt: "",
        });
      }
      // The interstitial result isn't persisted, so resume to the draft (the board
      // is fully placed → the "See your record" button re-runs /partial). Finalize
      // restores directly (it needs only lineup + sixth + captain).
      setStep(saved.step === "interstitial" ? "draft" : saved.step);
      hydrated.current = true;
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

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
    const data: PrivateDraftData = {
      picks,
      captainSlot,
      sixthPick: sixth
        ? { entity_id: sixth.player.entity_id, team: sixth.team, decade: sixth.decade }
        : null,
      teamName,
      step: step === "done" ? "finalize" : step,
    };
    void savePrivateDraft(draftKey, data);
  }, [lineup, captainSlot, sixth, teamName, step, draftKey, board.slots]);

  const placedCount = lineup.filter(Boolean).length;
  const allPlaced = placedCount === KINDS.length;
  // The board's five starter slots are a reveal order; the next reveal is the slot
  // at index placedCount (lockOnPick commits picks strictly in order).
  const reveal = placedCount < KINDS.length ? board.slots[placedCount] : null;

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
        body: JSON.stringify({
          name,
          pin,
          tournamentId,
          roster,
          captainSlot: captainSlot ?? undefined,
          teamName: teamName || undefined,
        }),
      });
      if (!res.ok) {
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
  }, [lineup, captainSlot, teamName, name, pin, tournamentId]);

  // ---- Submit: the full six + captain + team name. ----
  const teamNameCheck = validateTeamName(teamName);
  const canSubmit =
    sixth !== null && captainSlot !== null && teamNameCheck.ok && !submitting;

  const submit = async () => {
    if (!canSubmit || captainSlot === null || !sixth) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const roster = lineup
        .map((e, i) =>
          e ? { entity_id: e.player.entity_id, team: e.team, decade: e.decade, slot: i } : null,
        )
        .filter((p): p is { entity_id: string; team: string; decade: number; slot: number } => p !== null);
      const res = await fetch("/api/private-tournament/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          pin,
          tournamentId,
          roster,
          captainSlot,
          sixthPick: {
            entity_id: sixth.player.entity_id,
            team: sixth.team,
            decade: sixth.decade,
          },
          teamName,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setSubmitError(d?.error ?? "Couldn't submit your team.");
        return;
      }
      (await res.json()) as PrivateSubmitResponse;
      await clearPrivateDraft(draftKey);
      setStep("done");
      onComplete();
    } catch {
      setSubmitError("Couldn't submit your team right now. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const usedIds = [
    ...lineup.filter(Boolean).map((e) => (e as LineupEntry).player.entity_id),
    ...(sixth ? [sixth.player.entity_id] : []),
  ];
  const benchDraftable = (p: PublicPlayer) => !usedIds.includes(p.entity_id);

  // ===================== render =====================

  if (step === "done") {
    return (
      <div className="md-card md-card--lift mx-auto flex max-w-md flex-col items-center gap-3 p-5 text-center">
        <div className="md-capsule md-capsule--teal">Team submitted</div>
        <p className="font-display text-sm text-[var(--md-ink-muted)]">
          Your six are locked in. Watch this tournament for the final bracket.
        </p>
        <Link href={`/p/${tournamentId}`} className="md-btn md-btn--lg md-btn--teal">
          Back to the tournament
        </Link>
      </div>
    );
  }

  // ---- INTERSTITIAL: the shared post-selection screen, with a "continue" CTA. ----
  if (step === "interstitial" && partial) {
    return (
      <ResultsPanel
        roster={partial.roster}
        result={partial.result}
        shareText={`82-0+ 🏀 my ${partial.result.wins}-${partial.result.losses} private-tournament five`}
        shareLink={`${SITE_URL}/p/${tournamentId}`}
        modeLabel={mode === "hoopiq" ? "Private - Ranked" : "Private - Classic"}
        mode={gameMode}
        onReset={() => setStep("draft")}
        onEnterTournament={() => setStep("finalize")}
        entryCtaLabel="Add sixth man & captain"
        entryRequiresEligible={false}
        entryOnly
      />
    );
  }

  // ---- FINALIZE: sixth man (fixed bench) + captain + team name + submit. ----
  if (step === "finalize") {
    const bench: PrivateSlot = board.benchSlot;
    return (
      <div className="flex flex-col gap-5">
        <div>
          <div className="mb-2 font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
            Your starting five
          </div>
          <LineupBoard
            kinds={KINDS}
            entries={lineup}
            targets={[]}
            selected={null}
            onSlotClick={() => {}}
          />
        </div>

        {/* Sixth man — from the board's fixed bench slot. */}
        <div className="md-card md-card--lift flex flex-col items-center gap-4 p-4 sm:p-5">
          <div className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
            Draft your Sixth Man · bench slot
          </div>
          <SlotMachine team={bench.team} decade={bench.decade} size="lg" />
          {sixth ? (
            <div className="md-card flex w-full items-center justify-between gap-2 p-2">
              <div className="flex flex-col">
                <span className="font-display text-[10px] font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
                  Sixth Man
                </span>
                <span className="font-display text-sm font-bold">
                  {sixth.player.player_name}
                </span>
                <span className="font-display text-[11px] text-[var(--md-orange-deep)]">
                  {sixth.team} &rsquo;{String(sixth.player.best_season).slice(2)}
                </span>
              </div>
              <button
                className="md-btn md-btn--sm md-btn--secondary"
                onClick={() => setSixth(null)}
              >
                Change
              </button>
            </div>
          ) : (
            <div className="w-full">
              <PlayerList
                team={bench.team}
                decade={bench.decade}
                mode={gameMode}
                allowRespin={false}
                draftable={benchDraftable}
                onPick={(p) =>
                  setSixth({ player: p, team: bench.team, decade: bench.decade, receipt: "" })
                }
                onNoneEligible={() => {}}
              />
            </div>
          )}
        </div>

        {/* Captain. */}
        <div className="md-card md-card--lift flex flex-col gap-4 p-4 sm:p-5">
          <div className="font-display text-xl font-bold">Pick your captain</div>
          <p className="-mt-2 text-[13px] text-[var(--md-ink-muted)]">
            Tap one of your five starters.
          </p>
          <CaptainPicker
            kinds={KINDS}
            entries={lineup}
            value={captainSlot}
            onChange={setCaptainSlot}
          />

          <label className="flex flex-col gap-1">
            <span className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
              ✎ Team name
            </span>
            <input
              className="md-input md-input--name"
              value={teamName}
              maxLength={NAME_MAX_LEN}
              autoCapitalize="characters"
              onChange={(e) =>
                setTeamName(
                  e.target.value.toUpperCase().replace(/[’`]/g, "'").replace(/[^A-Z ']/g, ""),
                )
              }
              placeholder="DREAMTEAM"
              style={{ background: "var(--md-paper-2)", boxShadow: "var(--md-shadow-md)" }}
            />
            <span className="font-display text-[11px] text-[var(--md-ink-muted)]">
              {teamName.length > 0 && !teamNameCheck.ok
                ? teamNameCheck.reason
                : "This team's name · letters, spaces & ' · 16 max"}
            </span>
          </label>

          {submitError && (
            <div className="border-2 border-[var(--md-coral)] bg-[var(--md-white)] p-2 font-display text-sm text-[var(--md-coral)]">
              {submitError}
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-2">
            <button className="md-btn md-btn--lg md-btn--teal" disabled={!canSubmit} onClick={submit}>
              {submitting ? "Submitting…" : "Submit team"}
            </button>
            <button
              className="md-btn md-btn--lg md-btn--secondary"
              onClick={() => (partial ? setStep("interstitial") : setStep("draft"))}
            >
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- DRAFT: the shared draft engine, board-reveal sourced, lock-on-pick. ----
  return (
    <div className="flex flex-col gap-5">
      <LineupDraftBoard
        kinds={KINDS}
        lineup={lineup}
        setLineup={setLineup}
        source={reveal ? { team: reveal.team, decade: reveal.decade, receipt: "" } : null}
        mode={gameMode}
        lockOnPick
        allowRespin={false}
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
          <button
            className="md-btn md-btn--lg md-btn--teal"
            disabled={savingPartial}
            onClick={goToInterstitial}
          >
            {savingPartial ? "Saving…" : "See your record"}
          </button>
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
