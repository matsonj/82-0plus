"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  GameMode,
  PublicPlayer,
  TournamentMode,
  TournamentRunResponse,
} from "@/lib/types";
import { type SlotKind } from "@/lib/positions";
import { SlotMachine } from "@/components/SlotMachine";
import { PlayerList } from "@/components/PlayerList";
import { LineupBoard, type LineupEntry } from "@/components/LineupBoard";
import { CaptainPicker } from "@/components/CaptainPicker";
import { TournamentResults } from "@/components/TournamentResults";
import { TournamentHowToPlay } from "@/components/TournamentHowToPlay";
import {
  validateName,
  validateTeamName,
  validatePin,
  NAME_MAX_LEN,
} from "@/lib/tournamentValidation";
import { getSavedUser, saveUser, clearUser } from "@/lib/tournamentSession";

const HOWTO_KEY = "md820-seen-tournament-howto";

// The starting five board — identical to the main game. The five are carried in
// from the just-played Classic/Ranked game and locked; the tournament only adds
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
  dailyBench = null,
  dailyDate = null,
  onBack,
}: {
  initialLineup: (LineupEntry | null)[];
  mode: TournamentMode;
  // For daily mode: the FIXED bench slot (team+decade) the sixth man is drafted
  // from — no rolling, no team-skip, no receipt (the daily board is the
  // provenance). Null/omitted for classic/hoopiq, which roll the bench.
  dailyBench?: { team: string; decade: number } | null;
  dailyDate?: string | null; // daily board date (for the share-card mode label)
  onBack: () => void;
}) {
  const isDaily = mode === "daily";
  // Stat visibility mirrors the main game: daily hides stats like Ranked.
  const listMode: GameMode = mode === "classic" ? "classic" : "hoopiq";

  // ----- league data (for the bench roll; unused in daily) -----
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
  const [currentReceipt, setCurrentReceipt] = useState<string>(""); // bench roll receipt
  const [teamSkips, setTeamSkips] = useState(1);
  const [rolling, setRolling] = useState(false);
  const [rollError, setRollError] = useState<string | null>(null);

  // ----- finalize -----
  const [captainSlot, setCaptainSlot] = useState<number | null>(null);
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  // Logged in? (remembered from a previous submit/lookup). When set, the player
  // only needs a team name; username + PIN come from the saved session.
  const [loggedIn, setLoggedIn] = useState(false);
  // First-visit Tournament Edition explainer.
  const [showHowTo, setShowHowTo] = useState(false);
  const [teamName, setTeamName] = useState("");
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

  // ----- restore login + first-visit how-to on mount -----
  useEffect(() => {
    const saved = getSavedUser();
    if (saved) {
      setUsername(saved.username);
      setPin(saved.pin);
      setLoggedIn(true);
    }
    try {
      if (!localStorage.getItem(HOWTO_KEY)) {
        setShowHowTo(true);
        localStorage.setItem(HOWTO_KEY, "1");
      }
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  const logOut = () => {
    clearUser();
    setLoggedIn(false);
    setUsername("");
    setPin("");
  };

  // ----- load decades on mount (classic/hoopiq only — daily has fixed slots) -----
  useEffect(() => {
    if (isDaily) {
      setBooting(false);
      return;
    }
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
  }, [isDaily]);

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
          setCurrentReceipt(data.receipt ?? "");
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

  // Auto-roll the bench round until a sixth man is chosen (classic/hoopiq only).
  useEffect(() => {
    if (isDaily) return; // daily uses the fixed bench slot, not a roll
    if (booting || decades.length === 0 || result) return;
    if (step !== "sixth") return;
    if (currentDecade !== null || rollActive.current) return;
    rollRound({});
  }, [isDaily, booting, decades, result, step, currentDecade, rollRound]);

  // Daily: pin the bench round to the day's fixed bench slot (no roll). No
  // receipt — the daily board is the provenance, verified server-side on submit.
  useEffect(() => {
    if (!isDaily || !dailyBench || result) return;
    if (step !== "sixth" || currentDecade !== null) return;
    setCurrentTeam(dailyBench.team);
    setCurrentDecade(dailyBench.decade);
  }, [isDaily, dailyBench, result, step, currentDecade]);

  const draftable = useCallback(
    (p: PublicPlayer) => !usedIds.includes(p.entity_id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sixth],
  );

  const pickSixth = (player: PublicPlayer) => {
    if (currentTeam === null || currentDecade === null) return;
    setSixth({
      player,
      team: currentTeam,
      decade: currentDecade,
      receipt: currentReceipt,
    });
    setCurrentDecade(null);
    setCurrentTeam(null);
  };

  const teamSkip = () => {
    if (teamSkips <= 0 || currentDecade === null || rolling) return;
    setTeamSkips((n) => n - 1);
    rollRound({ decade: currentDecade, excludeTeam: currentTeam ?? undefined });
  };

  // ----- submit -----
  const usernameCheck = validateName(username);
  const teamNameCheck = validateTeamName(teamName);
  const pinOk = validatePin(pin);
  const canSubmit =
    sixth !== null &&
    captainSlot !== null &&
    usernameCheck.ok &&
    teamNameCheck.ok &&
    pinOk &&
    !submitting;

  const submit = async () => {
    if (!canSubmit || captainSlot === null || !sixth) return;
    setSubmitting(true);
    setSubmitError(null);
    setNameTaken(false);
    try {
      // Each pick carries its signed roll receipt (server verifies provenance).
      const roster = lineup
        .map((e, i) =>
          e
            ? {
                entity_id: e.player.entity_id,
                team: e.team,
                decade: e.decade,
                slot: i,
                receipt: e.receipt,
              }
            : null,
        )
        .filter((p): p is NonNullable<typeof p> => p !== null);
      const res = await fetch("/api/tournament/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: username,
          pin,
          teamName,
          mode,
          dailyDate, // which daily board (today or an archived day) the picks are from
          roster,
          captainSlot,
          sixthPick: {
            entity_id: sixth.player.entity_id,
            team: sixth.team,
            decade: sixth.decade,
            receipt: sixth.receipt,
          },
        }),
      });
      if (res.status === 409) {
        // Username belongs to someone else / wrong PIN — flag the USERNAME field.
        setNameTaken(true);
        const data = await res.json().catch(() => ({}));
        setSubmitError(
          data?.error ?? "That account name is taken — wrong PIN?",
        );
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSubmitError(data?.error ?? "Couldn't enter the tournament.");
        return;
      }
      const data = (await res.json()) as TournamentRunResponse;
      // Remember the account so the next entry only needs a team name.
      saveUser({ username, pin });
      setLoggedIn(true);
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
    return (
      <TournamentResults
        data={result}
        mode={mode}
        dailyDate={dailyDate}
        onReset={onBack}
      />
    );
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
      {showHowTo && (
        <TournamentHowToPlay onClose={() => setShowHowTo(false)} />
      )}
      {/* The locked starting five, plus the sixth-man chip once chosen. */}
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
            Your starting five
          </span>
          <span
            className="md-capsule"
            style={
              listMode === "hoopiq"
                ? { background: "var(--md-ink)", color: "var(--md-white)" }
                : undefined
            }
          >
            {mode === "daily" ? "Daily" : mode === "hoopiq" ? "Ranked" : "Classic"}{" "}
            Tournament
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
            {isDaily
              ? "Draft your Sixth Man · today's bench slot"
              : "Draft your Sixth Man · any position"}
          </div>
          {currentDecade !== null && (
            <SlotMachine team={currentTeam} decade={currentDecade} size="lg" />
          )}
          {/* Daily's bench is a fixed slot — no team-skip. */}
          {!isDaily && (
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
                mode={listMode}
                allowRespin={!isDaily}
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
            Tap one of your five starters.
          </p>
          <CaptainPicker
            kinds={KINDS}
            entries={lineup}
            value={captainSlot}
            onChange={setCaptainSlot}
          />

          {/* The name/login + team-name forms appear only AFTER a captain is
              picked — showing them up-front confused first-time players. */}
          {captainSlot !== null && (
          <div className="border-t-2 border-[var(--md-ink)] pt-4">
            <div className="font-display text-xl font-bold">Claim your team</div>
            <div className="mt-3 flex flex-col gap-3">
              {loggedIn ? (
                <div className="flex items-center justify-between gap-2 border-2 border-[var(--md-ink)] bg-[var(--md-paper-2)] px-3 py-2">
                  <span className="font-display text-[13px]">
                    Playing as{" "}
                    <strong className="text-[var(--md-orange-deep)]">
                      {username}
                    </strong>
                  </span>
                  <button
                    type="button"
                    className="font-display text-[11px] font-bold uppercase tracking-wide text-[var(--md-blue)] underline"
                    onClick={logOut}
                  >
                    Log out
                  </button>
                </div>
              ) : (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
                      Your name
                    </span>
                    <input
                      className="md-input md-input--name"
                      value={username}
                      maxLength={NAME_MAX_LEN}
                      autoCapitalize="characters"
                      onChange={(e) => {
                        setUsername(
                          e.target.value.toUpperCase().replace(/[^A-Z0-9 ]/g, ""),
                        );
                        setNameTaken(false);
                      }}
                      placeholder="PHILJACKSON"
                      style={
                        nameTaken ? { borderColor: "var(--md-coral)" } : undefined
                      }
                    />
                    <span className="font-display text-[11px] text-[var(--md-ink-muted)]">
                      {username.length > 0 && !usernameCheck.ok
                        ? usernameCheck.reason
                        : "Your account name · letters, numbers, spaces · 16 max"}
                    </span>
                    <span className="font-display text-[11px] text-[var(--md-ink-muted)]">
                      This is how you log back in to check your teams.
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
                    <span className="font-display text-[11px] text-[var(--md-ink-muted)]">
                      {pin.length > 0 && !pinOk
                        ? "PIN must be 4–6 digits"
                        : "Remembers your account so you can check back."}
                    </span>
                  </label>
                </>
              )}

              <label className="flex flex-col gap-1">
                <span className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
                  ✎ Team name <span className="text-[var(--md-orange-deep)]">(tap to edit)</span>
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
                  // Tinted fill + hard shadow so it clearly reads as an editable
                  // field (not a heading) against the white card.
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
            </div>
          </div>
          )}

          {submitError && (
            <div className="border-2 border-[var(--md-coral)] bg-[var(--md-white)] p-2 font-display text-sm text-[var(--md-coral)]">
              {submitError}
            </div>
          )}

          {captainSlot === null && (
            <p className="text-center font-display text-[13px] text-[var(--md-ink-muted)]">
              Pick a captain to continue.
            </p>
          )}

          <div className="flex flex-wrap justify-center gap-2">
            {captainSlot !== null && (
              <button
                className="md-btn md-btn--lg md-btn--teal"
                disabled={!canSubmit}
                onClick={submit}
              >
                {submitting ? "Running…" : "Enter the tournament"}
              </button>
            )}
            <button className="md-btn md-btn--lg md-btn--secondary" onClick={onBack}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
