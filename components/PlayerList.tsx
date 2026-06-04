"use client";

import { useEffect, useMemo, useState } from "react";
import type { GameMode, PublicPlayer } from "@/lib/types";
import type { Role } from "@/lib/positions";

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const ROLE_BG: Record<Role, string> = {
  G: "var(--md-sky)",
  W: "var(--md-teal-bright)",
  B: "var(--md-orange)",
};

type Status = "loading" | "ok" | "error";

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
  draftable: (p: PublicPlayer) => boolean;
  onPick: (p: PublicPlayer) => void;
  onNoneEligible: () => void;
}) {
  const [all, setAll] = useState<PublicPlayer[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [q, setQ] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

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
    return available.filter((p) => nq === "" || norm(p.player_name).includes(nq));
  }, [available, q]);

  // Only a genuinely-loaded-but-empty roster offers the free respin; a failed
  // load is a distinct error so we don't treat a data/token outage as "no players".
  const noneEligible = status === "ok" && available.length === 0;

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
            <button className="md-btn md-btn--sm" onClick={onNoneEligible}>
              ↻ Respin team (free)
            </button>
          </div>
        )}
        {status === "ok" &&
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
