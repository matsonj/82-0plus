import type { ReactNode } from "react";
import Link from "next/link";
import type { GameMode } from "@/lib/types";
import { PageHeader } from "@/components/layout/PageHeader";

export function HomeMenu({
  dateline,
  dailyBody,
  dailyHistory,
  onStartGame,
}: {
  dateline: string | null;
  dailyBody: ReactNode;
  dailyHistory: ReactNode;
  onStartGame: (mode: GameMode) => void;
}) {
  return (
    <section className="relative z-10 grid gap-6 md:grid-cols-[1.6fr_1fr]">
      <div className="flex flex-col gap-6 md:col-start-1 md:row-start-1">
        <PageHeader
          eyebrowLeft="A daily basketball draft puzzle"
          eyebrowRight={dateline}
          kicker={<>Today&rsquo;s draft is live.</>}
          title={
            <>
              <span>Go</span>
              <span className="text-[var(--md-coral)]">Undefeated.</span>
            </>
          }
          titleClassName="flex flex-wrap items-baseline gap-x-4"
          titleStyle={{
            fontSize: "clamp(46px, 5.4vw, 74px)",
            lineHeight: 0.9,
            letterSpacing: "-0.01em",
          }}
          afterTitle={
            <div className="mt-4 flex flex-col gap-[3px]">
              <div className="h-[5px] w-full bg-[var(--md-ink)]" />
              <div className="h-[2px] w-1/2 max-w-[320px] bg-[var(--md-coral)]" />
            </div>
          }
          description={
            <>
              Five rounds. Each spin gives you one team + era — draft a player and
              slot him at Guard, Wing, Big, or Flex.{" "}
              <span className="font-bold">
                Fit five together and{" "}
                <span className="box-decoration-clone bg-[var(--md-yellow)] px-1 text-[var(--md-ink)]">
                  simulate the season.
                </span>
              </span>
            </>
          }
          descriptionClassName="max-w-[620px] text-[17px] leading-[1.6]"
        />

        <div className="md-card--cover flex flex-1 flex-col p-6">
          <div
            className="flex items-center justify-between gap-2 pb-3"
            style={{
              borderBottom: "1px solid var(--md-paper)",
              boxShadow: "0 4px 0 -1px var(--md-paper)",
            }}
          >
            <div className="font-cond text-[18px] font-semibold uppercase tracking-[0.16em] text-[var(--md-paper)]">
              Daily Challenge
            </div>
            <span className="text-xl" aria-hidden>
              🏆
            </span>
          </div>
          {dailyBody}
        </div>
      </div>

      <div className="md:col-span-2 md:col-start-1 md:row-start-2">
        {dailyHistory}
      </div>

      <div className="flex flex-col gap-4 md:col-start-2 md:row-start-1">
        <div className="md-rule-double flex items-end justify-between pb-2">
          <span className="font-cond text-[14px] font-bold uppercase tracking-[0.18em]">
            More Ways to Play
          </span>
          <span className="md-folio">THREE MODES</span>
        </div>

        <Link
          href="/tournament?tab=private"
          className="flex flex-[1.1] flex-col justify-between gap-3 border-2 border-[var(--md-ink)] p-6 text-[var(--md-white)] transition-transform hover:-translate-y-0.5"
          style={{ background: "var(--md-cobalt)", boxShadow: "var(--md-shadow-md)" }}
        >
          <div className="flex items-center gap-2">
            <span className="text-[18px]" aria-hidden>
              🏆
            </span>
            <span className="font-cond text-[17px] font-bold uppercase tracking-[0.1em]">
              Private Tournament
            </span>
          </div>
          <p className="text-[15px] leading-[1.45] text-[#dde4ff]">
            Host a bracket for your friends, or join one by link.
          </p>
          <div className="flex items-center justify-between border-t border-white/30 pt-3 font-cond text-[12px] font-semibold uppercase tracking-[0.12em] text-[#dde4ff]">
            <span>Host or Join</span>
            <span aria-hidden>→</span>
          </div>
        </Link>

        <ModeCard
          number="01"
          title="Classic"
          description="Per-game stats shown. Draft with full information."
          cta="Play Classic"
          onClick={() => onStartGame("classic")}
        />

        <ModeCard
          number="02"
          title="Ranked"
          description="Stats hidden. Draft from memory — true hoops IQ."
          cta="Play Ranked"
          dark
          onClick={() => onStartGame("hoopiq")}
        />
      </div>
    </section>
  );
}

function ModeCard({
  number,
  title,
  description,
  cta,
  dark = false,
  onClick,
}: {
  number: string;
  title: string;
  description: string;
  cta: string;
  dark?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`flex flex-1 flex-col justify-between gap-3 border-2 border-[var(--md-ink)] p-6 text-left transition-transform hover:-translate-y-0.5 ${
        dark
          ? "text-[var(--md-paper)]"
          : "bg-[var(--md-white)] text-[var(--md-ink)]"
      }`}
      style={{
        background: dark ? "var(--md-ink)" : undefined,
        boxShadow: "var(--md-shadow-md)",
      }}
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center font-mono text-[11px] font-bold ${
            dark
              ? "bg-[var(--md-yellow)] text-[var(--md-ink)]"
              : "bg-[var(--md-ink)] text-[var(--md-yellow)]"
          }`}
        >
          {number}
        </span>
        <span
          className={`font-cond text-[17px] font-bold uppercase tracking-[0.1em] ${
            dark ? "text-[var(--md-paper)]" : ""
          }`}
        >
          {title}
        </span>
      </div>
      <p
        className={`text-[15px] leading-[1.45] ${
          dark ? "text-[var(--md-paper-3)]" : "text-[var(--md-ink-muted)]"
        }`}
      >
        {description}
      </p>
      <div
        className={`flex items-center justify-between border-t pt-3 font-cond text-[12px] font-semibold uppercase tracking-[0.12em] ${
          dark
            ? "border-[#2a231c] text-[var(--md-paper-3)]"
            : "border-[var(--md-ink)]/20 text-[var(--md-ink-muted)]"
        }`}
      >
        <span>{cta}</span>
        <span aria-hidden>→</span>
      </div>
    </button>
  );
}
