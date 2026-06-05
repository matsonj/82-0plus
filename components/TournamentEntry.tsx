"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  GameMode,
  PublicPlayer,
  SimPick,
  TournamentRunResponse,
} from "@/lib/types";
import { type SlotKind } from "@/lib/positions";
import { SlotMachine } from "@/components/SlotMachine";
import { PlayerList } from "@/components/PlayerList";
import { LineupBoard, type LineupEntry } from "@/components/LineupBoard";
import { TournamentResults } from "@/components/TournamentResults";
import {
  validateName,
  validatePin,
  NAME_MAX_LEN,
} from "@/lib/tournamentValidation";

// The starting five board — identical to the main game. The five are carried in
// from the just-played Classic/HoopIQ game and locked; the tournament only adds
// a sixth man + a captain on top.
const KINDS: SlotKind[] = ["G", "FLEX", "W", "FLEX", "B"];

// Down-weight a decade each time it's used so the bench roll lands in a fresh era
// (copied from app/page.tsx — same mechanic).
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

type Step = "sixth" | "finalize";

export function TournamentEntry({
  initialLineup,
  mode,
  onBack,
}: {
  initialLineup: (LineupEntry | null)[];
  mode: GameMode;
  onBack: () => void;
}) {
  // ----- league data (for the bench roll) -----
  const [decades, setDecades] = useState<number[]>([]);
  const [booting, setBooting] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ----- the starting five, carried in from the just-played game (locked) -----
  const lineup = initialLineup;
  const starters = lineup.filter(Boolean) as LineupEntry[];

  // ----- sixth man (bench round) -----
  const [sixth, setSixth] = useState<LineupEntry | null>(null);
  const [currentDecade, setCurrentDecade] = useState<number | null>(null);
  const [currentTeam, setCurrentTeam] = useState<string | null>(null);
  const [teamSkips, setTeamSkips] = useState(1);
  const [rolling, setRolling] = useState(false);
  const [rollError, setRollError] = useState<string | null>(null);

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

  const step: Step = sixth ? "finalize" : "sixth";

  // Players/teams already on the roster (so the bench roll never repeats them).
  const usedIds = [
    ...starters.map((e) => e.player.entity_id),
    ...(sixth ? [sixth.player.entity_id] : []),
  ];
  const usedTeams = [
    ...starters.map((e) => e.team),
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

  // Roll a team for the bench round. Excludes every team already on the roster
  // and down-weights eras the five already cover.
  const rollRound = useCallback(
    (opts: { decade?: number; excludeTeam?: string } = {}) => {
      if (decades.length === 0) return;
      const usage: Record<number, number> = {};
      for (const e of starters) usage[e.decade] = (usage[e.decade] ?? 0) + 1;
      const excludes = [
        ...new Set([
          ...usedTeams,
          ...(opts.excludeTeam ? [opts.excludeTeam] : []),
        ]),
      ];
      const myId = ++rollSeq.current;
      rollActive.current = true;
      setRolling(true);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [decades],
  );

  // Auto-roll the bench round until a sixth man is chosen.
  useEffect(() => {
    if (booting || decades.length === 0 || result) return;
    if (step !== "sixth") return;
    if (currentDecade !== null || rollActive.current) return;
    rollRound({});
  }, [booting, decades, result, step, currentDecade, rollRound]);

  const draftable = useCallback(
    (p: PublicPlayer) => !usedIds.includes(p.entity_id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sixth],
  );

  const pickSixth = (player: PublicPlayer) => {
    if (currentTeam === null || currentDecade === null) return;
    setSixth({ player, team: currentTeam, decade: currentDecade });
    setCurrentDecade(null);
    setCurrentTeam(null);
  };

  const repickSixth = () => {
    setSixth(null);
    setCurrentDecade(null);
    setCurrentTeam(null);
  };

  const teamSkip = () => {
    if (teamSkips <= 0 || currentDecade === null || rolling) return;
    setTeamSkips((n) => n - 1);
    rollRound({ decade: currentDecade, excludeTeam: currentTeam ?? undefined });
  };

  // ----- submit -----
  const nameCheck = validateName(name);
  const pinOk = validatePin(pin);
  const canSubmit =
    sixth !== null && captainSlot !== null && nameCheck.ok && pinOk && !submitting;

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
          mode,
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
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* The locked starting five, plus the sixth-man chip once chosen. */}
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
            Your starting five
          </span>
          <span
            className="md-capsule"
            style={
              mode === "hoopiq"
                ? { background: "var(--md-ink)", color: "var(--md-white)" }
                : undefined
            }
          >
            {mode === "hoopiq" ? "HoopIQ" : "Classic"} Tournament
          </span>
        </div>
        <LineupBoard
          kinds={KINDS}
          entries={lineup}
          targets={[]}
          selected={null}
          onSlotClick={() => {}}
        />

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
              onClick={repickSixth}
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

      {/* ---- SIXTH MAN: the bench round ---- */}
      {step === "sixth" && (
        <div className="md-card md-card--lift flex flex-col items-center gap-4 p-4 sm:p-5">
          <div className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
            Draft your Sixth Man · any position
          </div>
          {currentDecade !== null && (
            <SlotMachine team={currentTeam} decade={currentDecade} size="lg" />
          )}
          <div className="flex flex-wrap justify-center gap-2">
            <button
              className="md-btn md-btn--sm md-btn--secondary"
              onClick={teamSkip}
              disabled={teamSkips <= 0 || rolling}
            >
              ↻ Team skip ({teamSkips})
            </button>
          </div>
          <div className="w-full">
            {currentTeam && currentDecade !== null && !rolling ? (
              <PlayerList
                team={currentTeam}
                decade={currentDecade}
                mode={mode}
                allowRespin
                draftable={draftable}
                onPick={pickSixth}
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
          <button
            className="md-btn md-btn--sm md-btn--secondary"
            onClick={onBack}
          >
            Cancel
          </button>
        </div>
      )}

      {/* ---- FINALIZE: captain + name + pin ---- */}
      {step === "finalize" && (
        <div className="md-card md-card--lift flex flex-col gap-4 p-4 sm:p-5">
          <div className="font-display text-xl font-bold">Pick your captain</div>
          <p className="-mt-2 text-[13px] text-[var(--md-ink-muted)]">
            Tap one of your five starters. Your captain&rsquo;s two best stats lift
            the whole team; their weakest drags a little.
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
                    setName(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""));
                    setNameTaken(false);
                  }}
                  placeholder="DREAMTEAM"
                  style={
                    nameTaken ? { borderColor: "var(--md-coral)" } : undefined
                  }
                />
                <span className="font-display text-[11px] text-[var(--md-ink-muted)]">
                  {name.length > 0 && !nameCheck.ok
                    ? nameCheck.reason
                    : "A–Z only · 16 max"}
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
            <button className="md-btn md-btn--lg md-btn--secondary" onClick={onBack}>
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
