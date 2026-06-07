"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
}

const ROLE_BG: Record<Role, string> = {
  G: "var(--md-sky)",
  W: "var(--md-teal-bright)",
  B: "var(--md-orange)",
};

const gq100 = (gq: number) => Math.round(gq * 100);
const f1 = (n: number) => n.toFixed(1);

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
];

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
            <PositionPills positions={player.positions} />
          </div>
          <div className="mt-0.5 font-display text-xs uppercase tracking-wide text-[var(--md-ink)]">
            <span className="text-[var(--md-orange-deep)]">{player.team}</span> · drafted &rsquo;{String(player.season).slice(2)} · career card
          </div>
        </div>
        {onClose && (
          <button type="button" aria-label="Close" onClick={onClose} className="font-display text-lg text-[var(--md-ink)] hover:text-[var(--md-coral)]">✕</button>
        )}
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
                    <th className="sticky left-0 z-10 px-2 py-1 text-left" style={{ background: "var(--md-paper-2)" }}>YR</th>
                    <th className="px-2 py-1 text-right text-[var(--md-teal)]">GQ</th>
                    <th className="px-2 py-1 text-right">GP</th>
                    {COLS.map((c) => (
                      <th key={c.key} className="px-2 py-1 text-right">{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {seasons.map((s) => {
                    const away = s.team !== player.team;
                    return (
                      <tr key={s.season} className={`border-t border-[var(--md-paper-3)] ${away ? "text-[var(--md-ink-muted)]" : ""}`}>
                        <th scope="row" className="sticky left-0 z-10 px-2 py-1 text-left font-bold" style={{ background: away ? "var(--md-paper-2)" : "var(--md-white)" }}>
                          &rsquo;{String(s.season).slice(2)}
                        </th>
                        <td className={`px-2 py-1 text-right font-bold ${away ? "" : "text-[var(--md-teal)]"}`}>{gq100(s.gq)}</td>
                        <td className="px-2 py-1 text-right text-[var(--md-ink-muted)]">{s.gp}</td>
                        {COLS.map((c) => (
                          <td key={c.key} className="px-2 py-1 text-right">{f1(s[c.key] as number)}</td>
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

      {/* Draft straight from the card (draft-list context only). */}
      {onDraft && (
        <div className="border-t-2 border-[var(--md-ink)] p-3">
          <button
            type="button"
            className="md-btn md-btn--lg md-btn--teal w-full"
            onClick={onDraft}
            disabled={!draftable}
            style={draftable ? undefined : { opacity: 0.5, cursor: "not-allowed" }}
            title={draftable ? undefined : "No open slot fits his position"}
          >
            Draft {player.playerName}
          </button>
        </div>
      )}
    </div>
  );
}

// ── A full-size side card, tucked partially behind the center (click to focus) ─
function SideCard({
  player,
  side,
  onClick,
}: {
  player: CardPlayer;
  side: "left" | "right";
  onClick: () => void;
}) {
  // Same full card as the center, shifted ~58% off so only its outer edge peeks
  // out from behind the center card, blurred and dimmed.
  const shift = side === "left" ? "-58%" : "58%";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Show ${player.playerName}`}
      className="absolute left-0 top-1/2 z-0 w-full text-left"
      style={{ transform: `translate(${shift}, -50%)`, filter: "blur(2px)", opacity: 0.5 }}
    >
      <div className="pointer-events-none">
        <FullCard player={player} />
      </div>
    </button>
  );
}

// ── The carousel modal ───────────────────────────────────────────────────────
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
  const touchX = useRef<number | null>(null);

  const clamp = useCallback(
    (i: number) => Math.max(0, Math.min(players.length - 1, i)),
    [players.length],
  );
  const goto = useCallback((i: number) => setCur((c) => clamp(i ?? c)), [clamp]);

  // Prefetch the current card and its neighbours so movement is instant.
  useEffect(() => {
    for (const i of [cur - 1, cur, cur + 1]) {
      if (players[i]) prefetchPlayerSeasons(players[i].entityId);
    }
  }, [cur, players]);

  // Keyboard: ← → to move, Esc to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setCur((c) => clamp(c - 1));
      else if (e.key === "ArrowRight") setCur((c) => clamp(c + 1));
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clamp, onClose]);

  const prev = players[cur - 1];
  const next = players[cur + 1];
  const center = players[cur];
  if (!center) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3" style={{ background: "rgba(56,56,56,0.55)" }} onClick={onClose}>
      <div
        className="relative mx-auto w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
          if (dx > 45) setCur((c) => clamp(c - 1));
          else if (dx < -45) setCur((c) => clamp(c + 1));
          touchX.current = null;
        }}
      >
        {/* Full-size neighbours, tucked behind the center card and blurred. */}
        {prev && <SideCard player={prev} side="left" onClick={() => setCur(cur - 1)} />}
        {next && <SideCard player={next} side="right" onClick={() => setCur(cur + 1)} />}

        {/* The focused card, on top. */}
        <div className="relative z-10">
          <FullCard
            player={center}
            onClose={onClose}
            onDraft={onDraft ? () => onDraft(cur) : undefined}
            draftable={canDraft ? canDraft(cur) : true}
          />
        </div>

        {/* Arrow controls (always available, e.g. mobile where peeks run off-screen). */}
        {prev && (
          <button type="button" aria-label="Previous card" onClick={() => setCur(cur - 1)} className="md-card md-card--lift absolute -left-2 top-1/2 z-20 -translate-y-1/2 px-2 py-3 font-display text-xl font-bold">‹</button>
        )}
        {next && (
          <button type="button" aria-label="Next card" onClick={() => setCur(cur + 1)} className="md-card md-card--lift absolute -right-2 top-1/2 z-20 -translate-y-1/2 px-2 py-3 font-display text-xl font-bold">›</button>
        )}
      </div>
    </div>
  );
}
