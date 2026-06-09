"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { GameMode, PublicPlayer } from "@/lib/types";
import { canFill, type SlotKind } from "@/lib/positions";
import { SlotMachine } from "@/components/SlotMachine";
import { PlayerList } from "@/components/PlayerList";
import { LineupBoard, type LineupEntry } from "@/components/LineupBoard";
import {
  validateTeamName,
  NAME_MAX_LEN,
} from "@/lib/tournamentValidation";
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

// The five starter lineup positions, board order [G,FLEX,W,FLEX,B] (matches the
// daily/private board KINDS and lib/rosterParse KINDS).
const KINDS: SlotKind[] = ["G", "FLEX", "W", "FLEX", "B"];

type Step = "draft" | "interstitial" | "finalize" | "done";

// A placed starter: which board slot (team/decade) it came from + the player.
interface Placed {
  player: PublicPlayer;
  team: string;
  decade: number;
}

// Map a board's mode to PlayerList stat visibility (Ranked hides stats).
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
  // Called once the entry is submitted (so the parent can re-fetch the GET).
  onComplete: () => void;
}) {
  const gameMode = listMode(mode);
  const draftKey = makeDraftKey({ tournamentId, entryId, name, pin });

  // The five starters, one per board slot (index 0..4 maps to board.slots[i]).
  // Each starter is locked once chosen (rearranging swaps the *lineup* mapping,
  // not the board slot they were drafted from).
  const [placed, setPlaced] = useState<(Placed | null)[]>([
    null, null, null, null, null,
  ]);
  // The current board slot being drafted (0..4), advancing as picks land.
  const [activeSlot, setActiveSlot] = useState(0);

  const [step, setStep] = useState<Step>("draft");
  const [captainSlot, setCaptainSlot] = useState<number | null>(null);
  const [sixth, setSixth] = useState<Placed | null>(null);
  const [teamName, setTeamName] = useState("");

  // Interstitial reg-season record (from the partial save).
  const [reg, setReg] = useState<{ w: number; l: number } | null>(null);
  const [partialError, setPartialError] = useState<string | null>(null);
  const [savingPartial, setSavingPartial] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Don't persist before the initial IndexedDB load resolves (avoids clobbering
  // saved progress with the empty initial state).
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
      // We persisted only ids/team/decade, so re-fetch each involved (team,decade)
      // roster to recover the full PublicPlayer the board card + captain grid need.
      // PlayerList caches/fetches independently; this is just for the board view.
      const combos = new Map<string, { team: string; decade: number }>();
      for (const p of saved.picks) combos.set(`${p.team}|${p.decade}`, p);
      if (saved.sixthPick) {
        combos.set(`${saved.sixthPick.team}|${saved.sixthPick.decade}`, saved.sixthPick);
      }
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
            /* a missing roster just leaves a stub — the user can re-pick */
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

      const next: (Placed | null)[] = [null, null, null, null, null];
      for (const p of saved.picks) {
        const slotIdx = board.slots.findIndex(
          (b) => b.team === p.team && b.decade === p.decade,
        );
        if (slotIdx >= 0) {
          next[slotIdx] = {
            player: findPlayer(p.entity_id, p.team, p.decade),
            team: p.team,
            decade: p.decade,
          };
        }
      }
      setPlaced(next);
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
        });
      }
      const firstEmpty = next.findIndex((p) => p === null);
      setActiveSlot(firstEmpty >= 0 ? firstEmpty : KINDS.length - 1);
      setStep(saved.step);
      hydrated.current = true;
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  // ---- Persist progress on every change (after the initial load). ----
  useEffect(() => {
    if (!hydrated.current) return;
    const picks: DraftPick[] = placed
      .map((p, i): DraftPick | null =>
        p ? { entity_id: p.player.entity_id, team: p.team, decade: p.decade, slot: i } : null,
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
  }, [placed, captainSlot, sixth, teamName, step, draftKey]);

  // Ids already used (so PlayerList greys repeats). Distinct teams are enforced
  // by the board (each slot is a distinct team), so only id-dedupe is needed.
  const usedIds = [
    ...placed.filter(Boolean).map((p) => (p as Placed).player.entity_id),
    ...(sixth ? [sixth.player.entity_id] : []),
  ];

  const draftable = useCallback(
    (p: PublicPlayer) => {
      // Only allow players eligible for the active board slot's lineup position.
      if (!canFill(p.positions, KINDS[activeSlot])) return false;
      return !usedIds.includes(p.entity_id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeSlot, placed, sixth],
  );

  const benchDraftable = useCallback(
    (p: PublicPlayer) => !usedIds.includes(p.entity_id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [placed, sixth],
  );

  const pickStarter = (player: PublicPlayer) => {
    const slot = board.slots[activeSlot];
    const next = placed.map((p, i) =>
      i === activeSlot ? { player, team: slot.team, decade: slot.decade } : p,
    );
    setPlaced(next);
    // Advance to the first still-empty slot (or stay on the last if all filled).
    const firstEmpty = next.findIndex((p) => p === null);
    setActiveSlot(firstEmpty >= 0 ? firstEmpty : KINDS.length - 1);
  };

  const placedCount = placed.filter(Boolean).length;
  const allPlaced = placedCount === KINDS.length;

  // ---- Interstitial: persist the five server-side + get the reg-season record. ----
  const goToInterstitial = useCallback(async () => {
    setSavingPartial(true);
    setPartialError(null);
    try {
      const roster = placed
        .map((p, i) =>
          p
            ? { entity_id: p.player.entity_id, team: p.team, decade: p.decade, slot: i }
            : null,
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
      setReg({ w: data.regW, l: data.regL });
      setStep("interstitial");
    } catch {
      setPartialError("Couldn't save your draft right now. Try again.");
    } finally {
      setSavingPartial(false);
    }
  }, [placed, captainSlot, teamName, name, pin, tournamentId]);

  // ---- Submit: the full six + captain + team name. ----
  const teamNameCheck = validateTeamName(teamName);
  const canSubmit =
    sixth !== null && captainSlot !== null && teamNameCheck.ok && !submitting;

  const submit = async () => {
    if (!canSubmit || captainSlot === null || !sixth) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const roster = placed
        .map((p, i) =>
          p ? { entity_id: p.player.entity_id, team: p.team, decade: p.decade, slot: i } : null,
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

  // The board entries for LineupBoard: a placed Placed → LineupEntry (receipt "").
  const lineupEntries: (LineupEntry | null)[] = placed.map((p) =>
    p ? { player: p.player, team: p.team, decade: p.decade, receipt: "" } : null,
  );

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

  // ---- INTERSTITIAL: reg-season record + Continue. ----
  if (step === "interstitial") {
    return (
      <div className="md-card md-card--lift mx-auto flex max-w-md flex-col items-center gap-4 p-5 text-center">
        <div className="md-capsule">Regular season</div>
        <div className="font-display text-sm text-[var(--md-ink-muted)]">
          Your starting five would go
        </div>
        <div className="font-display text-5xl font-bold tabular-nums">
          {reg ? `${reg.w}–${reg.l}` : "—"}
        </div>
        <p className="font-display text-[13px] text-[var(--md-ink-muted)]">
          Now add your sixth man and pick a captain to lock the team in.
        </p>
        <button className="md-btn md-btn--lg md-btn--teal" onClick={() => setStep("finalize")}>
          Continue
        </button>
      </div>
    );
  }

  // ---- FINALIZE: sixth man + captain + team name + submit. ----
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
            entries={lineupEntries}
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
          {sixth && (
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
          )}
          {!sixth && (
            <div className="w-full">
              <PlayerList
                team={bench.team}
                decade={bench.decade}
                mode={gameMode}
                allowRespin={false}
                draftable={benchDraftable}
                onPick={(p) =>
                  setSixth({ player: p, team: bench.team, decade: bench.decade })
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
          <div className="grid grid-cols-5 gap-1.5">
            {placed.map((p, i) => {
              const entry = p as Placed;
              const isCap = captainSlot === i;
              return (
                <button
                  key={i}
                  onClick={() => setCaptainSlot(i)}
                  className="md-card flex min-h-[80px] flex-col p-1.5 text-left transition-transform"
                  style={{
                    background: isCap ? "var(--md-yellow)" : "var(--md-white)",
                    borderWidth: isCap ? "3px" : "2px",
                    boxShadow: isCap ? "var(--md-shadow-sm)" : "none",
                    cursor: "pointer",
                  }}
                >
                  <span
                    className="self-start border border-[var(--md-ink)] px-1 font-display text-[9px] font-bold"
                    style={{ background: "var(--md-yellow)" }}
                  >
                    {KINDS[i] === "FLEX" ? "FLEX" : KINDS[i]}
                  </span>
                  <span className="mt-1 font-display text-[10px] font-bold leading-tight break-words">
                    {entry.player.player_name}
                  </span>
                  <span className="mt-auto font-display text-[9px] text-[var(--md-orange-deep)]">
                    {entry.team} &rsquo;{String(entry.player.best_season).slice(2)}
                  </span>
                  {isCap && (
                    <span className="font-display text-[9px] font-bold">
                      ★ CAPTAIN
                    </span>
                  )}
                </button>
              );
            })}
          </div>

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
                  e.target.value
                    .toUpperCase()
                    .replace(/[’`]/g, "'")
                    .replace(/[^A-Z ']/g, ""),
                )
              }
              placeholder="DREAMTEAM"
              style={{
                background: "var(--md-paper-2)",
                boxShadow: "var(--md-shadow-md)",
              }}
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
            <button
              className="md-btn md-btn--lg md-btn--teal"
              disabled={!canSubmit}
              onClick={submit}
            >
              {submitting ? "Submitting…" : "Submit team"}
            </button>
            <button
              className="md-btn md-btn--lg md-btn--secondary"
              onClick={() => setStep("interstitial")}
            >
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- DRAFT: step-by-step starter reveal. ----
  const slot = board.slots[activeSlot];
  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
            Your starting five
          </span>
          <span className="font-display text-[11px] text-[var(--md-ink-muted)]">
            {placedCount}/{KINDS.length} drafted
          </span>
        </div>
        <LineupBoard
          kinds={KINDS}
          entries={lineupEntries}
          targets={allPlaced ? [] : [activeSlot]}
          selected={null}
          onSlotClick={(i) => {
            // Tap a filled slot to re-pick it (jump the active slot there).
            if (placed[i]) setActiveSlot(i);
          }}
        />
      </div>

      {!allPlaced && slot && (
        <div className="md-card md-card--lift flex flex-col items-center gap-4 p-4 sm:p-5">
          <div className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
            Slot {activeSlot + 1} · {KINDS[activeSlot] === "FLEX" ? "FLEX" : KINDS[activeSlot]}
          </div>
          <SlotMachine team={slot.team} decade={slot.decade} size="lg" />
          <div className="w-full">
            <PlayerList
              team={slot.team}
              decade={slot.decade}
              mode={gameMode}
              allowRespin={false}
              draftable={draftable}
              onPick={pickStarter}
              onNoneEligible={() => {}}
            />
          </div>
        </div>
      )}

      {allPlaced && (
        <div className="md-card md-card--lift flex flex-col items-center gap-3 p-5 text-center">
          <div className="font-display text-base font-bold">
            Starting five locked.
          </div>
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

// A minimal PublicPlayer used when resuming a draft from IndexedDB (we only saved
// ids/team/decade). PlayerList re-fetches the full roster; the board card just
// needs name/positions/best_season, which fill in once the user re-confirms — but
// on resume we don't have them, so this stub keeps the board legible (id-only).
// In practice resume lands the user back on the draft step where they re-pick.
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
