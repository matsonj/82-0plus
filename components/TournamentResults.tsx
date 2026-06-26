"use client";

import { useEffect, useState } from "react";
import type {
  TournamentRunResponse,
  TournamentMode,
  BracketResult,
  BracketTeam,
} from "@/lib/types";
import { BracketView } from "@/components/BracketView";
import { SimulateReveal } from "@/components/SimulateReveal";
import { buildTournamentShareImage } from "@/lib/shareImage";
import { presentShare } from "@/lib/shareActions";
import { getSavedUser } from "@/lib/tournamentSession";
import { SITE_URL } from "@/lib/site";
import { regWinsFromSeedNet, tierForSeedNet } from "@/lib/tier";
import { TeamGradeBadge } from "@/components/TeamGradeBadge";
import { Button } from "@/components/ui";
import { ShareAssetDialog } from "@/components/ui/ShareAssetDialog";
import {
  reachedRoundLabelPlain,
  reachedRoundSentence,
} from "@/lib/tournamentLabels";

// Fallback so a daily card never falls back to rendering the roster (a spoiler)
// even if an older stored team lacks team_box_json.
const EMPTY_BOX = {
  pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fgPct: 0, ftPct: 0, tov: 0, fg3m: 0,
};

function regSeasonRecord(seedNet: number): { w: number; l: number } {
  const w = regWinsFromSeedNet(seedNet);
  return { w, l: 82 - w };
}

function fmtNet(n: number): string {
  const v = Math.round(n);
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}`;
}

// Which tournament this run was — for the share card.
function tournamentModeLabel(
  mode?: TournamentMode,
  dailyDate?: string | null,
): string | undefined {
  if (!mode) return undefined;
  if (mode === "daily") {
    if (dailyDate && /^\d{4}-\d{2}-\d{2}$/.test(dailyDate)) {
      const [y, m, d] = dailyDate.split("-");
      return `Daily ${m}-${d}-${y.slice(2)}`;
    }
    return "Daily";
  }
  return mode === "hoopiq" ? "Ranked" : "Classic";
}

// Walk the bracket and compute the viewer's per-round game record.
function computeRoundRecords(
  bracket: BracketResult,
  youId: string,
): { totalW: number; totalL: number } {
  let totalW = 0;
  let totalL = 0;
  bracket.rounds.forEach((round) => {
    const s = round.find((x) => x.hiId === youId || x.loId === youId);
    if (!s) return;
    const youAreHi = s.hiId === youId;
    totalW += youAreHi ? s.scoreHi : s.scoreLo;
    totalL += youAreHi ? s.scoreLo : s.scoreHi;
  });
  return { totalW, totalL };
}

// One-line footer sentence: "MATT finished TOP 4 — lost in semis to HOOPMAMBA"
// Matches the A8H-0 mockup footer bar exactly.
function outcomeFooterLine(
  youName: string,
  reachedRound: number,
  isChampion: boolean,
  bracket: BracketResult,
  youId: string,
): { finish: string; detail: string } {
  if (isChampion) {
    return { finish: "Champion", detail: "Ran the table." };
  }
  // Find the series where the viewer was eliminated to get the opponent's name.
  let eliminatorName: string | null = null;
  for (const round of bracket.rounds) {
    const s = round.find((x) => x.hiId === youId || x.loId === youId);
    if (s && s.winnerId !== youId) {
      const eliminatorId = s.winnerId;
      eliminatorName = bracket.teams.find((t) => t.id === eliminatorId)?.name ?? null;
      break;
    }
  }

  const finishLabel = (() => {
    switch (reachedRound) {
      case 0: return "Lost R1";
      case 1: return "Top " + Math.ceil(bracket.teams.length / 2);
      case 2: return "Top 4";
      case 3: return "Runner-Up";
      default: return reachedRoundLabelPlain(reachedRound);
    }
  })();

  const detail = eliminatorName
    ? `lost ${reachedRound === 3 ? "the Final" : reachedRound === 2 ? "in conf finals" : reachedRound === 1 ? "in semis" : "in R1"} to ${eliminatorName}`
    : reachedRoundSentence(reachedRound, false).toLowerCase();

  return { finish: finishLabel, detail };
}

// The viewer's team summary: net rating + record + collapsible roster. Placed
// before the bracket so it's immediately visible. The roster is the viewer's
// OWN team (never a spoiler to themselves), but it's collapsed by default — the
// squad is detail, expanded on tap.
function YourTeamCard({
  team,
  you,
  isDaily,
  bracket,
}: {
  team: BracketTeam;
  you: { id: string; name: string; reachedRound: number; seed?: number };
  isDaily: boolean;
  bracket: BracketResult;
}) {
  // Roster toggle — collapsed by default; the squad is detail, surfaced on tap.
  const [rosterOpen, setRosterOpen] = useState(false);

  const { totalW, totalL } = computeRoundRecords(bracket, you.id);
  const isChampion = bracket.championId === you.id;
  const reg = regSeasonRecord(team.seedNet);

  // TEAM GRADE = the QUALITY letter tier (S/AA/A/B/C/D) projected from seedNet.
  // Shown for daily too (a grade ≠ matchmaking; daily stays Open elsewhere).
  // This page can't source Team Fit, so the profile is grade-only.
  const grade = tierForSeedNet(team.seedNet);

  return (
    <div
      className="border-2 border-[var(--md-ink)]"
      style={{ background: "var(--md-white)", boxShadow: "var(--md-shadow-sm)" }}
    >
      {/* Header row: team name + record chips */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
        style={isChampion
          ? { background: "var(--md-yellow)", boxShadow: "inset 4px 0 0 var(--md-cobalt)" }
          : { background: "var(--md-paper-2)", boxShadow: "inset 4px 0 0 var(--md-cobalt)" }}
      >
        <div className="flex min-w-0 items-center gap-2">
          {isChampion && <span style={{ fontSize: 16, color: "var(--md-ink)" }}>♛</span>}
          {team.seed !== undefined && (
            <span
              className="inline-flex shrink-0 items-center justify-center font-mono text-[10px] leading-none"
              style={{
                width: 18, height: 18,
                background: "var(--md-ink)", color: "var(--md-white)",
              }}
            >
              {team.seed}
            </span>
          )}
          <span
            className="font-archivo min-w-0 truncate leading-tight"
            style={{ fontSize: 16, fontWeight: 800, fontVariationSettings: '"wdth" 100' }}
          >
            {you.name}
          </span>
        </div>
        {/* Record chips */}
        <div className="flex shrink-0 items-center gap-3 font-mono text-[13px] tabular-nums">
          <div className="flex flex-col items-center leading-tight">
            <span className="font-cond text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--md-ink-muted)]">Net</span>
            <span className="font-bold" style={{ color: team.seedNet >= 0 ? "var(--md-teal)" : "var(--md-coral)" }}>
              {fmtNet(team.seedNet)}
            </span>
          </div>
          <div className="flex flex-col items-center leading-tight">
            <span className="font-cond text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--md-ink-muted)]">Reg</span>
            <span className="font-bold">{reg.w}–{reg.l}</span>
          </div>
          {(totalW > 0 || totalL > 0) && (
            <>
              <span className="text-[var(--md-ink-muted)]">→</span>
              <div className="flex flex-col items-center leading-tight">
                <span className="font-cond text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--md-ink-muted)]">Bracket</span>
                <span className="font-bold" style={{ color: isChampion ? "var(--md-ink)" : "var(--md-coral)" }}>
                  {totalW}–{totalL}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Team Profile — GRADE ONLY. The tournament results payload carries no
          Team Fit, so this page never shows a fit line (deliberate). Just the
          QUALITY letter grade + a one-line tier subline. */}
      {grade && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-[var(--md-ink)] px-4 py-3">
          <div className="flex flex-col gap-1">
            <span className="font-cond text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--md-ink-muted)]">
              daily82 Score
            </span>
            <span className="font-mono text-[12px] text-[var(--md-ink-muted)]">
              {reg.w}–{reg.l} season → {grade.label} tier
            </span>
          </div>
          <TeamGradeBadge tier={grade} />
        </div>
      )}

      {/* Roster — the viewer's own team (never a spoiler to themselves);
          collapsed by default, expanded on tap. */}
      {team.roster && (
        <>
          <button
            type="button"
            className="flex w-full items-center justify-between border-t-2 border-[var(--md-ink)] px-4 py-2 text-left font-mono text-[9px] uppercase tracking-wide text-[var(--md-ink-muted)]"
            style={{ cursor: "pointer", background: "var(--md-paper-2)" }}
            onClick={() => setRosterOpen((v) => !v)}
            aria-expanded={rosterOpen}
          >
            <span>Your Roster</span>
            <span>{rosterOpen ? "hide ▴" : "show ▾"}</span>
          </button>
          {rosterOpen && (
            <div className="flex flex-col gap-0 border-t-2 border-dashed border-[var(--md-ink)] px-4 py-3">
              {team.roster.map((p, i) => (
                <div
                  key={`${p.team}-${p.name}-${i}`}
                  className="flex items-baseline justify-between gap-2 py-0.5 font-mono text-[12px]"
                >
                  <span className="min-w-0 truncate">
                    {p.name}
                    {p.captain ? (
                      <span className="ml-1 inline-block border border-[var(--md-ink)] bg-[var(--md-yellow)] px-1 text-[8px] font-bold uppercase leading-tight tracking-wide align-middle">
                        C
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-[11px] text-[var(--md-coral-deep)]">
                    {p.team} &rsquo;{String(p.season).slice(2)}
                  </span>
                </div>
              ))}
              {team.sixthMan && (
                <>
                  <div className="my-1 border-t border-[var(--md-paper-3)]" />
                  <div className="font-cond text-[9px] font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
                    Sixth Man
                  </div>
                  <div className="flex items-baseline justify-between gap-2 py-0.5 font-mono text-[12px]">
                    <span className="min-w-0 truncate">{team.sixthMan.name}</span>
                    <span className="shrink-0 text-[11px] text-[var(--md-coral-deep)]">
                      {team.sixthMan.team} &rsquo;{String(team.sixthMan.season).slice(2)}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---- Main component -------------------------------------------------------
export function TournamentResults({
  data,
  mode,
  dailyDate,
  onReset,
  reveal = false,
}: {
  data: TournamentRunResponse;
  mode?: TournamentMode;
  dailyDate?: string | null;
  onReset?: () => void;
  // When true (a fresh tournament entry), gate the results behind the SIMULATE
  // reveal; dismissing it falls through to this full results page. Saved/shared
  // views pass false and land here directly.
  reveal?: boolean;
}) {
  const { bracket, you } = data;
  const isChampion = bracket.championId === you.id;
  const myTeam = bracket.teams.find((t) => t.id === you.id);
  const isDaily = mode === "daily";

  // Reveal gate: starts "not done" only for fresh entries (reveal=true).
  const [revealDone, setRevealDone] = useState(!reveal);

  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareBlob, setShareBlob] = useState<Blob | null>(null);
  const [autoCopied, setAutoCopied] = useState(false);
  const [dailyShareToken, setDailyShareToken] = useState<string | null>(null);

  // Fetch the daily share token (signed, time-limited) so the share link is
  // fully formed before the user taps Share.
  useEffect(() => {
    if (!isDaily || !dailyDate) return;
    const u = getSavedUser();
    if (!u) return;
    let active = true;
    fetch("/api/daily/share", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: u.username, pin: u.pin, date: dailyDate }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d?.share) setDailyShareToken(d.share as string);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [isDaily, dailyDate]);

  // Build the share image.
  useEffect(() => {
    if (!myTeam) { setShareBlob(null); return; }
    let active = true;
    const reg = regSeasonRecord(myTeam.seedNet);
    const playoff = computeRoundRecords(bracket, you.id);
    buildTournamentShareImage({
      teamName: you.name,
      conference: you.conference,
      seed: you.seed,
      isChampion,
      reachedLabel: reachedRoundLabelPlain(you.reachedRound),
      regWins: reg.w,
      regLosses: reg.l,
      playoffWins: playoff.totalW,
      playoffLosses: playoff.totalL,
      tier: isDaily ? undefined : tierForSeedNet(myTeam.seedNet)?.label,
      modeLabel: tournamentModeLabel(mode, dailyDate),
      roster: isDaily ? [] : myTeam.roster ?? [],
      sixthMan: isDaily ? undefined : myTeam.sixthMan,
      box: isDaily ? (data.teamBox ?? EMPTY_BOX) : undefined,
      actualMargin: isDaily ? data.realizedMargin : undefined,
    })
      .then((b) => { if (active) setShareBlob(b); })
      .catch(() => {});
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTeam, bracket, you, isChampion, isDaily, mode, dailyDate, data]);

  const shareLink =
    isDaily && dailyDate
      ? `${SITE_URL}/d/${dailyDate}${dailyShareToken ? `?s=${encodeURIComponent(dailyShareToken)}` : ""}`
      : data.teamId
        ? `${SITE_URL}/t/${data.teamId}`
        : SITE_URL;

  const shareReady = !!shareBlob && (!isDaily || !!dailyShareToken);

  const share = async () => {
    if (!myTeam || !shareReady || !shareBlob) return;
    const text = `daily82 Tournament · ${you.name}: ${reachedRoundSentence(you.reachedRound, isChampion)}\n${shareLink}`;
    const outcome = await presentShare({
      blob: shareBlob,
      filename: "daily82-tournament.png",
      text,
      link: shareLink,
    });
    if (outcome === "copied" || outcome === "failed") {
      setAutoCopied(outcome === "copied");
      setShareUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(shareBlob);
      });
    }
  };

  const closeShare = () => {
    if (shareUrl) URL.revokeObjectURL(shareUrl);
    setShareUrl(null);
  };

  // Outcome footer sentence for the viewer. (detail is intentionally unused — the
  // reveal + bracket already convey "lost in R1 to X".)
  const { finish } = outcomeFooterLine(
    you.name,
    you.reachedRound,
    isChampion,
    bracket,
    you.id,
  );

  // Outcome callout — surfaced ABOVE the bracket: the final placement outweighs
  // the round-by-round detail below. Champion → press-yellow box; everyone else
  // → cobalt YOU chip + finish + how-it-ended detail.
  const outcomeCallout = isChampion ? (
    <div
      className="inline-flex items-center gap-3 px-4 py-3"
      style={{
        background: "var(--md-yellow)",
        color: "var(--md-ink)",
        boxShadow: "var(--md-shadow-sm)",
      }}
    >
      <span style={{ fontSize: 20 }}>♛</span>
      <div>
        <div
          className="font-archivo font-bold leading-tight"
          style={{ fontSize: 16, fontWeight: 800, fontVariationSettings: '"wdth" 100' }}
        >
          {you.name}
        </div>
        <div
          className="font-cond font-bold uppercase tracking-[0.1em] mt-0.5"
          style={{ fontSize: 10, color: "var(--md-ink-muted)" }}
        >
          Champion · {finish}
        </div>
      </div>
    </div>
  ) : (
    <div className="flex flex-wrap items-center gap-3">
      <span
        className="shrink-0 px-3 py-1.5 font-cond text-[13px] font-semibold uppercase tracking-[0.12em]"
        style={{ background: "var(--md-cobalt)", color: "var(--md-white)" }}
      >
        {you.name}
      </span>
      <span className="font-mono text-[15px]" style={{ color: "var(--md-ink-muted)" }}>
        finished
      </span>
      <span
        className="font-cond text-[22px] font-semibold uppercase tracking-[0.04em]"
        style={{ color: "var(--md-ink)" }}
      >
        {finish}
      </span>
      {/* The "· lost in R1 to X" detail is omitted here — the SIMULATE reveal
          already told that story, and the bracket below shows the eliminator. */}
    </div>
  );

  // Tournament headline — private uses `bracket.tournamentName` if available,
  // otherwise a generic label. Public brackets derive from mode+date.
  const tournamentHeadline = (() => {
    // Private TournamentRunResponse may carry tournamentName (not in the public
    // type yet — guard with an 'in' check so tsc stays happy).
    if ("tournamentName" in data && typeof data.tournamentName === "string") {
      return data.tournamentName as string;
    }
    if (isDaily && dailyDate && /^\d{4}-\d{2}-\d{2}$/.test(dailyDate)) {
      const [y, m, d] = dailyDate.split("-");
      const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
      return date.toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }) + " Daily";
    }
    if (mode === "hoopiq") return "Ranked Tournament";
    if (mode === "daily") return "Daily Tournament";
    return "Classic Tournament";
  })();

  // Fresh entry: play the SIMULATE reveal first. Dismissing it ("See full
  // results") sets revealDone and falls through to the full results below.
  if (!revealDone) {
    return (
      <SimulateReveal
        data={data}
        mode={mode}
        onDismiss={() => setRevealDone(true)}
      />
    );
  }

  return (
    <>
      {shareUrl && (
        <ShareAssetDialog
          title="Share your run"
          imageUrl={shareUrl}
          imageAlt="Your tournament result card"
          downloadName="daily82-tournament.png"
          shareLink={shareLink}
          autoCopied={autoCopied}
          onClose={closeShare}
        />
      )}

      <div className="flex flex-col gap-8">

        {/* ---- Masthead: Anton cover title ----
            No eyebrow chip — it just echoed the headline. The champion no longer
            appears here either; it lives once, as the gold terminus at the end of
            the bracket's FINAL connector. */}
        <div>
          {/* Tournament name — Anton cover headline */}
          <h1
            className="font-cover uppercase leading-none"
            style={{
              fontSize: "clamp(36px, 7vw, 66px)",
              letterSpacing: "0.005em",
              maxWidth: "20ch",
            }}
          >
            {tournamentHeadline}
          </h1>
        </div>

        {/* ---- Your team summary — compact, above the bracket ---- */}
        {/* Record + roster visible by default. Daily spoiler guard: roster hidden
            for daily mode (isDaily), but the record chip is always safe to show. */}
        {myTeam && (
          <div>
            {/* Section head — marker eyebrow + Anton title + flame rule (GDU-0) */}
            <div className="mb-4 flex flex-col gap-1.5">
              <span
                className="font-marker lowercase"
                style={{ fontSize: 19, color: "var(--md-coral)" }}
              >
                scout the squad
              </span>
              <span
                className="font-cover uppercase leading-none"
                style={{ fontSize: 42, letterSpacing: "0.005em" }}
              >
                Your Team
              </span>
            </div>
            <div className="mb-4" style={{ height: 4, background: "var(--md-coral)" }} />
            <YourTeamCard
              team={myTeam}
              you={you}
              isDaily={isDaily}
              bracket={bracket}
            />
          </div>
        )}

        {/* ---- Outcome — how you finished ----
            Placed above the bracket on purpose: the final result is the headline;
            the bracket below is the round-by-round detail. */}
        {outcomeCallout}

        {/* ---- The bracket — hero/centerpiece ---- */}
        <div>
          {/* Section head — marker eyebrow + Anton title + "YOUR PATH" legend */}
          <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-1.5">
              <span
                className="font-marker lowercase"
                style={{ fontSize: 19, color: "var(--md-coral)" }}
              >
                how it shook out
              </span>
              <span
                className="font-cover uppercase leading-none"
                style={{ fontSize: 42, letterSpacing: "0.005em" }}
              >
                The Bracket
              </span>
            </div>
            {/* Cobalt YOU-path legend */}
            <div className="flex items-center gap-2 pb-1.5 font-cond text-[13px] font-semibold uppercase tracking-[0.14em] text-[var(--md-ink-muted)]">
              <span className="inline-block h-3 w-3" style={{ background: "var(--md-cobalt)" }} />
              <span>Your Path</span>
            </div>
          </div>
          <div className="mb-5" style={{ height: 4, background: "var(--md-coral)" }} />

          {/* BracketView: the viewer's path is highlighted via youId */}
          <BracketView bracket={bracket} youId={you.id} sharedBoard={isDaily} />
        </div>

        {/* ---- Actions: share + back ----
            The outcome one-liner now lives above the bracket; this strip is just
            the actions, after the bracket detail. A hairline, then the buttons. */}
        <div className="flex flex-col gap-5">
          <div style={{ height: 1.5, background: "var(--md-paper-3)" }} />
          <div className="flex flex-wrap items-center gap-3">
            {myTeam && (
              <Button
                size="lg"
                className="flex items-center gap-2"
                style={{
                  background: "var(--md-coral)",
                  color: "var(--md-white)",
                  borderColor: "var(--md-ink)",
                }}
                onClick={share}
                disabled={!shareReady}
              >
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{ flexShrink: 0 }}
                  aria-hidden="true"
                >
                  <path
                    d="M18 8a3 3 0 1 0-2.8-4H15a3 3 0 0 0 .2 1.1L8.9 8.6a3 3 0 1 0 0 6.8l6.3 3.5A3 3 0 1 0 18 16a3 3 0 0 0-2.1.9L9.6 13.4a3 3 0 0 0 0-2.8l6.3-3.5A3 3 0 0 0 18 8Z"
                    fill="currentColor"
                  />
                </svg>
                {shareReady ? "Share the Bracket" : "Preparing…"}
              </Button>
            )}
            {onReset && (
              <Button size="lg" variant="secondary" onClick={onReset}>
                Back
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
