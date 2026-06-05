"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicPlayer, SimPick, TournamentRunResponse } from "@/lib/types";
import { canFill, type SlotKind } from "@/lib/positions";
import { SlotMachine } from "@/components/SlotMachine";
import { PlayerList } from "@/components/PlayerList";
import { LineupBoard, type LineupEntry } from "@/components/LineupBoard";
import { TournamentResults } from "@/components/TournamentResults";
import {
  validateName,
  validatePin,
  NAME_MAX_LEN,
} from "@/lib/tournamentValidation";

// The starting five board — identical to the main game.
const KINDS: SlotKind[] = ["G", "FLEX", "W", "FLEX", "B"];

// Down-weight a decade each time it's used so the draft spreads across eras.
// (Copied from app/page.tsx — same mechanic.)
function pickWeightedDecade(
  pool: number[],
  usage: Record<number, number>,
): number {
  const weights = pool.map((d) => Math.pow(0.1, usage[d] ?? 0));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

type Step = "draft" | "sixth" | "finalize";

export function TournamentEntry({ onBack }: { onBack: () => void }) {
  // ----- league data -----
  const [decades, setDecades] = useState<number[]>([]);
  const [booting, setBooting] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ----- starting-five draft state (mirrors app/page.tsx, free-play) -----
  const [lineup, setLineup] = useState<(LineupEntry | null)[]>(
    KINDS.map(() => null),
  );
  const [currentDecade, setCurrentDecade] = useState<number | null>(null);
  const [currentTeam, setCurrentTeam] = useState<string | null>(null);
  const [pending, setPending] = useState<PublicPlayer | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [teamSkips, setTeamSkips] = useState(1);
  const [rolling, setRolling] = useState(false);
  const [rollError, setRollError] = useState<string | null>(null);

  // ----- sixth man (bench) -----
  const [sixth, setSixth] = useState<LineupEntry | null>(null);

  // ----- finalize -----
  const [captainSlot, setCaptainSlot] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [nameTaken, setNameTaken] = useState(false);
  const [result, setResult] = useState<TournamentRunResponse | null>(null);

  const rollSeq = useRef(0);
  const rollActive = useRef(false);
  const lineupRef = useRef(lineup);
  lineupRef.current = lineup;

  const draftedCount = lineup.filter(Boolean).length;
  const draftDone = draftedCount === KINDS.length;
  const step: Step = !draftDone ? "draft" : !sixth ? "sixth" : "finalize";

  const draftedIds = [
    ...lineup.filter(Boolean).map((e) => (e as LineupEntry).player.entity_id),
    ...(sixth ? [sixth.player.entity_id] : []),
  ];
  const usedTeams = [
    ...lineup.filter(Boolean).map((e) => (e as LineupEntry).team),
    ...(sixth ? [sixth.team] : []),
  ];

  // ----- load decades on mount -----
  useEffect(() => {
    let active = true;
    setBooting(true);
    fetch("/api/decades")
      .then(async (r) => {
        if (!r.ok) throw new Error("load failed");
        return r.json();
      })
      .then((d) => {
        if (active) {
          setDecades((d.decades as number[]) ?? []);
          setBooting(false);
        }
      })
      .catch(() => {
        if (active) {
          setLoadError("Couldn't load the league. Try again.");
          setBooting(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  // Roll a team for the next round. `forSixth` rolls the bench round (no team
  // exclusion against decade weighting differs only in commit handling).
  const rollRound = useCallback(
    (opts: { decade?: number; excludeTeam?: string } = {}) => {
      if (decades.length === 0) return;
      const committed = lineupRef.current.filter(Boolean) as LineupEntry[];
      const usage: Record<number, number> = {};
      for (const e of committed) usage[e.decade] = (usage[e.decade] ?? 0) + 1;
      const excludes = [
        ...new Set([
          ...committed.map((e) => e.team),
          ...(opts.excludeTeam ? [opts.excludeTeam] : []),
        ]),
      ];
      const myId = ++rollSeq.current;
      rollActive.current = true;
      setRolling(true);
      setPending(null);
      setSelected(null);
      const decade = opts.decade ?? pickWeightedDecade(decades, usage);
      setCurrentDecade(decade);
      setCurrentTeam(null);
      const url = `/api/slot?decade=${decade}${
        excludes.length ? `&exclude=${excludes.join(",")}` : ""
      }`;
      fetch(url)
        .then(async (res) => {
          if (!res.ok) throw new Error("roll failed");
          return res.json();
        })
        .then((data) => {
          if (rollSeq.current !== myId) return;
          setCurrentTeam(data.team);
        })
        .catch(() => {
          if (rollSeq.current === myId)
            setRollError("Couldn't roll a team. Try again.");
        })
        .finally(() => {
          if (rollSeq.current === myId) {
            rollActive.current = false;
            setRolling(false);
          }
        });
    },
    [decades],
  );

  // Auto-roll the next round while drafting (starters) or the bench round.
  useEffect(() => {
    if (booting || decades.length === 0) return;
    if (result) return;
    if (step === "finalize") return;
    if (currentDecade !== null || rollActive.current) return;
    rollRound({});
  }, [booting, decades, result, step, currentDecade, rollRound]);

  // ----- draft helpers (starters) -----
  const draftable = useCallback(
    (p: PublicPlayer) => {
      if (draftedIds.includes(p.entity_id)) return false;
      if (step === "sixth") return true; // bench: any unused player
      return KINDS.some((kind, i) => lineup[i] === null && canFill(p.positions, kind));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lineup, sixth, step],
  );

  const commitRoll = () => {
    setPending(null);
    setSelected(null);
    setCurrentDecade(null);
    setCurrentTeam(null);
  };

  const placeAt = (player: PublicPlayer, i: number) => {
    if (currentTeam === null || currentDecade === null) return;
    const entry: LineupEntry = { player, team: currentTeam, decade: currentDecade };
    setLineup((prev) => prev.map((s, idx) => (idx === i ? entry : s)));
    commitRoll();
  };

  const pick = (player: PublicPlayer) => {
    if (step === "sixth") {
      if (currentTeam === null || currentDecade === null) return;
      setSixth({ player, team: currentTeam, decade: currentDecade });
      commitRoll();
      return;
    }
    const eligible = KINDS.map((kind, i) => ({ kind, i }))
      .filter(({ i }) => lineup[i] === null)
      .filter(({ kind }) => canFill(player.positions, kind))
      .map(({ i }) => i);
    if (eligible.length === 0) return;
    if (eligible.length === 1) placeAt(player, eligible[0]);
    else setPending(player);
  };

  // Slot clicks: place pending, or move/swap committed starters (same as game).
  const onSlotClick = (i: number) => {
    if (pending) {
      if (lineup[i] === null && canFill(pending.positions, KINDS[i]))
        placeAt(pending, i);
      return;
    }
    if (selected === null) {
      if (lineup[i]) setSelected(i);
      return;
    }
    if (i === selected) {
      setSelected(null);
      return;
    }
    const sel = lineup[selected] as LineupEntry;
    const target = lineup[i];
    if (target === null) {
      if (canFill(sel.player.positions, KINDS[i])) {
        setLineup((prev) =>
          prev.map((s, idx) => (idx === i ? sel : idx === selected ? null : s)),
        );
        setSelected(null);
      }
    } else if (
      canFill(sel.player.positions, KINDS[i]) &&
      canFill(target.player.positions, KINDS[selected])
    ) {
      setLineup((prev) =>
        prev.map((s, idx) => (idx === i ? sel : idx === selected ? target : s)),
      );
      setSelected(null);
    }
  };

  let targets: number[] = [];
  if (pending) {
    targets = KINDS.map((kind, i) => ({ kind, i }))
      .filter(({ i }) => lineup[i] === null)
      .filter(({ kind }) => canFill(pending.positions, kind))
      .map(({ i }) => i);
  } else if (selected !== null) {
    const sel = lineup[selected] as LineupEntry;
    targets = KINDS.map((_, i) => i).filter((i) => {
      if (i === selected) return false;
      const t = lineup[i];
      if (t === null) return canFill(sel.player.positions, KINDS[i]);
      return (
        canFill(sel.player.positions, KINDS[i]) &&
        canFill(t.player.positions, KINDS[selected])
      );
    });
  }

  const teamSkip = () => {
    if (teamSkips <= 0 || currentDecade === null || pending || rolling) return;
    setTeamSkips((n) => n - 1);
    rollRound({ decade: currentDecade, excludeTeam: currentTeam ?? undefined });
  };

  // ----- submit -----
  const nameCheck = validateName(name);
  const pinOk = validatePin(pin);
  const canSubmit =
    draftDone &&
    sixth !== null &&
    captainSlot !== null &&
    nameCheck.ok &&
    pinOk &&
    !submitting;

  const submit = async () => {
    if (!canSubmit || captainSlot === null || !sixth) return;
    setSubmitting(true);
    setSubmitError(null);
    setNameTaken(false);
    try {
      const roster: SimPick[] = lineup
        .map((e, i) =>
          e
            ? {
                entity_id: e.player.entity_id,
                team: e.team,
                decade: e.decade,
                slot: i,
              }
            : null,
        )
        .filter((p): p is SimPick => p !== null);
      const res = await fetch("/api/tournament/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          pin,
          roster,
          captainSlot,
          sixthPick: {
            entity_id: sixth.player.entity_id,
            team: sixth.team,
            decade: sixth.decade,
          },
        }),
      });
      if (res.status === 409) {
        setNameTaken(true);
        const data = await res.json().catch(() => ({}));
        setSubmitError(data?.error ?? "That name is taken — pick another.");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSubmitError(data?.error ?? "Couldn't enter the tournament.");
        return;
      }
      const data = (await res.json()) as TournamentRunResponse;
      setResult(data);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setSubmitError("Couldn't enter the tournament right now. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ===================== render =====================

  if (result) {
    return <TournamentResults data={result} onReset={onBack} />;
  }

  if (booting) {
    return (
      <div className="py-20 text-center font-display text-sm text-[var(--md-ink-muted)]">
        Spinning up the league…
      </div>
    );
  }

  if (loadError && decades.length === 0) {
    return (
      <div className="md-card md-card--lift mx-auto max-w-md p-5 text-center">
        <p className="font-display text-base font-bold">
          Couldn&rsquo;t start the tournament.
        </p>
        <p className="mt-1 text-[13px] text-[var(--md-ink-muted)]">{loadError}</p>
        <button className="md-btn md-btn--sm md-btn--secondary mt-4" onClick={onBack}>
          Back to menu
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Lineup board + a sixth-man slot beside it. */}
      <div>
        <div className="mb-2 font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
          Your lineup · {draftedCount}/{KINDS.length} starters
          {sixth ? " + 6th" : ""}
        </div>
        <LineupBoard
          kinds={KINDS}
          entries={lineup}
          targets={pending || selected !== null ? targets : []}
          selected={selected}
          onSlotClick={onSlotClick}
        />

        {/* Sixth-man chip (once drafted). */}
        {sixth && (
          <div className="md-card mt-2 flex items-center justify-between gap-2 p-2">
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
              onClick={() => {
                setSixth(null);
                commitRoll();
              }}
            >
              Re-pick
            </button>
          </div>
        )}
      </div>

      {rollError && (
        <div className="md-card border-[var(--md-coral)] p-3">
          <p className="font-display text-sm">{rollError}</p>
        </div>
      )}

      {/* ---- DRAFT: starters or the bench round ---- */}
      {(step === "draft" || step === "sixth") && (
        <div className="md-card md-card--lift flex flex-col items-center gap-4 p-4 sm:p-5">
          <div className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
            {step === "sixth"
              ? "Round 6 of 6 · Sixth Man (any position)"
              : `Round ${draftedCount + 1} of 6`}
          </div>

          {pending ? (
            <div className="flex flex-col items-center gap-2">
              <div className="font-display text-sm">
                Where does{" "}
                <span className="font-bold">{pending.player_name}</span> play?
              </div>
              <div className="font-display text-[11px] text-[var(--md-ink-muted)]">
                Tap a glowing slot to place him.
              </div>
              <button
                className="md-btn md-btn--sm md-btn--secondary"
                onClick={() => setPending(null)}
              >
                Cancel pick
              </button>
            </div>
          ) : (
            <>
              {currentDecade !== null && (
                <SlotMachine team={currentTeam} decade={currentDecade} size="lg" />
              )}
              {step === "draft" && (
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    className="md-btn md-btn--sm md-btn--secondary"
                    onClick={teamSkip}
                    disabled={teamSkips <= 0 || rolling}
                  >
                    ↻ Team skip ({teamSkips})
                  </button>
                </div>
              )}
              <div className="w-full">
                {currentTeam && currentDecade !== null && !rolling ? (
                  <PlayerList
                    team={currentTeam}
                    decade={currentDecade}
                    mode="classic"
                    allowRespin
                    draftable={draftable}
                    onPick={pick}
                    onNoneEligible={() =>
                      rollRound({
                        decade: currentDecade ?? undefined,
                        excludeTeam: currentTeam ?? undefined,
                      })
                    }
                  />
                ) : (
                  <div className="py-8 text-center font-display text-sm text-[var(--md-ink-muted)]">
                    Spinning the reel…
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ---- FINALIZE: captain + name + pin ---- */}
      {step === "finalize" && (
        <div className="md-card md-card--lift flex flex-col gap-4 p-4 sm:p-5">
          <div className="font-display text-xl font-bold">
            Pick your captain
          </div>
          <p className="-mt-2 text-[13px] text-[var(--md-ink-muted)]">
            Tap one of your five starters. Your captain anchors the team.
          </p>
          <div className="grid grid-cols-5 gap-1.5">
            {lineup.map((e, i) => {
              const entry = e as LineupEntry;
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
                    {entry.team} &rsquo;
                    {String(entry.player.best_season).slice(2)}
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

          <div className="border-t-2 border-[var(--md-ink)] pt-4">
            <div className="font-display text-xl font-bold">Claim your team</div>
            <div className="mt-3 flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
                  Team name
                </span>
                <input
                  className="md-input md-input--name"
                  value={name}
                  maxLength={NAME_MAX_LEN}
                  autoCapitalize="characters"
                  onChange={(e) => {
                    setName(e.target.value.toUpperCase());
                    setNameTaken(false);
                  }}
                  placeholder="MJ23"
                  style={
                    nameTaken
                      ? { borderColor: "var(--md-coral)" }
                      : undefined
                  }
                />
                <span className="font-display text-[11px] text-[var(--md-ink-muted)]">
                  {name.length > 0 && !nameCheck.ok
                    ? nameCheck.reason
                    : "Allowed: A–Z, 0–9, !@#$%^&*() · 8 max"}
                </span>
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
                <span className="font-display text-[11px] text-[var(--md-ink-muted)]">
                  {pin.length > 0 && !pinOk
                    ? "PIN must be 4–6 digits"
                    : "Remembers your team so you can check back."}
                </span>
              </label>
            </div>
          </div>

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
              {submitting ? "Running…" : "Enter the tournament"}
            </button>
            <button
              className="md-btn md-btn--lg md-btn--secondary"
              onClick={onBack}
            >
              Cancel
            </button>
          </div>
          {captainSlot === null && (
            <p className="text-center font-display text-[11px] text-[var(--md-ink-muted)]">
              Pick a captain to continue.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
