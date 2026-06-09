"use client";

import { useEffect, useMemo, useState } from "react";
import type { GameMode, PublicPlayer } from "@/lib/types";
import type { Role } from "@/lib/positions";
import { PlayerCardCarousel, CardGlyph, type CardPlayer } from "@/components/PlayerCard";
import { prefetchPlayerSeasons } from "@/lib/playerSeasons";

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const ROLE_BG: Record<Role, string> = {
  G: "var(--md-sky)",
  W: "var(--md-teal-bright)",
  B: "var(--md-orange)",
};

type Status = "loading" | "ok" | "error";
type SortKey = "mpg" | "pts" | "reb" | "ast" | "stl" | "blk";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "mpg", label: "MPG" },
  { key: "pts", label: "PPG" },
  { key: "reb", label: "RPG" },
  { key: "ast", label: "APG" },
  { key: "stl", label: "SPG" },
  { key: "blk", label: "BPG" },
];
const POS_FILTERS: ("all" | Role)[] = ["all", "G", "W", "B"];

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="border-2 border-[var(--md-ink)] px-2 py-1 font-display text-[11px] font-bold uppercase tracking-wide"
      style={{
        background: active ? "var(--md-ink)" : "var(--md-white)",
        color: active ? "var(--md-white)" : "var(--md-ink)",
      }}
    >
      {children}
    </button>
  );
}

export function PlayerList({
  team,
  decade,
  mode,
  allowRespin,
  draftable,
  onPick,
  onNoneEligible,
}: {
  team: string;
  decade: number;
  mode: GameMode;
  allowRespin: boolean;
  draftable: (p: PublicPlayer) => boolean;
  onPick: (p: PublicPlayer) => void;
  onNoneEligible: () => void;
}) {
  const [all, setAll] = useState<PublicPlayer[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [q, setQ] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("mpg");
  const [posFilter, setPosFilter] = useState<"all" | Role>("all");
  const [cardIndex, setCardIndex] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    setQ("");
    fetch(`/api/players?team=${team}&decade=${decade}&mode=${mode}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (active) {
          setAll(d.players ?? []);
          setStatus("ok");
        }
      })
      .catch(() => {
        if (active) {
          setAll([]);
          setStatus("error");
        }
      });
    return () => {
      active = false;
    };
  }, [team, decade, mode, reloadKey]);

  const available = useMemo(() => all.filter(draftable), [all, draftable]);
  const rows = useMemo(() => {
    const nq = norm(q);
    const filtered = all.filter(
      (p) =>
        (posFilter === "all" || p.positions.includes(posFilter)) &&
        (nq === "" || norm(p.player_name).includes(nq)),
    );
    // Default + Ranked stay on the server's minutes order; Classic can re-sort.
    // Non-eligible players keep their natural sort position — just greyed, not
    // pushed to the bottom.
    if (mode === "classic") {
      return [...filtered].sort(
        (a, b) => Number(b[sortKey] ?? 0) - Number(a[sortKey] ?? 0),
      );
    }
    return filtered;
  }, [all, q, sortKey, posFilter, mode]);

  const noneEligible = status === "ok" && available.length === 0;

  // The carousel scans the currently displayed rows (same order/index).
  const cardPlayers = useMemo<CardPlayer[]>(
    () =>
      rows.map((p) => ({
        entityId: p.entity_id,
        playerName: p.player_name,
        team,
        season: p.best_season,
        positions: p.positions,
        // Mirror the picker row's medal in the card header (matches ResultsPanel).
        allDef: p.allDef ?? undefined,
      })),
    [rows, team],
  );

  return (
    <div className="flex flex-col gap-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={`Filter ${team} roster…`}
        className="w-full border-2 border-[var(--md-ink)] bg-[var(--md-white)] px-3 py-2 font-display text-sm outline-none focus:bg-[var(--md-paper)]"
      />

      {mode === "classic" && status === "ok" && (
        <div className="flex flex-wrap items-center gap-1">
          {POS_FILTERS.map((p) => (
            <Chip
              key={p}
              active={posFilter === p}
              onClick={() => setPosFilter(p)}
            >
              {p === "all" ? "All" : p}
            </Chip>
          ))}
          <span
            className="mx-1 h-4 w-px self-center bg-[var(--md-ink)] opacity-30"
            aria-hidden
          />
          <span className="mr-0.5 font-display text-[10px] uppercase tracking-wide text-[var(--md-ink-muted)]">
            Sort
          </span>
          {SORTS.map((s) => (
            <Chip
              key={s.key}
              active={sortKey === s.key}
              onClick={() => setSortKey(s.key)}
            >
              {s.label}
            </Chip>
          ))}
        </div>
      )}

      <div
        className="md-scroll max-h-[18rem] overflow-auto border-2 border-[var(--md-ink)] bg-[var(--md-white)]"
        style={{ boxShadow: "var(--md-shadow-md)" }}
      >
        {status === "loading" && (
          <div className="px-3 py-6 text-center font-display text-sm text-[var(--md-ink-muted)]">
            Loading roster…
          </div>
        )}
        {status === "error" && (
          <div className="flex flex-col items-center gap-2 px-3 py-6 text-center">
            <div className="font-display text-sm text-[var(--md-coral)]">
              Couldn&rsquo;t load this roster.
            </div>
            <button
              className="md-btn md-btn--sm"
              onClick={() => setReloadKey((k) => k + 1)}
            >
              ↻ Try again
            </button>
          </div>
        )}
        {noneEligible && (
          <div className="flex flex-col items-center gap-2 px-3 py-6 text-center">
            <div className="font-display text-sm text-[var(--md-ink-muted)]">
              No one here fits your open slots.
            </div>
            {allowRespin ? (
              <button className="md-btn md-btn--sm" onClick={onNoneEligible}>
                ↻ Respin team (free)
              </button>
            ) : (
              // Daily mode is a fixed, seeded challenge — no random respin. Move
              // an already-drafted player to free up a slot {team} can fill.
              <div className="max-w-[16rem] font-display text-xs text-[var(--md-ink-muted)]">
                Tap a drafted player, then an open slot, to rearrange and free a
                spot {team} can fill.
              </div>
            )}
          </div>
        )}
        {status === "ok" && !noneEligible && rows.length === 0 && (
          <div className="px-3 py-6 text-center font-display text-sm text-[var(--md-ink-muted)]">
            No {posFilter === "all" ? "" : `${posFilter} `}players match.
          </div>
        )}
        {status === "ok" &&
          rows.map((p, i) => {
            // Greyed + unclickable when the player can't fill any open slot —
            // shown rather than hidden so you can see who's on the roster.
            const eligible = draftable(p);
            return (
            <div
              key={p.entity_id}
              className="flex items-stretch border-b border-[var(--md-paper-3)]"
            >
            <button
              onClick={() => onPick(p)}
              disabled={!eligible}
              title={eligible ? undefined : "No open slot fits his position"}
              className={`flex flex-1 items-center justify-between gap-3 px-3 py-2 text-left transition-colors ${
                eligible
                  ? "hover:bg-[var(--md-yellow)]"
                  : "cursor-not-allowed opacity-40"
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-display text-xs text-[var(--md-ink-muted)]">
                    {i + 1}.
                  </span>
                  <span className="flex gap-0.5">
                    {p.positions.map((r) => (
                      <span
                        key={r}
                        className="border border-[var(--md-ink)] px-1 font-display text-[10px] font-bold"
                        style={{ background: ROLE_BG[r] }}
                      >
                        {r}
                      </span>
                    ))}
                  </span>
                  <span className="truncate font-display text-sm font-bold">
                    {p.player_name}
                    {p.allDef === 1 ? (
                      <span title="All-Defense 1st Team"> 🥇</span>
                    ) : p.allDef === 2 ? (
                      <span title="All-Defense 2nd Team"> 🥈</span>
                    ) : null}
                  </span>
                  <span className="font-display text-xs text-[var(--md-ink-muted)]">
                    &rsquo;{String(p.best_season).slice(2)}
                  </span>
                </div>
                {mode === "classic" && p.pts !== null && (
                  <div className="mt-0.5 font-display text-xs text-[var(--md-ink-muted)]">
                    {p.pts} pts · {p.reb} reb · {p.ast} ast · {p.stl} stl ·{" "}
                    {p.blk} blk
                  </div>
                )}
              </div>
              <div className="shrink-0 text-right">
                {mode === "classic" && p.mpg !== null ? (
                  <>
                    <div className="font-display text-sm font-bold text-[var(--md-orange-deep)]">
                      {sortKey === "mpg" ? p.mpg : (p[sortKey] ?? 0)}
                    </div>
                    <div className="font-display text-[10px] uppercase tracking-wide text-[var(--md-ink-muted)]">
                      {SORTS.find((s) => s.key === sortKey)?.label}
                    </div>
                  </>
                ) : (
                  <div className="md-capsule md-capsule--sky">Pick</div>
                )}
              </div>
            </button>
            {/* Classic only: open the player's career card (stats are hidden in
                Ranked/Daily, so the card would be a spoiler there). */}
            {mode === "classic" && (
              <button
                type="button"
                onClick={() => setCardIndex(i)}
                onMouseEnter={() => prefetchPlayerSeasons(p.entity_id)}
                onFocus={() => prefetchPlayerSeasons(p.entity_id)}
                title="Career card"
                aria-label={`${p.player_name} career card`}
                className="flex shrink-0 items-center border-l border-[var(--md-paper-3)] px-2.5 text-[var(--md-ink-muted)] hover:bg-[var(--md-yellow)] hover:text-[var(--md-ink)]"
              >
                <CardGlyph />
              </button>
            )}
            </div>
            );
          })}
      </div>

      {cardIndex !== null && cardPlayers[cardIndex] && (
        <PlayerCardCarousel
          players={cardPlayers}
          index={cardIndex}
          onClose={() => setCardIndex(null)}
          canDraft={(i) => !!rows[i] && draftable(rows[i])}
          onDraft={(i) => {
            const row = rows[i];
            if (row && draftable(row)) {
              onPick(row);
              setCardIndex(null);
            }
          }}
        />
      )}
    </div>
  );
}
