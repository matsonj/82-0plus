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
import { HowToPlay } from "@/components/HowToPlay";
import { Button, Capsule, NameField, Notice, PinField } from "@/components/ui";
import {
  validateName,
  validateTeamName,
  validatePin,
  NAME_MAX_LEN,
} from "@/lib/tournamentValidation";
import { getSavedUser, saveUser, clearUser } from "@/lib/tournamentSession";
import { draftSourceKey, type DraftRosterMap } from "@/lib/draftSources";

const HOWTO_KEY = "md820-seen-tournament-howto";

// The starting five board — identical to the main game.
const KINDS: SlotKind[] = ["G", "FLEX", "W", "FLEX", "B"];

// Down-weight a decade each time it's used so the bench roll lands in a fresh era.
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
  privateConfig = null,
  preloadedRosters,
  onBack,
}: {
  initialLineup: (LineupEntry | null)[];
  mode: TournamentMode;
  dailyBench?: { team: string; decade: number } | null;
  dailyDate?: string | null;
  privateConfig?: {
    tournamentId: string;
    name: string;
    pin: string;
    onSubmitted: () => void;
  } | null;
  preloadedRosters?: DraftRosterMap;
  onBack: () => void;
}) {
  const isDaily = mode === "daily";
  const isPrivate = !!privateConfig;
  const benchIsFixed = isDaily || isPrivate;
  const listMode: GameMode = mode === "classic" ? "classic" : "hoopiq";

  const [decades, setDecades] = useState<number[]>([]);
  const [booting, setBooting] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const lineup = initialLineup;
  const starters = lineup.filter(Boolean) as LineupEntry[];

  const [sixth, setSixth] = useState<LineupEntry | null>(null);
  const [currentDecade, setCurrentDecade] = useState<number | null>(null);
  const [currentTeam, setCurrentTeam] = useState<string | null>(null);
  const [currentPlayers, setCurrentPlayers] = useState<PublicPlayer[] | null>(null);
  const [currentReceipt, setCurrentReceipt] = useState<string>("");
  const [teamReelPool, setTeamReelPool] = useState<string[]>([]);
  const [decadeReelPool, setDecadeReelPool] = useState<number[]>([]);
  const [benchReelSettled, setBenchReelSettled] = useState(true);
  const [teamSkips, setTeamSkips] = useState(1);
  const [rolling, setRolling] = useState(false);
  const [rollError, setRollError] = useState<string | null>(null);

  const [captainSlot, setCaptainSlot] = useState<number | null>(null);
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [nameTaken, setNameTaken] = useState(false);
  const [result, setResult] = useState<TournamentRunResponse | null>(null);

  const rollSeq = useRef(0);
  const rollActive = useRef(false);

  const step: Step = sixth ? "finalize" : "sixth";

  const usedIds = [
    ...starters.map((e) => e.player.entity_id),
    ...(sixth ? [sixth.player.entity_id] : []),
  ];
  const usedTeams = [
    ...starters.map((e) => e.team),
    ...(sixth ? [sixth.team] : []),
  ];

  useEffect(() => {
    const saved = getSavedUser();
    if (saved) {
      setUsername(saved.username);
      setPin(saved.pin);
      setLoggedIn(true);
    }
    try {
      if (!privateConfig && !localStorage.getItem(HOWTO_KEY)) {
        setShowHowTo(true);
        localStorage.setItem(HOWTO_KEY, "1");
      }
    } catch {
      /* localStorage unavailable */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logOut = () => {
    clearUser();
    setLoggedIn(false);
    setUsername("");
    setPin("");
  };

  useEffect(() => {
    if (benchIsFixed) {
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
  }, [benchIsFixed]);

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
      setCurrentPlayers(null);
      setTeamReelPool([]);
      setDecadeReelPool(decades);
      setBenchReelSettled(false);
      const url = `/api/slot?decade=${decade}${
        excludes.length ? `&exclude=${excludes.join(",")}` : ""
      }&includePlayers=1&mode=${listMode}`;
      fetch(url)
        .then(async (res) => {
          if (!res.ok) throw new Error("roll failed");
          return res.json();
        })
        .then((data) => {
          if (rollSeq.current !== myId) return;
          setTeamReelPool(Array.isArray(data.reelTeams) ? data.reelTeams : []);
          setCurrentTeam(data.team);
          setCurrentReceipt(data.receipt ?? "");
          setCurrentPlayers(Array.isArray(data.players) ? data.players : null);
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

  useEffect(() => {
    if (benchIsFixed) return;
    if (booting || decades.length === 0 || result) return;
    if (step !== "sixth") return;
    if (currentDecade !== null || rollActive.current) return;
    rollRound({});
  }, [benchIsFixed, booting, decades, result, step, currentDecade, rollRound]);

  useEffect(() => {
    if (!benchIsFixed || !dailyBench || result) return;
    if (step !== "sixth" || currentDecade !== null) return;
    setTeamReelPool([dailyBench.team, ...starters.map((entry) => entry.team)]);
    setDecadeReelPool([
      dailyBench.decade,
      ...starters.map((entry) => entry.decade),
    ]);
    setCurrentTeam(dailyBench.team);
    setCurrentDecade(dailyBench.decade);
  }, [benchIsFixed, dailyBench, result, step, currentDecade]);

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
    setCurrentPlayers(null);
  };

  const teamSkip = () => {
    if (teamSkips <= 0 || currentDecade === null || rolling) return;
    setTeamSkips((n) => n - 1);
    rollRound({ decade: currentDecade, excludeTeam: currentTeam ?? undefined });
  };

  const usernameCheck = validateName(username);
  const teamNameCheck = validateTeamName(teamName);
  const pinOk = validatePin(pin);
  const canSubmit = isPrivate
    ? sixth !== null && captainSlot !== null && teamNameCheck.ok && !submitting
    : sixth !== null && captainSlot !== null && usernameCheck.ok && teamNameCheck.ok && pinOk && !submitting;

  const fixedBenchRoster =
    currentTeam && currentDecade !== null
      ? preloadedRosters?.[draftSourceKey({ team: currentTeam, decade: currentDecade })]
      : undefined;
  const benchPlayers = fixedBenchRoster ?? currentPlayers;

  const submit = async () => {
    if (!canSubmit || captainSlot === null || !sixth) return;
    setSubmitting(true);
    setSubmitError(null);
    setNameTaken(false);

    if (privateConfig) {
      try {
        const roster = lineup
          .map((e, i) =>
            e ? { entity_id: e.player.entity_id, team: e.team, decade: e.decade, slot: i } : null,
          )
          .filter((p): p is NonNullable<typeof p> => p !== null);
        const res = await fetch("/api/private-tournament/submit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: privateConfig.name,
            pin: privateConfig.pin,
            tournamentId: privateConfig.tournamentId,
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
          const data = await res.json().catch(() => ({}));
          setSubmitError(data?.error ?? "Couldn't submit your team.");
          return;
        }
        privateConfig.onSubmitted();
        return;
      } catch {
        setSubmitError("Couldn't submit your team right now. Try again.");
        return;
      } finally {
        setSubmitting(false);
      }
    }

    try {
      const roster = lineup
        .map((e, i) =>
          e ? { entity_id: e.player.entity_id, team: e.team, decade: e.decade, slot: i, receipt: e.receipt } : null,
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
          dailyDate,
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
        setNameTaken(true);
        const data = await res.json().catch(() => ({}));
        setSubmitError(data?.error ?? "That account name is taken. Wrong PIN?");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSubmitError(data?.error ?? "Couldn't enter the tournament.");
        return;
      }
      const data = (await res.json()) as TournamentRunResponse;
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
        reveal
      />
    );
  }

  if (booting) {
    return (
      <div className="py-20 text-center font-mono text-[13px] text-[var(--md-ink-muted)]">
        Spinning up the league…
      </div>
    );
  }

  if (loadError && decades.length === 0) {
    return (
      <div className="md-card md-card--lift mx-auto max-w-md p-5 text-center">
        <p className="font-archivo font-bold leading-tight" style={{ fontSize: 16, fontWeight: 800, fontVariationSettings: '"wdth" 88' }}>
          Couldn&rsquo;t start the tournament.
        </p>
        <p className="mt-1 text-[13px] text-[var(--md-ink-muted)]">{loadError}</p>
        <Button size="sm" variant="secondary" className="mt-4" onClick={onBack}>
          Back
        </Button>
      </div>
    );
  }

  return (
    // The entry flow (sixth-man draft + captain/name form) is a narrow single
    // column; the post-submit bracket result returns above (full section width).
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5">
      {showHowTo && (
        <HowToPlay
          onClose={() => setShowHowTo(false)}
          initialTab="playoffs"
        />
      )}

      {/* The locked starting five */}
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="font-cond text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--md-ink-muted)]">
            Your starting five
          </span>
          <Capsule
            style={
              listMode === "hoopiq"
                ? { background: "var(--md-ink)", color: "var(--md-white)" }
                : undefined
            }
          >
            {isPrivate
              ? mode === "hoopiq"
                ? "Private · Ranked"
                : "Private · Classic"
              : `${
                  mode === "daily"
                    ? "Daily"
                    : mode === "hoopiq"
                      ? "Ranked"
                    : "Classic"
                } Tournament`}
          </Capsule>
        </div>
        <LineupBoard
          kinds={KINDS}
          entries={lineup}
          targets={[]}
          selected={null}
          onSlotClick={() => {}}
        />

        {sixth && (
          <div className="md-card mt-2 flex items-center justify-between gap-2 p-3">
            <div className="flex flex-col">
              <span className="font-cond text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--md-ink-muted)]">
                Sixth Man
              </span>
              <span className="font-archivo text-[14px] font-bold leading-tight" style={{ fontWeight: 800, fontVariationSettings: '"wdth" 88' }}>
                {sixth.player.player_name}
              </span>
              <span className="font-mono text-[11px] text-[var(--md-coral-deep)]">
                {sixth.team} &rsquo;{String(sixth.player.best_season).slice(2)}
              </span>
            </div>
          </div>
        )}
      </div>

      {rollError && (
        <Notice tone="error" className="bg-transparent p-3 text-[13px]">
          {rollError}
        </Notice>
      )}

      {/* ---- SIXTH MAN: the bench round ---- */}
      {step === "sixth" && (
        <div className="md-card md-card--lift flex flex-col items-center gap-4 p-4 sm:p-5">
          <div className="font-cond text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--md-ink-muted)]">
            {isDaily
              ? "Draft your Sixth Man · today's bench slot"
              : benchIsFixed
                ? "Draft your Sixth Man · tournament bench slot"
                : "Draft your Sixth Man · any position"}
          </div>
          {currentDecade !== null && (
            <SlotMachine
              team={currentTeam}
              decade={currentDecade}
              teamPool={teamReelPool}
              decadePool={decadeReelPool.length > 0 ? decadeReelPool : decades}
              size="lg"
              onSettled={() => setBenchReelSettled(true)}
            />
          )}
          {!benchIsFixed && (
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={teamSkip}
                disabled={teamSkips <= 0 || rolling}
              >
                ↻ Team skip ({teamSkips})
              </Button>
            </div>
          )}
          <div className="w-full">
            {benchReelSettled && currentTeam && currentDecade !== null && !rolling ? (
              <PlayerList
                team={currentTeam}
                decade={currentDecade}
                mode={listMode}
                players={benchPlayers}
                playersMode={
                  benchPlayers !== null && benchPlayers !== undefined ? listMode : null
                }
                allowRespin={!benchIsFixed}
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
              <div className="py-8 text-center font-mono text-[13px] text-[var(--md-ink-muted)]">
                Spinning the reel…
              </div>
            )}
          </div>
          <Button size="sm" variant="secondary" onClick={onBack}>
            Cancel
          </Button>
        </div>
      )}

      {/* ---- FINALIZE: captain + name + pin ---- */}
      {step === "finalize" && (
        <div className="md-card md-card--lift flex flex-col gap-4 p-4 sm:p-5">
          <div
            className="font-archivo leading-tight"
            style={{ fontSize: 20, fontWeight: 800, fontVariationSettings: '"wdth" 88' }}
          >
            Pick your captain
          </div>
          <p className="-mt-2 text-[13px] text-[var(--md-ink-muted)]">
            Tap one of your five starters.
          </p>
          <CaptainPicker
            kinds={KINDS}
            entries={lineup}
            value={captainSlot}
            onChange={setCaptainSlot}
          />

          {captainSlot !== null && (
            <div className="border-t-2 border-[var(--md-ink)] pt-4">
              <div
                className="font-archivo leading-tight"
                style={{ fontSize: 20, fontWeight: 800, fontVariationSettings: '"wdth" 88' }}
              >
                Claim your team
              </div>
              <div className="mt-3 flex flex-col gap-3">
                {isPrivate ? (
                  <div className="flex items-center gap-2 border-2 border-[var(--md-ink)] bg-[var(--md-paper-2)] px-3 py-2">
                    <span className="font-mono text-[13px]">
                      Playing as{" "}
                      <strong className="text-[var(--md-coral-deep)]">
                        {privateConfig.name}
                      </strong>
                    </span>
                  </div>
                ) : loggedIn ? (
                  <div className="flex items-center justify-between gap-2 border-2 border-[var(--md-ink)] bg-[var(--md-paper-2)] px-3 py-2">
                    <span className="font-mono text-[13px]">
                      Playing as{" "}
                      <strong className="text-[var(--md-coral-deep)]">
                        {username}
                      </strong>
                    </span>
                    <button
                      type="button"
                      className="font-mono text-[11px] font-bold uppercase tracking-wide text-[var(--md-blue)] underline"
                      onClick={logOut}
                    >
                      Log out
                    </button>
                  </div>
                ) : (
                  <>
                    <NameField
                      label="Your name"
                      value={username}
                      maxLength={NAME_MAX_LEN}
                      onChange={(event) => {
                        setUsername(event.target.value);
                        setNameTaken(false);
                      }}
                      style={nameTaken ? { borderColor: "var(--md-coral)" } : undefined}
                      hint={
                        username.length > 0 && !usernameCheck.ok
                          ? usernameCheck.reason
                          : "Your account name · letters, numbers, spaces · 16 max"
                      }
                    />
                    <p className="-mt-2 font-mono text-[11px] text-[var(--md-ink-muted)]">
                      This is how you log back in to check your teams.
                    </p>

                    <PinField
                      label="PIN"
                      value={pin}
                      onChange={(event) => setPin(event.target.value)}
                      hint={
                        pin.length > 0 && !pinOk
                          ? "PIN must be 4–6 digits"
                          : "Remembers your account so you can check back."
                      }
                    />
                  </>
                )}

                <label className="flex flex-col gap-1">
                  <span className="font-cond text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--md-ink-muted)]">
                    ✎ Team name{" "}
                    <span className="text-[var(--md-coral-deep)]">(tap to edit)</span>
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
                          // Normalize curly quotes (’ ‘ U+2019/U+2018 — what mobile
                          // keyboards insert) and backtick to a straight ' so they
                          // survive the strip below (MJ’s CREW → MJ'S CREW, not MJS).
                          .replace(/[‘’'`]/g, "'")
                          .replace(/[^A-Z ']/g, ""),
                      )
                    }
                    placeholder="DREAMTEAM"
                    style={{
                      background: "var(--md-paper-2)",
                      boxShadow: "var(--md-shadow-md)",
                    }}
                  />
                  <span className="font-mono text-[11px] text-[var(--md-ink-muted)]">
                    {teamName.length > 0 && !teamNameCheck.ok
                      ? teamNameCheck.reason
                      : "This team's name · letters, spaces & ' · 16 max"}
                  </span>
                </label>
              </div>
            </div>
          )}

          {submitError && (
            <Notice tone="error" className="text-[13px]">
              {submitError}
            </Notice>
          )}

          {captainSlot === null && (
            <p className="text-center font-mono text-[13px] text-[var(--md-ink-muted)]">
              Pick a captain to continue.
            </p>
          )}

          <div className="flex flex-wrap justify-center gap-2">
            {captainSlot !== null && (
              <Button
                size="lg"
                variant="teal"
                disabled={!canSubmit}
                onClick={submit}
              >
                {submitting
                  ? isPrivate
                    ? "Submitting…"
                    : "Running…"
                  : isPrivate
                    ? "Submit team"
                    : "Enter the tournament"}
              </Button>
            )}
            <Button size="lg" variant="secondary" onClick={onBack}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
