"use client";

import { useEffect, useMemo, useState } from "react";
import type { GameMode, PlayerOption } from "@/lib/types";
import { eligiblePositions, type Role } from "@/lib/positions";

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const ROLE_BG: Record<Role, string> = {
  G: "var(--md-sky)",
  W: "var(--md-teal-bright)",
  B: "var(--md-orange)",
};

export function PlayerList({
  team,
  decade,
  mode,
  draftable,
  onPick,
  onNoneEligible,
}: {
  team: string;
  decade: number;
  mode: GameMode;
  draftable: (p: PlayerOption) => boolean;
  onPick: (p: PlayerOption) => void;
  onNoneEligible: () => void;
}) {
  const [all, setAll] = useState<PlayerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setQ("");
    fetch(`/api/players?team=${team}&decade=${decade}`)
      .then((r) => r.json())
      .then((d) => {
        if (active) {
          setAll(d.players ?? []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setAll([]);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [team, decade]);

  const available = useMemo(() => all.filter(draftable), [all, draftable]);
  const rows = useMemo(() => {
    const nq = norm(q);
    return available.filter((p) => nq === "" || norm(p.player_name).includes(nq));
  }, [available, q]);

  const noneEligible = !loading && available.length === 0;

  return (
    <div className="flex flex-col gap-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={`Filter ${team} roster…`}
        className="w-full border-2 border-[var(--md-ink)] bg-[var(--md-white)] px-3 py-2 font-display text-sm outline-none focus:bg-[var(--md-paper)]"
      />
      <div
        className="md-scroll max-h-[20rem] overflow-auto border-2 border-[var(--md-ink)] bg-[var(--md-white)]"
        style={{ boxShadow: "var(--md-shadow-md)" }}
      >
        {loading && (
          <div className="px-3 py-6 text-center font-display text-sm text-[var(--md-ink-muted)]">
            Loading roster…
          </div>
        )}
        {noneEligible && (
          <div className="flex flex-col items-center gap-2 px-3 py-6 text-center">
            <div className="font-display text-sm text-[var(--md-ink-muted)]">
              No one here fits your open slots.
            </div>
            <button className="md-btn md-btn--sm" onClick={onNoneEligible}>
              ↻ Respin team (free)
            </button>
          </div>
        )}
        {!loading &&
          rows.map((p, i) => (
            <button
              key={p.entity_id}
              onClick={() => onPick(p)}
              className="flex w-full items-center justify-between gap-3 border-b border-[var(--md-paper-3)] px-3 py-2 text-left transition-colors hover:bg-[var(--md-yellow)]"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-display text-xs text-[var(--md-ink-muted)]">
                    {i + 1}.
                  </span>
                  <span className="flex gap-0.5">
                    {eligiblePositions(p).map((r) => (
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
                  </span>
                  <span className="font-display text-xs text-[var(--md-ink-muted)]">
                    &rsquo;{String(p.best_season).slice(2)}
                  </span>
                </div>
                {mode === "classic" && (
                  <div className="mt-0.5 font-display text-xs text-[var(--md-ink-muted)]">
                    {p.pts} pts · {p.reb} reb · {p.ast} ast · {p.stl} stl ·{" "}
                    {p.blk} blk
                  </div>
                )}
              </div>
              <div className="shrink-0 text-right">
                {mode === "classic" ? (
                  <>
                    <div className="font-display text-sm font-bold text-[var(--md-orange-deep)]">
                      {p.mpg}
                    </div>
                    <div className="font-display text-[10px] uppercase tracking-wide text-[var(--md-ink-muted)]">
                      mpg
                    </div>
                  </>
                ) : (
                  <div className="md-capsule md-capsule--sky">Pick</div>
                )}
              </div>
            </button>
          ))}
      </div>
    </div>
  );
}
