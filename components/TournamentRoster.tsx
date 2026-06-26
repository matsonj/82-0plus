"use client";

// The unified playoff-entry roster. ONE representation of the squad, shared by
// every step — replacing the old LineupBoard (read-only five) + CaptainPicker
// (a second grid of the same five) duplication. It also IS the captain picker:
// on the captain step each starter is tappable to crown them, so the choice
// happens on the roster you're already looking at.
//
// Two responsive forms via the `variant` prop:
//   "strip"  — horizontal six-up chip row (mobile)
//   "panel"  — vertical dark slot table (desktop sidebar)
//
// The sixth slot changes by step: a live draft target (sixth), a bench player
// that can't be captain (captain), or a locked roster member (submit).

import type { SlotKind } from "@/lib/positions";
import type { LineupEntry } from "@/components/LineupBoard";
import type { EntryStep } from "@/components/TournamentProgress";

function kindLabel(kind: SlotKind): string {
  switch (kind) {
    case "G":
      return "GUARD";
    case "W":
      return "WING";
    case "B":
      return "BIG";
    default:
      return kind; // FLEX
  }
}

function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/);
  const last = parts.pop() ?? name;
  return { first: parts.join(" "), last };
}

function teamYear(e: LineupEntry): string {
  return `${e.team} ’${String(e.player.best_season).slice(2)}`;
}

interface RosterProps {
  kinds: SlotKind[];
  starters: (LineupEntry | null)[];
  sixth: LineupEntry | null;
  step: EntryStep;
  captainSlot: number | null;
  onCrownCaptain?: (slot: number) => void;
  variant: "strip" | "panel";
  className?: string;
}

export function TournamentRoster(props: RosterProps) {
  return props.variant === "strip" ? (
    <RosterStrip {...props} />
  ) : (
    <RosterPanel {...props} />
  );
}

// ── Mobile: horizontal six-up chip strip ────────────────────────────────────
function RosterStrip({
  kinds,
  starters,
  sixth,
  step,
  captainSlot,
  onCrownCaptain,
  className,
}: RosterProps) {
  const label =
    step === "captain"
      ? "Tap to crown your captain"
      : step === "submit"
        ? "Your roster · locked"
        : "Your roster";

  const slotBase =
    "flex flex-1 min-w-0 min-h-[74px] flex-col gap-1 p-1.5 text-left transition-transform";

  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`}>
      <span className="font-cond text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--md-ink-muted)]">
        {label}
      </span>
      <div className="flex items-stretch gap-1.5">
        {starters.map((e, i) => {
          if (!e) return null;
          const isCap = captainSlot === i;
          const crownable = !!onCrownCaptain;
          const { last } = splitName(e.player.player_name);
          const Tag = crownable ? "button" : "div";
          return (
            <Tag
              key={i}
              {...(crownable ? { type: "button", onClick: () => onCrownCaptain!(i) } : {})}
              className={slotBase}
              style={
                isCap
                  ? {
                      background: "var(--md-yellow)",
                      border: "3px solid var(--md-ink)",
                      boxShadow: "var(--md-shadow-sm)",
                      cursor: crownable ? "pointer" : "default",
                    }
                  : {
                      background: "var(--md-white)",
                      border: "2px solid var(--md-ink)",
                      cursor: crownable ? "pointer" : "default",
                    }
              }
            >
              {isCap ? (
                <span className="flex items-center justify-between gap-0.5">
                  <span className="font-cond text-[8px] font-bold uppercase tracking-[0.04em] text-[var(--md-ink)]">
                    {kindLabel(kinds[i])}
                  </span>
                  <span className="text-[11px] leading-none text-[var(--md-ink)]">★</span>
                </span>
              ) : (
                <span className="self-start bg-[var(--md-yellow)] px-1 py-px font-cond text-[8px] font-bold uppercase tracking-[0.04em] text-[var(--md-ink)]">
                  {kindLabel(kinds[i])}
                </span>
              )}
              <span className="whitespace-nowrap font-archivo text-[11px] font-extrabold uppercase leading-[1.02] tracking-[-0.01em] text-[var(--md-ink)]" style={{ fontVariationSettings: '"wdth" 88' }}>
                {last}
              </span>
              {isCap ? (
                <span className="mt-auto font-mono text-[8px] font-bold uppercase tracking-[0.04em] text-[var(--md-ink)]">
                  Captain
                </span>
              ) : (
                <span className="mt-auto font-mono text-[8px] text-[var(--md-coral-deep)]">
                  {teamYear(e)}
                </span>
              )}
            </Tag>
          );
        })}
        <SixthChip sixth={sixth} step={step} base={slotBase} />
      </div>
    </div>
  );
}

function SixthChip({
  sixth,
  step,
  base,
}: {
  sixth: LineupEntry | null;
  step: EntryStep;
  base: string;
}) {
  // Sixth step, not yet drafted: the live red target.
  if (!sixth) {
    return (
      <div
        className={base}
        style={{
          background: "var(--md-ink-2)",
          border: "2px solid var(--md-coral)",
          boxShadow: "3px 3px 0 0 var(--md-coral)",
        }}
      >
        <span className="self-start bg-[var(--md-coral)] px-1 py-px font-cond text-[8px] font-bold uppercase tracking-[0.04em] text-[var(--md-white)]">
          6th
        </span>
        <span className="whitespace-nowrap font-archivo text-[11px] font-extrabold uppercase leading-[1.05] text-[var(--md-paper)]" style={{ fontVariationSettings: '"wdth" 88' }}>
          Pick →
        </span>
        <span className="mt-auto font-mono text-[8px] text-[var(--md-coral)]">drafting</span>
      </div>
    );
  }
  const { last } = splitName(sixth.player.player_name);
  // Captain step: filled but not captain-eligible — dimmed.
  if (step === "captain") {
    return (
      <div
        className={base}
        style={{ background: "var(--md-paper-2)", border: "2px solid var(--md-paper-3)", opacity: 0.85 }}
      >
        <span className="self-start bg-[var(--md-paper-3)] px-1 py-px font-cond text-[8px] font-bold uppercase tracking-[0.04em] text-[var(--md-ink-muted)]">
          6th
        </span>
        <span className="whitespace-nowrap font-archivo text-[11px] font-extrabold uppercase leading-[1.02] text-[var(--md-ink-muted)]" style={{ fontVariationSettings: '"wdth" 88' }}>
          {last}
        </span>
        <span className="mt-auto font-mono text-[8px] text-[var(--md-ink-muted)]">bench</span>
      </div>
    );
  }
  // Submit step: a normal locked roster member.
  return (
    <div className={base} style={{ background: "var(--md-white)", border: "2px solid var(--md-ink)" }}>
      <span className="self-start bg-[var(--md-coral)] px-1 py-px font-cond text-[8px] font-bold uppercase tracking-[0.04em] text-[var(--md-white)]">
        6th
      </span>
      <span className="whitespace-nowrap font-archivo text-[11px] font-extrabold uppercase leading-[1.02] text-[var(--md-ink)]" style={{ fontVariationSettings: '"wdth" 88' }}>
        {last}
      </span>
      <span className="mt-auto font-mono text-[8px] text-[var(--md-coral-deep)]">{teamYear(sixth)}</span>
    </div>
  );
}

// ── Desktop: vertical dark slot table ───────────────────────────────────────
function RosterPanel({
  kinds,
  starters,
  sixth,
  step,
  captainSlot,
  onCrownCaptain,
  className,
}: RosterProps) {
  const status =
    step === "captain"
      ? { text: "Tap to crown →", color: "var(--md-yellow)" }
      : step === "submit"
        ? { text: "6 locked ✓", color: "var(--md-teal-bright)" }
        : { text: "5 locked", color: "var(--md-yellow)" };

  return (
    <div
      className={`flex flex-col gap-1 p-6 ${className ?? ""}`}
      style={{
        background: "var(--md-ink)",
        border: "2.5px solid var(--md-coral)",
        boxShadow: "6px 6px 0 0 var(--md-ink-2)",
      }}
    >
      <div className="mb-3 flex items-baseline justify-between">
        <span className="font-cover text-[26px] uppercase leading-none text-[var(--md-paper)]">
          Your Roster
        </span>
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: status.color }}>
          {status.text}
        </span>
      </div>
      {starters.map((e, i) => {
        if (!e) return null;
        const isCap = captainSlot === i;
        const crownable = !!onCrownCaptain;
        const { first, last } = splitName(e.player.player_name);
        const Tag = crownable ? "button" : "div";
        return (
          <Tag
            key={i}
            {...(crownable ? { type: "button", onClick: () => onCrownCaptain!(i) } : {})}
            className="flex w-full items-center gap-3.5 px-3 py-3 text-left"
            style={
              isCap
                ? {
                    background: "var(--md-yellow)",
                    border: "2px solid var(--md-ink)",
                    boxShadow: "4px 4px 0 0 var(--md-ink)",
                    cursor: crownable ? "pointer" : "default",
                  }
                : {
                    borderBottom: "1px solid var(--md-ink-2)",
                    cursor: crownable ? "pointer" : "default",
                  }
            }
          >
            <span
              className="w-14 shrink-0 px-1.5 py-0.5 text-center font-cond text-[10px] font-bold uppercase tracking-[0.04em]"
              style={{ background: "var(--md-yellow)", color: "var(--md-ink)" }}
            >
              {kindLabel(kinds[i])}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-px">
              <span className="font-archivo text-[15px] font-extrabold uppercase" style={{ color: isCap ? "var(--md-ink)" : "var(--md-paper)" }}>
                {last}
              </span>
              <span className="font-mono text-[11px]" style={{ color: isCap ? "var(--md-coral-deep)" : "var(--md-ink-muted)" }}>
                {first ? `${first} · ` : ""}{teamYear(e)}
              </span>
            </span>
            <RightCell
              kind={isCap ? "captain" : crownable ? "crownable" : "set"}
            />
          </Tag>
        );
      })}
      <SixthRow sixth={sixth} step={step} />
    </div>
  );
}

function RightCell({ kind }: { kind: "set" | "crownable" | "captain" | "drafting" | "bench" }) {
  if (kind === "captain") {
    return (
      <span className="shrink-0 font-cond text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--md-ink)]">
        ★ Captain
      </span>
    );
  }
  if (kind === "crownable") {
    return <span className="shrink-0 text-[16px] leading-none text-[var(--md-ink-muted)]">○</span>;
  }
  if (kind === "drafting") {
    return (
      <span className="w-[78px] shrink-0 border-[1.5px] py-[3px] text-center font-cond text-[10px] font-bold uppercase tracking-[0.08em]" style={{ borderColor: "var(--md-coral)", color: "var(--md-coral)" }}>
        Drafting
      </span>
    );
  }
  if (kind === "bench") {
    return <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--md-ink-muted)]">Bench</span>;
  }
  return (
    <span className="w-[78px] shrink-0 border-[1.5px] py-[3px] text-center font-cond text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--md-ink-muted)]" style={{ borderColor: "#3a322a" }}>
      Set
    </span>
  );
}

function SixthRow({ sixth, step }: { sixth: LineupEntry | null; step: EntryStep }) {
  if (!sixth) {
    return (
      <div className="mt-1.5 flex items-center gap-3.5 px-3 py-3" style={{ background: "var(--md-ink-2)", boxShadow: "inset 3px 0 0 0 var(--md-coral)" }}>
        <span className="w-14 shrink-0 px-1.5 py-0.5 text-center font-cond text-[10px] font-bold uppercase tracking-[0.04em]" style={{ background: "var(--md-coral)", color: "var(--md-white)" }}>
          6th
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="font-archivo text-[15px] font-extrabold uppercase text-[var(--md-paper)]">Your bench pick</span>
          <span className="font-mono text-[11px] text-[var(--md-coral)]">pick on the left →</span>
        </span>
        <RightCell kind="drafting" />
      </div>
    );
  }
  const { first, last } = splitName(sixth.player.player_name);
  const bench = step === "captain";
  return (
    <div className="flex items-center gap-3.5 px-3 py-3" style={bench ? { opacity: 0.55 } : { borderTop: "1px solid var(--md-ink-2)" }}>
      <span
        className="w-14 shrink-0 px-1.5 py-0.5 text-center font-cond text-[10px] font-bold uppercase tracking-[0.04em]"
        style={bench ? { background: "var(--md-ink-muted)", color: "var(--md-white)" } : { background: "var(--md-coral)", color: "var(--md-white)" }}
      >
        6th
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="font-archivo text-[15px] font-extrabold uppercase text-[var(--md-paper)]">{last}</span>
        <span className="font-mono text-[11px] text-[var(--md-ink-muted)]">{first ? `${first} · ` : ""}{teamYear(sixth)}</span>
      </span>
      <RightCell kind={bench ? "bench" : "set"} />
    </div>
  );
}
