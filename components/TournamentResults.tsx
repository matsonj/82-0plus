"use client";

import { useEffect, useState } from "react";
import type {
  TournamentRunResponse,
  TournamentMode,
  BracketResult,
  BracketTeam,
} from "@/lib/types";
import { BracketView } from "@/components/BracketView";
import { buildTournamentShareImage } from "@/lib/shareImage";
import { presentShare } from "@/lib/shareActions";
import { copyText } from "@/lib/copyText";
import { getSavedUser } from "@/lib/tournamentSession";
import { SITE_URL } from "@/lib/site";
import { regWinsFromSeedNet, tierForSeedNet } from "@/lib/tier";
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

// Which tournament label to show in the kicker, e.g. "DAILY TOURNAMENT".
function tournamentKicker(mode?: TournamentMode, isPrivate?: boolean): string {
  if (isPrivate) return "Private Tournament";
  if (mode === "daily") return "Daily Tournament";
  if (mode === "hoopiq") return "Ranked Tournament";
  return "Classic Tournament";
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

// The viewer's team summary: record + collapsible roster. Placed before the
// bracket so it's immediately visible. Open by default (collapsed on re-open).
// Guarded by isDaily: never reveals the roster for an incomplete daily (spoiler).
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
  // Roster toggle — open by default so it's visible on first load.
  const [rosterOpen, setRosterOpen] = useState(!isDaily);

  const { totalW, totalL } = computeRoundRecords(bracket, you.id);
  const isChampion = bracket.championId === you.id;
  const reg = regSeasonRecord(team.seedNet);

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

      {/* Roster — hidden for daily (spoiler guard), collapsible otherwise */}
      {!isDaily && team.roster && (
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

// ---- Champion stamp card ------------------------------------------------
// Top-right press-yellow card. A8H-0: trophy icon, "CHAMPION" kicker, big
// Archivo name, "N-0 · UNDEFEATED" or "N-M · RAN THE TABLE" record line.
function ChampionStamp({
  name,
  bracket,
  championId,
}: {
  name: string;
  bracket: BracketResult;
  championId: string;
}) {
  // Count champion's wins and losses across all rounds.
  let w = 0;
  let l = 0;
  bracket.rounds.forEach((round) => {
    const s = round.find((x) => x.hiId === championId || x.loId === championId);
    if (!s) return;
    const isHi = s.hiId === championId;
    w += isHi ? s.scoreHi : s.scoreLo;
    l += isHi ? s.scoreLo : s.scoreHi;
  });
  const undefeated = l === 0;
  const recordLine = undefeated ? `${w}-0 · Undefeated` : `${w}-${l} · Ran the table`;

  return (
    <div
      className="flex items-start gap-3 p-4"
      style={{
        background: "var(--md-yellow)",
        color: "var(--md-ink)",
        border: "3px solid var(--md-ink)",
        boxShadow: "var(--md-shadow-md)",
        minWidth: 200,
      }}
    >
      <span style={{ fontSize: 28, lineHeight: 1 }}>♛</span>
      <div>
        <div
          className="font-cond font-bold uppercase tracking-[0.16em]"
          style={{ fontSize: 10, color: "var(--md-ink-muted)" }}
        >
          Champion
        </div>
        <div
          className="font-archivo font-bold leading-tight mt-0.5"
          style={{
            fontSize: "clamp(14px, 2vw, 20px)",
            fontWeight: 800,
            fontVariationSettings: '"wdth" 100',
          }}
        >
          {name}
        </div>
        <div
          className="font-cond font-semibold uppercase tracking-[0.08em] mt-1"
          style={{ fontSize: 11, color: "var(--md-ink-muted)" }}
        >
          {recordLine}
        </div>
      </div>
    </div>
  );
}

// ---- Share overlay -------------------------------------------------------
function ShareOverlay({
  shareUrl,
  shareLink,
  autoCopied,
  onClose,
}: {
  shareUrl: string;
  shareLink: string;
  autoCopied: boolean;
  onClose: () => void;
}) {
  const [linkCopied, setLinkCopied] = useState(false);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(21,17,14,0.7)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm p-5"
        style={{
          background: "var(--md-white)",
          border: "2px solid var(--md-ink)",
          boxShadow: "var(--md-shadow-lg)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h3
            className="font-archivo leading-tight"
            style={{ fontSize: 20, fontWeight: 800, fontVariationSettings: '"wdth" 88' }}
          >
            Share your run
          </h3>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="font-mono text-[16px] text-[var(--md-ink-muted)] hover:text-[var(--md-coral)]"
          >
            ✕
          </button>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={shareUrl}
          alt="Your tournament result card"
          className="mt-3 w-full border-2 border-[var(--md-ink)]"
        />
        <p className="mt-2 text-center font-mono text-[12px] leading-snug text-[var(--md-ink-muted)]">
          <strong>Right-click to copy and share.</strong>{" "}
          {autoCopied
            ? "The link is already on your clipboard."
            : 'Use "Copy link" below to copy the link.'}
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <a
            className="md-btn md-btn--sm md-btn--secondary"
            href={shareUrl}
            download="daily82-tournament.png"
          >
            Download
          </a>
          <button
            className="md-btn md-btn--sm md-btn--secondary"
            onClick={async () => {
              const ok = await copyText(shareLink);
              if (ok) {
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 1500);
              }
            }}
          >
            {linkCopied ? "Link copied!" : "Copy link"}
          </button>
          <button className="md-btn md-btn--sm md-btn--ink" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Main component -------------------------------------------------------
export function TournamentResults({
  data,
  mode,
  dailyDate,
  onReset,
}: {
  data: TournamentRunResponse;
  mode?: TournamentMode;
  dailyDate?: string | null;
  onReset?: () => void;
}) {
  const { bracket, you } = data;
  const isChampion = bracket.championId === you.id;
  const myTeam = bracket.teams.find((t) => t.id === you.id);
  const isDaily = mode === "daily";
  const teamCount = bracket.teams.length;

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
    const text = `daily82 Tournament · ${you.name} — ${reachedRoundSentence(you.reachedRound, isChampion)}\n${shareLink}`;
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

  // Outcome footer sentence for the viewer.
  const { finish, detail } = outcomeFooterLine(
    you.name,
    you.reachedRound,
    isChampion,
    bracket,
    you.id,
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

  // Round count for the "FINAL · N TEAMS · SINGLE ELIM" subline.
  const roundLabel = (() => {
    const r = bracket.rounds.length;
    if (r === 1) return "Final";
    if (r === 2) return "Semifinals";
    if (r === 3) return "Quarterfinals";
    return `Round ${r}`;
  })();

  return (
    <>
      {shareUrl && (
        <ShareOverlay
          shareUrl={shareUrl}
          shareLink={shareLink}
          autoCopied={autoCopied}
          onClose={closeShare}
        />
      )}

      <div className="flex flex-col gap-8">

        {/* ---- Masthead: kicker + headline + champion stamp ---- */}
        <div>
          {/* Kicker row */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              {/* Mode kicker capsule */}
              <div className="mb-2">
                <span
                  className="font-cond font-bold uppercase tracking-[0.14em] px-2 py-1"
                  style={{
                    fontSize: 11,
                    background: "var(--md-coral)",
                    color: "var(--md-white)",
                    border: "2px solid var(--md-ink)",
                  }}
                >
                  {tournamentKicker(mode)}
                </span>
              </div>
              {/* Tournament name — Anton cover headline */}
              <h1
                className="font-cover uppercase leading-none"
                style={{
                  fontSize: "clamp(28px, 7vw, 64px)",
                  letterSpacing: "-0.02em",
                  maxWidth: "20ch",
                }}
              >
                {tournamentHeadline}
              </h1>
              {/* Subline: FINAL · N TEAMS · SINGLE ELIM */}
              <div
                className="mt-2 font-cond font-semibold uppercase tracking-[0.16em]"
                style={{ fontSize: 11, color: "var(--md-ink-muted)" }}
              >
                {roundLabel} · {teamCount} Teams · Single Elim
              </div>
            </div>

            {/* Champion stamp — top-right on desktop, below headline on mobile */}
            <div className="shrink-0">
              <ChampionStamp
                name={bracket.championName}
                bracket={bracket}
                championId={bracket.championId}
              />
            </div>
          </div>
        </div>

        {/* ---- Your team summary — compact, above the bracket ---- */}
        {/* Record + roster visible by default. Daily spoiler guard: roster hidden
            for daily mode (isDaily), but the record chip is always safe to show. */}
        {myTeam && (
          <div>
            <div className="mb-3 flex items-center gap-3">
              <span
                className="font-cond font-bold uppercase tracking-[0.16em]"
                style={{ fontSize: 12, color: "var(--md-ink)" }}
              >
                Your Team
              </span>
              <div className="flex-1 border-t border-[var(--md-paper-3)]" />
            </div>
            <YourTeamCard
              team={myTeam}
              you={you}
              isDaily={isDaily}
              bracket={bracket}
            />
          </div>
        )}

        {/* ---- The bracket — hero/centerpiece ---- */}
        <div>
          {/* Section header */}
          <div className="mb-4 flex items-center gap-3">
            <span
              className="font-cond font-bold uppercase tracking-[0.16em]"
              style={{ fontSize: 12, color: "var(--md-ink)" }}
            >
              The Bracket
            </span>
            <div className="flex-1 border-t border-[var(--md-paper-3)]" />
            {/* "You" legend */}
            <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-[var(--md-ink-muted)]">
              <span
                className="inline-block h-3 w-3 border-2 border-[var(--md-ink)]"
                style={{ background: "var(--md-cobalt)" }}
              />
              <span>★ you</span>
            </div>
          </div>

          {/* BracketView: the viewer's path is highlighted via youId */}
          <BracketView bracket={bracket} youId={you.id} sharedBoard={isDaily} />
        </div>

        {/* ---- Footer bar: outcome one-liner + share button ---- */}
        {/*
          A8H-0: a single horizontal bar with the viewer's finish chip on the
          left and "SHARE THE BRACKET" flame button on the right. On mobile this
          stacks: outcome block then share button.
        */}
        <div
          className="flex flex-col gap-4 border-t-2 border-[var(--md-ink)] pt-5 sm:flex-row sm:items-center sm:justify-between"
        >
          {/* Viewer outcome */}
          {isChampion ? (
            /* Champion gets the full press-yellow treatment */
            <div
              className="inline-flex items-center gap-3 px-4 py-3"
              style={{
                background: "var(--md-yellow)",
                color: "var(--md-ink)",
                border: "2px solid var(--md-ink)",
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
            /* Non-champion: ink chip + finish + detail */
            <div className="flex items-center gap-3 flex-wrap">
              <span
                className="font-cond font-bold uppercase tracking-[0.1em] px-2 py-1.5 shrink-0"
                style={{
                  fontSize: 12,
                  background: "var(--md-ink)",
                  color: "var(--md-white)",
                }}
              >
                {you.name}
              </span>
              <span
                className="font-mono text-[13px]"
                style={{ color: "var(--md-ink)" }}
              >
                finished{" "}
                <strong className="font-bold">{finish}</strong>
                {detail ? ` — ${detail}` : ""}
              </span>
            </div>
          )}

          {/* Share + Back buttons */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {myTeam && (
              <button
                className="md-btn md-btn--lg flex items-center gap-2"
                style={{
                  background: "var(--md-coral)",
                  color: "var(--md-white)",
                  borderColor: "var(--md-ink)",
                }}
                onClick={share}
                disabled={!shareReady}
              >
                <span style={{ fontSize: 14 }}>↑</span>
                {shareReady ? "Share the Bracket" : "Preparing…"}
              </button>
            )}
            {onReset && (
              <button className="md-btn md-btn--lg md-btn--secondary" onClick={onReset}>
                Back
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
