"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { PlayerSeasonRow } from "@/lib/queries";
import type { Role } from "@/lib/positions";
import { loadPlayerSeasons, prefetchPlayerSeasons } from "@/lib/playerSeasons";

type Status = "loading" | "ok" | "error";

/** One player the carousel can show. */
export interface CardPlayer {
  entityId: string;
  playerName: string;
  team: string;
  season: number;
  positions?: Role[];
  // All-Defensive team that drafted season: 1 (1st) / 2 (2nd) / 0 | undefined
  // (none). Classic only — the roster mapping leaves it unset elsewhere.
  allDef?: number;
}

// Position → capsule background on the SLAM system (no role colors bleed into data).
const ROLE_BG: Record<Role, string> = {
  G: "var(--md-sky)",
  W: "var(--md-teal-bright)",
  B: "var(--md-orange)",
};

const gq100 = (gq: number) => Math.round(gq * 100);
// Tolerate null/undefined cells (e.g. a season with zero shot attempts) so a
// sparse career card renders instead of throwing on .toFixed.
const f1 = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n) ? n.toFixed(1) : "—";

/** A little card glyph (rounded card with stat lines) — the "open card" affordance. */
export function CardGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden role="img">
      <rect x="2.5" y="1.5" width="11" height="13" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <line x1="4.6" y1="5" x2="11.4" y2="5" stroke="currentColor" strokeWidth="1.3" />
      <line x1="4.6" y1="8" x2="11.4" y2="8" stroke="currentColor" strokeWidth="1.1" />
      <line x1="4.6" y1="10.5" x2="9" y2="10.5" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

// ── GQ line chart — SLAM reskin.
// Cream/white panel, 1.5px ink border, dashed guides at 25/50/75.
// Drafted/best season = large flame dot (labeled); on-team = ink dot (no label);
// off-team = hollow grey dot (no label). Only the drafted dot gets a GQ number.
function GqChart({
  seasons,
  draftedSeason,
  cardTeam,
  compact = false,
}: {
  seasons: PlayerSeasonRow[];
  draftedSeason: number;
  // The card's franchise — used to determine on-team vs off-team per season.
  cardTeam: string;
  compact?: boolean;
}) {
  const W = 340;
  const H = compact ? 100 : 180;
  const padL = 30;
  const padR = 14;
  const padT = 16;
  const padB = compact ? 8 : 36;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const x = (i: number) =>
    padL + (seasons.length <= 1 ? innerW / 2 : (innerW * i) / (seasons.length - 1));
  const y = (gq: number) => padT + innerH * (1 - gq);

  // Simple connecting path (single line through all seasons)
  const pathD = seasons
    .map((s, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(s.gq).toFixed(1)}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label="Median Game Quality by season"
      style={{ display: "block" }}
    >
      {/* Chart field */}
      <rect
        x={padL}
        y={padT}
        width={innerW}
        height={innerH}
        fill="var(--md-white)"
        stroke="var(--md-ink)"
        strokeWidth={1.5}
      />
      {/* Guide lines at 25, 50, 75 — no "LEAGUE AVG" label (obvious from context) */}
      {[25, 50, 75].map((v) => (
        <g key={v}>
          <line
            x1={padL}
            x2={W - padR}
            y1={y(v / 100)}
            y2={y(v / 100)}
            stroke="var(--md-ink-muted)"
            strokeWidth={v === 50 ? 1.2 : 0.8}
            strokeDasharray={v === 50 ? "4 3" : "3 3"}
          />
          {!compact && (
            <text
              x={padL - 4}
              y={y(v / 100) + 3.5}
              fontSize={9}
              textAnchor="end"
              fill="var(--md-ink-muted)"
              fontFamily="var(--font-mono)"
            >
              {v}
            </text>
          )}
        </g>
      ))}
      {!compact && (
        <>
          <text
            x={padL - 4}
            y={padT + 8}
            fontSize={9}
            textAnchor="end"
            fill="var(--md-ink-muted)"
            fontFamily="var(--font-mono)"
          >
            100
          </text>
          <text
            x={padL - 4}
            y={H - padB + 4}
            fontSize={9}
            textAnchor="end"
            fill="var(--md-ink-muted)"
            fontFamily="var(--font-mono)"
          >
            0
          </text>
        </>
      )}
      {/* Connecting line — ink, 2px */}
      <path d={pathD} fill="none" stroke="var(--md-ink)" strokeWidth={2} />
      {/* Season dots — on-team = filled ink, off-team = hollow grey, drafted = flame */}
      {seasons.map((s, i) => {
        const isDrafted = s.season === draftedSeason;
        // A season is on-team when it was played for this card's franchise.
        const isAway = s.team !== cardTeam;

        const cx = x(i);
        const cy = y(s.gq);
        const r = isDrafted ? 6 : 4;

        return (
          <g key={s.season}>
            {/* Drafted/best season is ALWAYS the flame "this card" dot — even when
                the season aggregates to another team (a mid-season trade, where the
                modal team isn't this card's franchise). This card IS that season, so
                it must read as "this card", never a hollow "another team" circle. */}
            {isDrafted ? (
              <circle cx={cx} cy={cy} r={r} fill="var(--md-coral)" stroke="var(--md-ink)" strokeWidth={1} />
            ) : isAway ? (
              /* Off-team: hollow grey circle */
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="var(--md-white)"
                stroke="var(--md-ink-muted)"
                strokeWidth={1.5}
              />
            ) : (
              /* On-team: solid ink dot */
              <circle cx={cx} cy={cy} r={r} fill="var(--md-ink)" stroke="var(--md-ink)" strokeWidth={1} />
            )}
            {/* GQ value label — only on the drafted/best-season dot.
                White backing rect so the connecting line doesn't bleed through.
                Flips below the dot when GQ > 90 to avoid clipping the chart top. */}
            {!compact && isDrafted && (() => {
              const val = gq100(s.gq);
              const above = val <= 90;
              // Text baseline: above the dot (default) or below (>90 flip).
              const textY = above ? cy - r - 3 : cy + r + 10;
              // Rect behind the text: ~14px wide × 10px tall, centered on cx.
              const bw = 18; const bh = 11;
              const rectY = above ? cy - r - 14 : cy + r + 1;
              return (
                <g>
                  <rect
                    x={cx - bw / 2}
                    y={rectY}
                    width={bw}
                    height={bh}
                    fill="var(--md-white)"
                    rx={1}
                  />
                  <text
                    x={cx}
                    y={textY}
                    fontSize={9}
                    textAnchor="middle"
                    fill="var(--md-coral)"
                    fontFamily="var(--font-mono)"
                    fontWeight={700}
                  >
                    {val}
                  </text>
                </g>
              );
            })()}
            {/* Invisible hit target for tooltip */}
            <circle cx={cx} cy={cy} r={10} fill="transparent">
              <title>&rsquo;{String(s.season).slice(2)} · GQ {gq100(s.gq)}</title>
            </circle>
          </g>
        );
      })}
      {/* X-axis season labels */}
      {!compact && (() => {
        // Show first, last, and up to ~4 intermediate labels, evenly spaced.
        const maxLabels = Math.min(seasons.length, 6);
        const step = Math.max(1, Math.floor((seasons.length - 1) / (maxLabels - 1)));
        const labelIdxs = new Set<number>();
        for (let i = 0; i < seasons.length; i += step) labelIdxs.add(i);
        labelIdxs.add(seasons.length - 1);
        return [...labelIdxs].sort((a, b) => a - b).map((i) => {
          const s = seasons[i];
          const isDrafted = s.season === draftedSeason;
          return (
            <text
              key={s.season}
              x={x(i)}
              y={H - padB + 14}
              fontSize={9}
              textAnchor="middle"
              fill={isDrafted ? "var(--md-ink)" : "var(--md-ink-muted)"}
              fontFamily="var(--font-mono)"
              fontWeight={isDrafted ? 700 : 400}
            >
              &rsquo;{String(s.season).slice(2)}
              {isDrafted ? "★" : ""}
            </text>
          );
        });
      })()}
    </svg>
  );
}

const COLS: { key: keyof PlayerSeasonRow; label: string }[] = [
  { key: "pts", label: "PTS" },
  { key: "reb", label: "REB" },
  { key: "ast", label: "AST" },
  { key: "stl", label: "STL" },
  { key: "blk", label: "BLK" },
  { key: "fg_pct", label: "FG%" },
  { key: "ft_pct", label: "FT%" },
  { key: "tov", label: "TOV" },
  { key: "fg3m", label: "3PM" },
  { key: "usg", label: "USG" },
];

// Column widths — fixed so values form vertical lanes regardless of content.
// Order matches COLS. YR is handled separately (sticky, wider).
const COL_W = [46, 40, 40, 36, 36, 44, 44, 36, 36, 44]; // px, right-aligned

// 🥇/🥈 for a 1st/2nd-team All-Defense season — mirrors the medal shown on the
// Classic roster rows (ResultsPanel). Renders nothing when the player wasn't
// selected (or allDef wasn't threaded in, e.g. the draft picker).
function AllDefMedal({ allDef, className = "text-lg" }: { allDef?: number; className?: string }) {
  if (allDef !== 1 && allDef !== 2) return null;
  const label = allDef === 1 ? "1st Team All-Defense" : "2nd Team All-Defense";
  return (
    <span className={`shrink-0 leading-none ${className}`} title={label} aria-label={label}>
      {allDef === 1 ? "🥇" : "🥈"}
    </span>
  );
}

function PositionPills({ positions }: { positions?: Role[] }) {
  if (!positions || positions.length === 0) return null;
  return (
    <span className="flex shrink-0 gap-0.5">
      {positions.map((r) => (
        <span
          key={r}
          className="border border-[var(--md-ink)] px-1 font-cond text-[10px] font-bold uppercase"
          style={{ background: ROLE_BG[r] }}
        >
          {r}
        </span>
      ))}
    </span>
  );
}

function usePlayerSeasons(entityId: string) {
  const [seasons, setSeasons] = useState<PlayerSeasonRow[] | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  useEffect(() => {
    let active = true;
    setStatus("loading");
    loadPlayerSeasons(entityId)
      .then((s) => active && (setSeasons(s), setStatus("ok")))
      .catch(() => active && setStatus("error"));
    return () => {
      active = false;
    };
  }, [entityId]);
  return { seasons: seasons ?? [], status };
}

// ── A full player card — the SLAM editorial "Career Card" treatment.
// The center card is interactive (close / draft); the side cards reuse
// this same full-size render behind the center (blurred by the parent).
function FullCard({
  player,
  onClose,
  onDraft,
  draftable = true,
}: {
  player: CardPlayer;
  onClose?: () => void;
  onDraft?: () => void;
  draftable?: boolean;
}) {
  const { seasons, status } = usePlayerSeasons(player.entityId);

  return (
    <div className="md-card flex max-h-[86vh] w-full flex-col overflow-hidden p-0" style={{ boxShadow: "var(--md-shadow-md)" }}>
      {/* ── CAREER CARD header bar — flame accent strip ── */}
      <div
        className="flex items-center justify-between border-b-2 border-[var(--md-ink)] px-4 py-2"
        style={{ background: "var(--md-coral)" }}
      >
        <span className="font-cond text-[12px] font-bold uppercase tracking-[0.18em] text-[var(--md-white)]">
          Career Card
        </span>
        <div className="flex items-center gap-2">
          {/* entity_id is the player's permanent NBA ID — stable across rebuilds */}
          {player.entityId && (
            <span className="font-mono text-[11px] text-[var(--md-paper)] opacity-80">
              No.&nbsp;{player.entityId}
            </span>
          )}
          {onDraft && (
            <button
              type="button"
              className="md-btn md-btn--sm"
              style={{ background: "var(--md-white)", color: "var(--md-coral)", borderColor: "var(--md-ink)" }}
              onClick={onDraft}
              disabled={!draftable}
              title={draftable ? "Draft this player" : "No open slot fits his position"}
            >
              Draft
            </button>
          )}
          {onClose && (
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="font-cond text-[14px] font-bold leading-none text-[var(--md-white)] hover:text-[var(--md-yellow)]"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── Ink panel: ghost team code + position/franchise pill ──
          Tightened: py-2 (was pt-4 pb-3) to remove the dead band above the name. */}
      <div
        className="relative flex items-end justify-between overflow-hidden px-4 py-2"
        style={{ background: "var(--md-ink)" }}
      >
        {/* Ghost team code — large, very low opacity */}
        <span
          className="pointer-events-none absolute right-2 top-0 select-none font-cover uppercase leading-none"
          style={{
            fontSize: "clamp(52px, 14vw, 90px)",
            letterSpacing: "-0.02em",
            color: "var(--md-ink-2)",
            opacity: 0.8,
            lineHeight: 1,
            userSelect: "none",
          }}
          aria-hidden
        >
          {player.team}
        </span>
        {/* Position + franchise label */}
        <div className="relative z-10 flex items-center gap-2">
          <PositionPills positions={player.positions} />
          <span
            className="font-cond text-[11px] font-bold uppercase tracking-[0.14em]"
            style={{ color: "var(--md-yellow)" }}
          >
            {player.team}
          </span>
          <AllDefMedal allDef={player.allDef} className="text-sm" />
        </div>
      </div>

      {/* ── Player name + subtitle — newsprint panel ── */}
      <div
        className="border-b-2 border-[var(--md-ink)] px-4 pb-3 pt-3"
        style={{ background: "var(--md-white)" }}
      >
        <div className="flex min-w-0 items-start gap-2">
          <h2
            className="font-archivo min-w-0 truncate uppercase leading-none"
            style={{
              fontVariationSettings: '"wdth" 88',
              fontWeight: 800,
              fontSize: "clamp(22px, 5vw, 36px)",
              letterSpacing: "-0.01em",
              lineHeight: 1,
            }}
          >
            {player.playerName}
          </h2>
        </div>
        <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.04em] text-[var(--md-ink-muted)]">
          {player.team} · best year &rsquo;{String(player.season).slice(2)} · career card
        </div>
      </div>
      {/* ── Summary stat strip REMOVED (items 3) — yellow row highlight in table is enough ── */}

      <div className="md-scroll flex-1 overflow-auto" style={{ background: "var(--md-white)" }}>
        {status === "loading" && (
          <div className="py-10 text-center font-mono text-sm text-[var(--md-ink-muted)]">Loading career…</div>
        )}
        {status === "error" && (
          <div className="py-10 text-center font-mono text-sm" style={{ color: "var(--md-coral)" }}>
            Couldn&rsquo;t load this player&rsquo;s history.
          </div>
        )}
        {status === "ok" && seasons.length === 0 && (
          <div className="py-10 text-center font-mono text-sm text-[var(--md-ink-muted)]">
            No season history on record.
          </div>
        )}
        {status === "ok" && seasons.length > 0 && (
          <div className="px-4 pb-4 pt-3">
            {/* GQ chart section */}
            <div className="mb-2 flex items-center gap-2">
              <span
                className="font-archivo uppercase"
                style={{ fontVariationSettings: '"wdth" 88', fontWeight: 800, fontSize: 13, letterSpacing: "0.01em" }}
              >
                Median Game Quality by season
              </span>
              <span
                className="h-px flex-1 bg-[var(--md-paper-3)]"
                aria-hidden
              />
            </div>
            {/* Chart legend — shortened "This Card" label */}
            <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              <LegendItem color="var(--md-coral)" filled label="This Card" />
              <LegendItem color="var(--md-ink)" filled label="On team" />
              <LegendItem color="var(--md-ink-muted)" filled={false} label="Another team" />
            </div>
            <div className="border border-[var(--md-paper-3)]" style={{ background: "var(--md-white)" }}>
              <GqChart seasons={seasons} draftedSeason={player.season} cardTeam={player.team} />
            </div>

            {/* Per-game table */}
            <div className="mb-2 mt-4 flex items-center justify-between">
              <span
                className="font-archivo uppercase"
                style={{ fontVariationSettings: '"wdth" 88', fontWeight: 800, fontSize: 13, letterSpacing: "0.01em" }}
              >
                Per game · by season
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--md-ink-muted)]">
                Swipe →
              </span>
            </div>
            <div className="md-scroll overflow-x-auto border-2 border-[var(--md-ink)]">
              <table
                className="w-full border-collapse"
                style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontVariantNumeric: "tabular-nums" }}
              >
                <thead>
                  <tr style={{ background: "var(--md-ink)" }}>
                    {/* YR sticky column header */}
                    <th
                      className="sticky left-0 z-10 px-2 py-1.5 text-left"
                      style={{
                        background: "var(--md-ink)",
                        color: "var(--md-white)",
                        width: 54,
                        flexShrink: 0,
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        fontWeight: 700,
                      }}
                    >
                      YR
                    </th>
                    {/* All column headers white — USG no longer yellow */}
                    {COLS.map((c, ci) => (
                      <th
                        key={c.key}
                        style={{
                          background: "var(--md-ink)",
                          color: "var(--md-white)",
                          width: COL_W[ci],
                          minWidth: COL_W[ci],
                          flexShrink: 0,
                          textAlign: "right",
                          padding: "6px 6px",
                          fontSize: 10,
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          fontWeight: 700,
                        }}
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {seasons.map((s) => {
                    // On-team: this season was played for the card's franchise.
                    const isAway = s.team !== player.team;
                    const isBest = s.season === player.season;
                    const rowBg = isBest
                      ? "var(--md-yellow)"
                      : isAway
                        ? "var(--md-paper-2)"
                        : "var(--md-white)";
                    return (
                      <tr
                        key={s.season}
                        className="border-t border-[var(--md-paper-3)]"
                        style={
                          isBest
                            ? {
                                background: rowBg,
                                // Flame left bar on the best row
                                boxShadow: "inset 3px 0 0 var(--md-coral)",
                              }
                            : { background: rowBg }
                        }
                      >
                        {/* Sticky YR cell */}
                        <th
                          scope="row"
                          className="sticky left-0 z-10 px-2 py-1 text-left font-bold"
                          style={{
                            background: rowBg,
                            width: 54,
                            flexShrink: 0,
                            // Best row sits on a press-yellow fill — type on yellow is
                            // always ink (never the flame red used elsewhere).
                            color: isBest
                              ? "var(--md-ink)"
                              : isAway
                                ? "var(--md-ink-muted)"
                                : "var(--md-ink)",
                          }}
                        >
                          <span className="flex items-center gap-1">
                            &rsquo;{String(s.season).slice(2)}
                            <span
                              className="font-mono text-[9px]"
                              style={{ color: "var(--md-ink-muted)" }}
                            >
                              {s.team}
                            </span>
                            <AllDefMedal allDef={s.all_def} className="text-[10px]" />
                          </span>
                        </th>
                        {/* All data cells — ink color (no red anywhere in data rows) */}
                        {COLS.map((c, ci) => (
                          <td
                            key={c.key}
                            style={{
                              textAlign: "right",
                              padding: "4px 6px",
                              width: COL_W[ci],
                              minWidth: COL_W[ci],
                              flexShrink: 0,
                              color: isBest
                                ? "var(--md-ink)"
                                : isAway
                                  ? "var(--md-ink-muted)"
                                  : "var(--md-ink)",
                              fontWeight: isBest ? 700 : 400,
                            }}
                          >
                            {f1(s[c.key] as number)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 font-mono text-[10px] leading-snug text-[var(--md-ink-muted)]">
              Game Quality is era-aware: each game is scored only on the box categories the NBA tracked that season. 50 ≈ league average. Greyed seasons were played for another team.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Small legend item for the GQ chart.
function LegendItem({
  color,
  filled,
  label,
}: {
  color: string;
  filled: boolean;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width={10} height={10} viewBox="0 0 10 10" aria-hidden>
        <circle
          cx={5}
          cy={5}
          r={4}
          fill={filled ? color : "var(--md-white)"}
          stroke={color}
          strokeWidth={1.5}
        />
      </svg>
      <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--md-ink-muted)]">
        {label}
      </span>
    </span>
  );
}

// A circular arrow control (SLAM: ink border, white fill, hard shadow).
function Arrow({ dir, onClick }: { dir: "left" | "right"; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={dir === "left" ? "Previous card" : "Next card"}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`absolute top-1/2 z-40 flex h-11 w-11 -translate-y-1/2 items-center justify-center border-2 border-[var(--md-ink)] bg-[var(--md-white)] font-cover text-2xl font-bold leading-none text-[var(--md-ink)] transition-transform hover:scale-105 hover:-translate-y-1/2 ${dir === "left" ? "left-2 sm:left-4" : "right-2 sm:right-4"}`}
      style={{ boxShadow: "var(--md-shadow-sm)", borderRadius: 0 }}
    >
      {dir === "left" ? "‹" : "›"}
    </button>
  );
}

// ── The carousel modal ───────────────────────────────────────────────────────
// A sliding window: the focused card is centered at full size; neighbours sit
// scaled-down, blurred and dimmed to each side; the rest wait off-stage. Every
// card transitions its transform/opacity, so moving slides the deck smoothly.
export function PlayerCardCarousel({
  players,
  index,
  onClose,
  onDraft,
  canDraft,
}: {
  players: CardPlayer[];
  index: number;
  onClose: () => void;
  onDraft?: (index: number) => void;
  canDraft?: (index: number) => boolean;
}) {
  const [cur, setCur] = useState(index);

  const clamp = useCallback(
    (i: number) => Math.max(0, Math.min(players.length - 1, i)),
    [players.length],
  );
  const move = useCallback((d: number) => setCur((c) => clamp(c + d)), [clamp]);

  // Prefetch the current card and its neighbours so movement is instant.
  useEffect(() => {
    for (const i of [cur - 2, cur - 1, cur, cur + 1, cur + 2]) {
      if (players[i]) prefetchPlayerSeasons(players[i].entityId);
    }
  }, [cur, players]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") move(-1);
      else if (e.key === "ArrowRight") move(1);
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, onClose]);

  if (!players[cur]) return null;

  // Render a ±2 window so neighbours can slide in/out from off-stage.
  const windowed = players
    .map((player, idx) => ({ player, idx, slot: idx - cur }))
    .filter((w) => Math.abs(w.slot) <= 2);

  const hasPrev = cur > 0;
  const hasNext = cur < players.length - 1;

  // Portal to <body> so the fixed overlay escapes any ancestor stacking context
  // (e.g. transformed draft cards) and reliably sits above page chrome/footer.
  if (typeof document === "undefined") return null;

  // Navigation is tap-only (arrows + tapping a neighbour card). We deliberately
  // do NOT bind horizontal swipe: on mobile that gesture belongs to the per-season
  // stats table's own left/right scroll, and a card-level swipe would hijack it.
  return createPortal(
    <div
      className="fixed inset-0 z-50 overflow-hidden"
      style={{ background: "rgba(21,17,14,0.75)" }}
      onClick={onClose}
    >
      {windowed.map(({ player, idx, slot }) => {
        const isCenter = slot === 0;
        const off = Math.abs(slot);
        const style: React.CSSProperties = {
          transform: `translate(-50%, -50%) translateX(${slot * 56}%) scale(${isCenter ? 1 : 0.82})`,
          // Neighbours are solid (not see-through) but blurred, so they read as
          // real cards waiting in the deck rather than transparent ghosts. Cards
          // beyond the ±1 window stay hidden (0) as they slide off-stage.
          opacity: isCenter ? 1 : off === 1 ? 1 : 0,
          filter: isCenter ? "none" : "blur(3px)",
          zIndex: 30 - off * 10,
          pointerEvents: off <= 1 ? "auto" : "none",
          transitionProperty: "transform, opacity, filter",
          transitionDuration: "320ms",
          transitionTimingFunction: "cubic-bezier(0.22, 0.61, 0.36, 1)",
        };
        return (
          <div
            key={player.entityId}
            className="absolute left-1/2 top-1/2 w-[92vw] max-w-lg"
            style={style}
            onClick={(e) => {
              e.stopPropagation();
              if (!isCenter) setCur(idx);
            }}
          >
            {isCenter ? (
              <FullCard
                player={player}
                onClose={onClose}
                onDraft={onDraft ? () => onDraft(cur) : undefined}
                draftable={canDraft ? canDraft(cur) : true}
              />
            ) : (
              <div className="pointer-events-none">
                <FullCard player={player} />
              </div>
            )}
          </div>
        );
      })}

      {hasPrev && <Arrow dir="left" onClick={() => move(-1)} />}
      {hasNext && <Arrow dir="right" onClick={() => move(1)} />}
    </div>,
    document.body,
  );
}

// ── A standalone PlayerCard (non-carousel) export used by PlayerList
// and ResultsPanel in browse and result contexts.
export function PlayerCard({
  player,
  onClose,
  onDraft,
  draftable = true,
}: {
  player: CardPlayer;
  onClose?: () => void;
  onDraft?: () => void;
  draftable?: boolean;
}) {
  return (
    <FullCard
      player={player}
      onClose={onClose}
      onDraft={onDraft}
      draftable={draftable}
    />
  );
}
