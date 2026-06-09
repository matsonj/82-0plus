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

// A placed starter. `team`/`decade` are the board REVEAL (team, decade) the player
// was drafted from; `reveal` is that reveal's board-slot index (0..4). The lineup
// POSITION a Placed occupies is its index in the `placed` array — NOT `reveal`.
// This mirrors the Daily/free-play flow: board slots are a reveal order, and each
// pick can land in any eligible lineup slot (and rearrange afterwards).
interface Placed {
  player: PublicPlayer;
  team: string;
  decade: number;
  reveal: number;
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

  // The five starters indexed by LINEUP slot (0..4 = [G,FLEX,W,FLEX,B]). Each
  // entry remembers (via `reveal`) which board reveal it was drafted from, so the
  // five always set-match the board while the user freely arranges positions.
  const [placed, setPlaced] = useState<(Placed | null)[]>([
    null, null, null, null, null,
  ]);
  // Which board reveal (team, decade) is currently being drafted (0..4). Reveals
  // advance in board order; a reveal is "decided" once a Placed carries its index.
  const [activeReveal, setActiveReveal] = useState(0);
  // A just-picked player from the active reveal, awaiting placement into an
  // eligible lineup slot (Daily-style). null when nothing is mid-placement.
  const [pending, setPending] = useState<PublicPlayer | null>(null);
  // The lineup slot currently selected for a rearrange move/swap, or null.
  const [selected, setSelected] = useState<number | null>(null);

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

      // Restore each pick into the LINEUP slot it occupied, tagging it with the
      // board reveal it came from. `slot` is the lineup position; `reveal` is the
      // board reveal index — both persisted. Tolerate a legacy save (pre-reveal
      // field) by deriving `reveal` from the (team, decade) board match.
      const next: (Placed | null)[] = [null, null, null, null, null];
      const decided = new Set<number>(); // board reveals already drafted
      for (const p of saved.picks) {
        const reveal =
          typeof p.reveal === "number"
            ? p.reveal
            : board.slots.findIndex(
                (b) => b.team === p.team && b.decade === p.decade,
              );
        const lineupSlot =
          typeof p.slot === "number" && p.slot >= 0 && p.slot < KINDS.length
            ? p.slot
            : reveal;
        if (reveal >= 0 && lineupSlot >= 0 && next[lineupSlot] === null) {
          next[lineupSlot] = {
            player: findPlayer(p.entity_id, p.team, p.decade),
            team: p.team,
            decade: p.decade,
            reveal,
          };
          decided.add(reveal);
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
          reveal: KINDS.length, // bench reveal — not one of the five starters
        });
      }
      // Resume on the first board reveal not yet decided (or the last if all are).
      let firstUndecided = board.slots.findIndex((_, i) => !decided.has(i));
      if (firstUndecided < 0) firstUndecided = KINDS.length - 1;
      setActiveReveal(firstUndecided);
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
    // Persist each pick with BOTH its chosen lineup `slot` (its index in `placed`)
    // and the board `reveal` it came from — so a resume restores the exact lineup
    // arrangement, not just reveal order.
    const picks: DraftPick[] = placed
      .map((p, i): DraftPick | null =>
        p
          ? {
              entity_id: p.player.entity_id,
              team: p.team,
              decade: p.decade,
              reveal: p.reveal,
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
  }, [placed, captainSlot, sixth, teamName, step, draftKey]);

  // Ids already used (so PlayerList greys repeats). Distinct teams are enforced
  // by the board (each slot is a distinct team), so only id-dedupe is needed.
  const usedIds = [
    ...placed.filter(Boolean).map((p) => (p as Placed).player.entity_id),
    ...(sixth ? [sixth.player.entity_id] : []),
  ];

  // A player from the active reveal is draftable if he's unused AND fits at least
  // one currently OPEN lineup slot — exactly the Daily draftable() rule. The board
  // reveal no longer forces a lineup position; placement (below) picks the slot.
  const draftable = useCallback(
    (p: PublicPlayer) => {
      if (usedIds.includes(p.entity_id)) return false;
      return KINDS.some((kind, i) => placed[i] === null && canFill(p.positions, kind));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [placed, sixth],
  );

  const benchDraftable = useCallback(
    (p: PublicPlayer) => !usedIds.includes(p.entity_id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [placed, sixth],
  );

  // Place `player` (from the active reveal) into lineup slot `i`, tagging it with
  // the board reveal it came from. Clears any mid-placement / selection state and
  // advances to the next undecided board reveal.
  const placeAt = (player: PublicPlayer, i: number) => {
    const reveal = board.slots[activeReveal];
    if (!reveal) return;
    const next = placed.map((p, idx) =>
      idx === i
        ? { player, team: reveal.team, decade: reveal.decade, reveal: activeReveal }
        : p,
    );
    setPlaced(next);
    setPending(null);
    setSelected(null);
    // Advance to the first board reveal not yet decided (else stay on the last).
    const decided = new Set(
      next.filter(Boolean).map((p) => (p as Placed).reveal),
    );
    let nextReveal = board.slots.findIndex((_, idx) => !decided.has(idx));
    if (nextReveal < 0) nextReveal = KINDS.length - 1;
    setActiveReveal(nextReveal);
  };

  // Pick from the active reveal: auto-place if exactly one open lineup slot fits,
  // else stash as `pending` so the user taps a glowing slot (Daily behavior).
  const pickStarter = (player: PublicPlayer) => {
    const eligible = KINDS.map((kind, i) => ({ kind, i }))
      .filter(({ i }) => placed[i] === null)
      .filter(({ kind }) => canFill(player.positions, kind))
      .map(({ i }) => i);
    if (eligible.length === 0) return;
    if (eligible.length === 1) placeAt(player, eligible[0]);
    else setPending(player);
  };

  // Rearrange-only-after-lock: tapping lineup slots moves/swaps ALREADY-PLACED
  // players between legal positions (preserving each player's board `reveal`).
  // There is no path to re-open a decided reveal's PlayerList, so a chosen player
  // can't be swapped out for a different one — only repositioned. Mirrors Daily's
  // onSlotClick exactly (place pending → select → move/swap).
  const onSlotClick = (i: number) => {
    if (pending) {
      if (placed[i] === null && canFill(pending.positions, KINDS[i]))
        placeAt(pending, i);
      return;
    }
    if (selected === null) {
      if (placed[i]) setSelected(i);
      return;
    }
    if (i === selected) {
      setSelected(null);
      return;
    }
    const sel = placed[selected] as Placed;
    const target = placed[i];
    if (target === null) {
      if (canFill(sel.player.positions, KINDS[i])) {
        setPlaced((prev) =>
          prev.map((s, idx) => (idx === i ? sel : idx === selected ? null : s)),
        );
        setSelected(null);
      }
    } else if (
      canFill(sel.player.positions, KINDS[i]) &&
      canFill(target.player.positions, KINDS[selected])
    ) {
      setPlaced((prev) =>
        prev.map((s, idx) => (idx === i ? sel : idx === selected ? target : s)),
      );
      setSelected(null);
    }
  };

  const placedCount = placed.filter(Boolean).length;
  const allPlaced = placedCount === KINDS.length;

  // Glowing target slots: where the pending pick may land, or where the selected
  // player may move/swap. Same derivation as Daily's `targets`.
  let targets: number[] = [];
  if (pending) {
    targets = KINDS.map((kind, i) => ({ kind, i }))
      .filter(({ i }) => placed[i] === null)
      .filter(({ kind }) => canFill(pending.positions, kind))
      .map(({ i }) => i);
  } else if (selected !== null) {
    const sel = placed[selected] as Placed;
    targets = KINDS.map((_, i) => i).filter((i) => {
      if (i === selected) return false;
      const t = placed[i];
      if (t === null) return canFill(sel.player.positions, KINDS[i]);
      return (
        canFill(sel.player.positions, KINDS[i]) &&
        canFill(t.player.positions, KINDS[selected])
      );
    });
  }

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
                  setSixth({
                    player: p,
                    team: bench.team,
                    decade: bench.decade,
                    reveal: KINDS.length, // bench reveal (not one of the five)
                  })
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

  // ---- DRAFT: step-by-step team/era reveal + free placement (Daily-style). ----
  const reveal = board.slots[activeReveal];
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
        {/* The board is a lineup, not a reveal order: placement + rearrange happen
            here (Daily onSlotClick). Picks lock once chosen — the only freedom is
            moving/swapping already-placed players between legal slots. */}
        <LineupBoard
          kinds={KINDS}
          entries={lineupEntries}
          targets={targets}
          selected={selected}
          onSlotClick={onSlotClick}
        />
        <div className="mt-2 text-center font-display text-[11px] text-[var(--md-ink-muted)]">
          {pending
            ? "Tap a glowing slot to place him."
            : selected !== null
              ? "Tap a glowing slot to move him (or tap him again to cancel)."
              : allPlaced
                ? "Tap a player, then a slot, to rearrange."
                : "Tip: tap a drafted player then a slot to move him."}
        </div>
      </div>

      {/* Awaiting placement of a just-picked player into an eligible slot. */}
      {pending && (
        <div className="md-card md-card--lift flex flex-col items-center gap-3 p-4">
          <div className="font-display text-sm">
            Where does{" "}
            <span className="font-bold">{pending.player_name}</span> play?
          </div>
          <button
            className="md-btn md-btn--sm md-btn--secondary"
            onClick={() => setPending(null)}
          >
            Cancel pick
          </button>
        </div>
      )}

      {!allPlaced && !pending && reveal && (
        <div className="md-card md-card--lift flex flex-col items-center gap-4 p-4 sm:p-5">
          <div className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
            Reveal {activeReveal + 1} of {KINDS.length}
          </div>
          <SlotMachine team={reveal.team} decade={reveal.decade} size="lg" />
          <div className="w-full">
            <PlayerList
              team={reveal.team}
              decade={reveal.decade}
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
// ids/team/decade/slot/reveal). On resume we re-fetch each involved roster to
// recover the full PublicPlayer; this stub is the fallback for a roster that
// couldn't be fetched, keeping the board legible (id-only) without a full row.
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
