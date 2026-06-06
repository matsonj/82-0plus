"use client";

import { useEffect, useState } from "react";
import type { PlayerSeasonRow } from "@/lib/queries";
import type { Role } from "@/lib/positions";

type Status = "loading" | "ok" | "error";

const ROLE_BG: Record<Role, string> = {
  G: "var(--md-sky)",
  W: "var(--md-teal-bright)",
  B: "var(--md-orange)",
};

// Map a season's median GQ (0–1) to a 0–100 badge integer, matching the results card.
const gq100 = (gq: number) => Math.round(gq * 100);
// All per-game stats render in 0.0 format (1 block → "1.0", 48 FG% → "48.0").
const f1 = (n: number) => n.toFixed(1);

// ── The median-Game-Quality-by-season chart (hand-rolled SVG, no chart dep) ──
// Y axis is fixed 0–100 so cards are comparable; dashed guides at 25/50/75.
function GqChart({
  seasons,
  draftedSeason,
}: {
  seasons: PlayerSeasonRow[];
  draftedSeason: number;
}) {
  const W = 320;
  const H = 132;
  const padL = 26;
  const padR = 10;
  const padT = 10;
  const padB = 22;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const x = (i: number) =>
    padL + (seasons.length <= 1 ? innerW / 2 : (innerW * i) / (seasons.length - 1));
  // Fixed 0–100 domain (gq is 0–1).
  const y = (gq: number) => padT + innerH * (1 - gq);
  const path = seasons
    .map((s, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(s.gq).toFixed(1)}`)
    .join(" ");
  const firstYr = seasons[0].season;
  const lastYr = seasons[seasons.length - 1].season;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label="Median Game Quality by season"
    >
      <rect
        x={padL}
        y={padT}
        width={innerW}
        height={innerH}
        fill="var(--md-white)"
        stroke="var(--md-ink)"
        strokeWidth={1.5}
      />
      {/* Reference guides at 25 / 50 / 75. */}
      {[25, 50, 75].map((v) => (
        <g key={v}>
          <line
            x1={padL}
            x2={W - padR}
            y1={y(v / 100)}
            y2={y(v / 100)}
            stroke="var(--md-ink-muted)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <text x={2} y={y(v / 100) + 3} fontSize={9} fill="var(--md-ink-muted)">
            {v}
          </text>
        </g>
      ))}
      {/* 0 / 100 bounds. */}
      <text x={2} y={padT + 8} fontSize={9} fill="var(--md-ink-muted)">
        100
      </text>
      <text x={2} y={H - padB} fontSize={9} fill="var(--md-ink-muted)">
        0
      </text>
      <path d={path} fill="none" stroke="var(--md-teal)" strokeWidth={2.5} />
      {seasons.map((s, i) => {
        const isDrafted = s.season === draftedSeason;
        return (
          <g key={s.season}>
            <circle
              cx={x(i)}
              cy={y(s.gq)}
              r={isDrafted ? 4 : 2.5}
              fill={isDrafted ? "var(--md-orange)" : "var(--md-teal)"}
              stroke="var(--md-ink)"
              strokeWidth={1}
            />
            {/* Larger transparent hit target → a native hover tooltip. */}
            <circle cx={x(i)} cy={y(s.gq)} r={9} fill="transparent">
              <title>
                &rsquo;{String(s.season).slice(2)} · GQ {gq100(s.gq)}
              </title>
            </circle>
          </g>
        );
      })}
      <text x={padL} y={H - 6} fontSize={9} fill="var(--md-ink-muted)">
        &rsquo;{String(firstYr).slice(2)}
      </text>
      <text x={W - padR} y={H - 6} fontSize={9} textAnchor="end" fill="var(--md-ink-muted)">
        &rsquo;{String(lastYr).slice(2)}
      </text>
    </svg>
  );
}

// The nine GQ categories as a by-year table.
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

export function PlayerCard({
  entityId,
  playerName,
  team,
  season,
  positions,
  onClose,
}: {
  entityId: string;
  playerName: string;
  team: string;
  season: number;
  positions?: Role[];
  onClose: () => void;
}) {
  const [seasons, setSeasons] = useState<PlayerSeasonRow[]>([]);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let active = true;
    setStatus("loading");
    fetch(`/api/player?id=${encodeURIComponent(entityId)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (!active) return;
        setSeasons(d.seasons ?? []);
        setStatus("ok");
      })
      .catch(() => active && setStatus("error"));
    return () => {
      active = false;
    };
  }, [entityId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(56,56,56,0.55)" }}
      onClick={onClose}
    >
      <div
        className="md-card md-card--lift flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden p-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Card header — the vintage nameplate. */}
        <div
          className="flex items-start justify-between gap-3 border-b-2 border-[var(--md-ink)] p-4"
          style={{ background: "var(--md-yellow)" }}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-display text-xl font-bold leading-tight">
                {playerName}
              </span>
              {positions && positions.length > 0 && (
                <span className="flex shrink-0 gap-0.5">
                  {positions.map((r) => (
                    <span
                      key={r}
                      className="border border-[var(--md-ink)] px-1 font-display text-[10px] font-bold"
                      style={{ background: ROLE_BG[r] }}
                    >
                      {r}
                    </span>
                  ))}
                </span>
              )}
            </div>
            <div className="mt-0.5 font-display text-xs uppercase tracking-wide text-[var(--md-ink)]">
              <span className="text-[var(--md-orange-deep)]">{team}</span> · drafted
              &rsquo;{String(season).slice(2)} · career card
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="font-display text-lg text-[var(--md-ink)] hover:text-[var(--md-coral)]"
          >
            ✕
          </button>
        </div>

        <div className="md-scroll flex-1 overflow-auto p-4">
          {status === "loading" && (
            <div className="py-10 text-center font-display text-sm text-[var(--md-ink-muted)]">
              Loading career…
            </div>
          )}
          {status === "error" && (
            <div className="py-10 text-center font-display text-sm text-[var(--md-coral)]">
              Couldn&rsquo;t load this player&rsquo;s history.
            </div>
          )}
          {status === "ok" && seasons.length === 0 && (
            <div className="py-10 text-center font-display text-sm text-[var(--md-ink-muted)]">
              No season history on record.
            </div>
          )}
          {status === "ok" && seasons.length > 0 && (
            <>
              <div className="mb-1 font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
                Median Game Quality by season
              </div>
              <GqChart seasons={seasons} draftedSeason={season} />

              <div className="mb-1 mt-4 font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
                Per game · by season
              </div>
              <div className="md-scroll overflow-x-auto border-2 border-[var(--md-ink)]">
                <table className="w-full border-collapse font-display text-[11px] tabular-nums">
                  <thead>
                    <tr style={{ background: "var(--md-paper-2)" }}>
                      <th className="sticky left-0 z-10 px-2 py-1 text-left" style={{ background: "var(--md-paper-2)" }}>
                        YR
                      </th>
                      <th className="px-2 py-1 text-right text-[var(--md-teal)]">GQ</th>
                      <th className="px-2 py-1 text-right">GP</th>
                      {COLS.map((c) => (
                        <th key={c.key} className="px-2 py-1 text-right">
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {seasons.map((s) => {
                      // Seasons on a DIFFERENT team than the one we drafted are
                      // greyed — that's not the version of the player on this card.
                      const away = s.team !== team;
                      const rowCls = away ? "text-[var(--md-ink-muted)]" : "";
                      const rowBg = away ? "var(--md-paper-2)" : "var(--md-white)";
                      return (
                        <tr
                          key={s.season}
                          className={`border-t border-[var(--md-paper-3)] ${rowCls}`}
                        >
                          <th
                            scope="row"
                            className="sticky left-0 z-10 px-2 py-1 text-left font-bold"
                            style={{ background: rowBg }}
                          >
                            &rsquo;{String(s.season).slice(2)}
                          </th>
                          <td
                            className={`px-2 py-1 text-right font-bold ${away ? "" : "text-[var(--md-teal)]"}`}
                          >
                            {gq100(s.gq)}
                          </td>
                          <td className="px-2 py-1 text-right text-[var(--md-ink-muted)]">
                            {s.gp}
                          </td>
                          {COLS.map((c) => (
                            <td key={c.key} className="px-2 py-1 text-right">
                              {f1(s[c.key] as number)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 font-display text-[10px] leading-snug text-[var(--md-ink-muted)]">
                Game Quality is era-aware: each game is scored only on the box
                categories the NBA tracked that season. 50 ≈ league average. Greyed
                seasons were played for another team.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
