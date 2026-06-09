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

// ── median-GQ-by-season chart (hand-rolled SVG). Fixed 0–100, guides at 25/50/75.
function GqChart({
  seasons,
  draftedSeason,
  compact = false,
}: {
  seasons: PlayerSeasonRow[];
  draftedSeason: number;
  compact?: boolean;
}) {
  const W = 320;
  const H = compact ? 96 : 132;
  const padL = 26;
  const padR = 10;
  const padT = 10;
  const padB = compact ? 6 : 22;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const x = (i: number) =>
    padL + (seasons.length <= 1 ? innerW / 2 : (innerW * i) / (seasons.length - 1));
  const y = (gq: number) => padT + innerH * (1 - gq);
  const path = seasons
    .map((s, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(s.gq).toFixed(1)}`)
    .join(" ");
  const firstYr = seasons[0].season;
  const lastYr = seasons[seasons.length - 1].season;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Median Game Quality by season">
      <rect x={padL} y={padT} width={innerW} height={innerH} fill="var(--md-white)" stroke="var(--md-ink)" strokeWidth={1.5} />
      {[25, 50, 75].map((v) => (
        <g key={v}>
          <line x1={padL} x2={W - padR} y1={y(v / 100)} y2={y(v / 100)} stroke="var(--md-ink-muted)" strokeWidth={1} strokeDasharray="3 3" />
          {!compact && (
            <text x={2} y={y(v / 100) + 3} fontSize={9} fill="var(--md-ink-muted)">{v}</text>
          )}
        </g>
      ))}
      {!compact && (
        <>
          <text x={2} y={padT + 8} fontSize={9} fill="var(--md-ink-muted)">100</text>
          <text x={2} y={H - padB} fontSize={9} fill="var(--md-ink-muted)">0</text>
        </>
      )}
      <path d={path} fill="none" stroke="var(--md-teal)" strokeWidth={2.5} />
      {seasons.map((s, i) => {
        const isDrafted = s.season === draftedSeason;
        return (
          <g key={s.season}>
            <circle cx={x(i)} cy={y(s.gq)} r={isDrafted ? 4 : 2.5} fill={isDrafted ? "var(--md-orange)" : "var(--md-teal)"} stroke="var(--md-ink)" strokeWidth={1} />
            <circle cx={x(i)} cy={y(s.gq)} r={9} fill="transparent">
              <title>&rsquo;{String(s.season).slice(2)} · GQ {gq100(s.gq)}</title>
            </circle>
          </g>
        );
      })}
      {!compact && (
        <>
          <text x={padL} y={H - 6} fontSize={9} fill="var(--md-ink-muted)">&rsquo;{String(firstYr).slice(2)}</text>
          <text x={W - padR} y={H - 6} fontSize={9} textAnchor="end" fill="var(--md-ink-muted)">&rsquo;{String(lastYr).slice(2)}</text>
        </>
      )}
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
        <span key={r} className="border border-[var(--md-ink)] px-1 font-display text-[10px] font-bold" style={{ background: ROLE_BG[r] }}>
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

// ── A full player card. The center card is interactive (close / draft); the side
// cards reuse this same full-size render behind the center (blurred by the parent).
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
    <div className="md-card md-card--lift flex max-h-[86vh] w-full flex-col overflow-hidden p-0">
      <div className="flex items-start justify-between gap-3 border-b-2 border-[var(--md-ink)] p-4" style={{ background: "var(--md-yellow)" }}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-display text-xl font-bold leading-tight">{player.playerName}</span>
            <AllDefMedal allDef={player.allDef} />
            <PositionPills positions={player.positions} />
          </div>
          <div className="mt-0.5 font-display text-xs uppercase tracking-wide text-[var(--md-ink)]">
            <span className="text-[var(--md-orange-deep)]">{player.team}</span> · best year &rsquo;{String(player.season).slice(2)} · career card
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onDraft && (
            <button
              type="button"
              className="md-btn md-btn--sm md-btn--teal"
              onClick={onDraft}
              disabled={!draftable}
              style={draftable ? undefined : { opacity: 0.5, cursor: "not-allowed" }}
              title={draftable ? "Draft this player" : "No open slot fits his position"}
            >
              Draft
            </button>
          )}
          {onClose && (
            <button type="button" aria-label="Close" onClick={onClose} className="font-display text-lg leading-none text-[var(--md-ink)] hover:text-[var(--md-coral)]">✕</button>
          )}
        </div>
      </div>

      <div className="md-scroll flex-1 overflow-auto p-4">
        {status === "loading" && (
          <div className="py-10 text-center font-display text-sm text-[var(--md-ink-muted)]">Loading career…</div>
        )}
        {status === "error" && (
          <div className="py-10 text-center font-display text-sm text-[var(--md-coral)]">Couldn&rsquo;t load this player&rsquo;s history.</div>
        )}
        {status === "ok" && seasons.length === 0 && (
          <div className="py-10 text-center font-display text-sm text-[var(--md-ink-muted)]">No season history on record.</div>
        )}
        {status === "ok" && seasons.length > 0 && (
          <>
            <div className="mb-1 font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">Median Game Quality by season</div>
            <GqChart seasons={seasons} draftedSeason={player.season} />
            <div className="mb-1 mt-4 font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">Per game · by season</div>
            <div className="md-scroll overflow-x-auto border-2 border-[var(--md-ink)]">
              <table className="w-full border-collapse font-display text-[11px] tabular-nums">
                <thead>
                  <tr style={{ background: "var(--md-paper-2)" }}>
                    <th className="sticky left-0 z-10 px-1.5 py-1 text-left" style={{ background: "var(--md-white)" }}>YR</th>
                    {COLS.map((c) => (
                      <th key={c.key} className="px-1.5 py-1 text-right">{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {seasons.map((s) => {
                    const away = s.team !== player.team;
                    // Off-team seasons get a light grey wash + muted text so the
                    // drafted franchise's "relevant" seasons read at a glance. The
                    // sticky YR header must share the row's bg to stay opaque on scroll.
                    const rowBg = away ? "var(--md-paper-2)" : undefined;
                    return (
                      <tr
                        key={s.season}
                        className={`border-t border-[var(--md-paper-3)] ${away ? "text-[var(--md-ink-muted)]" : ""}`}
                        style={rowBg ? { background: rowBg } : undefined}
                      >
                        <th
                          scope="row"
                          className="sticky left-0 z-10 px-1.5 py-1 text-left font-bold"
                          style={{ background: rowBg ?? "var(--md-white)" }}
                        >
                          <span className="flex items-center gap-1">
                            &rsquo;{String(s.season).slice(2)}
                            <AllDefMedal allDef={s.all_def} className="text-[10px]" />
                          </span>
                        </th>
                        {COLS.map((c) => (
                          <td key={c.key} className="px-1.5 py-1 text-right">{f1(s[c.key] as number)}</td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 font-display text-[10px] leading-snug text-[var(--md-ink-muted)]">
              Game Quality is era-aware: each game is scored only on the box categories the NBA tracked that season. 50 ≈ league average. Greyed seasons were played for another team.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// A circular arrow control (on-brand: ink border, white fill, hard shadow).
function Arrow({ dir, onClick }: { dir: "left" | "right"; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={dir === "left" ? "Previous card" : "Next card"}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`absolute top-1/2 z-40 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border-2 border-[var(--md-ink)] bg-[var(--md-white)] font-display text-2xl font-bold leading-none text-[var(--md-ink)] transition-transform hover:-translate-y-1/2 hover:scale-110 ${dir === "left" ? "left-2 sm:left-4" : "right-2 sm:right-4"}`}
      style={{ boxShadow: "var(--md-shadow-sm)" }}
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
      style={{ background: "rgba(56,56,56,0.6)" }}
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
