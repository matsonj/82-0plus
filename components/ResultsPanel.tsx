"use client";

import type { RosterEntry, SimResult } from "@/lib/types";

function Bar({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  const pct = Math.round(value * 100);
  const color =
    value >= 0.95
      ? "var(--md-teal-bright)"
      : value >= 0.8
        ? "var(--md-yellow)"
        : "var(--md-coral)";
  return (
    <div>
      <div className="flex items-baseline justify-between font-display text-xs font-bold uppercase tracking-wide">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="mt-1 h-3 border-2 border-[var(--md-ink)] bg-[var(--md-paper-2)]">
        <div className="h-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="mt-1 text-[11px] leading-snug text-[var(--md-ink-muted)]">
        {hint}
      </div>
    </div>
  );
}

export function ResultsPanel({
  roster,
  result,
  onReset,
}: {
  roster: RosterEntry[];
  result: SimResult;
  onReset: () => void;
}) {
  const { wins, losses, pf, pa, perfect, netRating } = result;

  return (
    <div className="md-card md-card--lift flex flex-col gap-6 p-6">
      <div className="text-center">
        {perfect ? (
          <div className="md-capsule md-capsule--teal mb-3">
            🏆 Perfect Season
          </div>
        ) : (
          <div className="md-capsule mb-3">Final Record</div>
        )}
        <div
          className="font-display font-bold"
          style={{ fontSize: "72px", lineHeight: 1 }}
        >
          {wins}&ndash;{losses}
        </div>
        <div className="mt-2 font-display text-sm text-[var(--md-ink-muted)]">
          {pf} scored · {pa} allowed ·{" "}
          <span
            style={{
              color: netRating >= 0 ? "var(--md-teal)" : "var(--md-coral)",
            }}
          >
            {netRating >= 0 ? "+" : ""}
            {netRating.toFixed(1)} net
          </span>
        </div>
        <div className="mt-1 font-display text-xs text-[var(--md-ink-muted)]">
          82-0 needs ≈ +15.2 net
        </div>
      </div>

      <div className="grid gap-4">
        <Bar
          label="Usage fit"
          value={result.usageFactor}
          hint="How well your scorers share one ball. Stacking ball-dominant stars throttles this."
        />
        <Bar
          label="Ball-handling"
          value={result.pAst}
          hint={`Playmaking vs. target. ${result.totalAst} combined assists.`}
        />
        <Bar
          label="3pt spacing"
          value={result.p3}
          hint={`Floor spacing vs. target. ${result.total3m} combined made 3s.`}
        />
        <Bar
          label="Defense"
          value={result.defenseFactor}
          hint={`Steals + blocks vs. target. ${result.totalStocks} combined stocks.`}
        />
        <div>
          <div className="flex items-baseline justify-between font-display text-xs font-bold uppercase tracking-wide">
            <span>Lineup</span>
            <span>
              {result.roleCounts.G}G · {result.roleCounts.W}W ·{" "}
              {result.roleCounts.B}B
            </span>
          </div>
          <div className="mt-1 text-[11px] leading-snug text-[var(--md-ink-muted)]">
            {result.balancePen > 0 ? (
              <span style={{ color: "var(--md-coral)" }}>
                −{result.balancePen} net — lopsided lineup
                {result.roleCounts.G === 0 ? " (no true guard)" : ""}
                {result.roleCounts.B === 0 ? " (no true big)" : ""}. A combo player
                can fill the slot, but you still need real backcourt and frontcourt.
              </span>
            ) : result.synergyBonus > 0 ? (
              <span style={{ color: "var(--md-teal)" }}>
                +{result.synergyBonus} net — flawless construction bonus. Clean,
                balanced fit amplifies your talent.
              </span>
            ) : (
              "Balance the lineup and push every fit bar to 100% to unlock the construction bonus that reaches 82-0."
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-1">
        <div className="font-display text-xs font-bold uppercase tracking-wide text-[var(--md-ink-muted)]">
          Your roster
        </div>
        {roster.map((r) => (
          <div
            key={r.entity_id}
            className="flex items-baseline justify-between gap-2 border-b border-[var(--md-paper-3)] py-1 font-display text-sm"
          >
            <span>
              <span className="text-[var(--md-orange-deep)]">{r.team}</span> &rsquo;
              {String(r.best_season).slice(2)} · {r.player_name}
            </span>
            <span className="text-[var(--md-ink-muted)]">
              {r.pts}/{r.reb}/{r.ast}
            </span>
          </div>
        ))}
      </div>

      <button
        className="md-btn md-btn--lg md-btn--ink self-center"
        onClick={onReset}
      >
        Play again
      </button>
    </div>
  );
}
