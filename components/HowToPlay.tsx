"use client";

import { useState, type ReactNode } from "react";
import { Button, ModalFrame, SegmentedControl } from "@/components/ui";

export type HowToTab = "regular" | "playoffs";

// One numbered rule: a coral chip + body, shared across both tabs so the modal
// reads as one piece.
function Rule({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center border-2 border-[var(--md-ink)] font-mono text-[11px] font-bold"
        style={{ background: "var(--md-coral)", color: "var(--md-white)" }}
      >
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}

// Shared How to Play modal. Two tabs mirror the game's phases: the base game is
// an 82-game Reg. Season (chase 82-0); the tournament is the Playoffs (bracket).
// Opened with `initialTab="playoffs"` from the tournament first-run trigger.
export function HowToPlay({
  onClose,
  initialTab = "regular",
}: {
  onClose: () => void;
  initialTab?: HowToTab;
}) {
  const [tab, setTab] = useState<HowToTab>(initialTab);
  return (
    <ModalFrame
      title="How to play"
      onClose={onClose}
      maxWidth="max-w-md"
      paddingClassName="p-6"
      className="max-h-[85vh] overflow-auto"
      overlayStyle={{ background: "rgba(56,56,56,0.55)" }}
      titleClassName="font-display"
      titleStyle={{ fontSize: 24, fontWeight: 700 }}
      footer={
        <Button
          variant="ink"
          size="lg"
          fullWidth
          className="mt-5 justify-center"
          onClick={onClose}
        >
          Got it
        </Button>
      }
    >
      <SegmentedControl
        className="mt-4"
        value={tab}
        onChange={setTab}
        options={[
          { value: "regular", label: "Reg. Season" },
          { value: "playoffs", label: "Playoffs" },
        ]}
      />

      {tab === "regular" ? (
        <>
          <ol className="mt-4 flex flex-col gap-3 text-[14px] leading-relaxed">
            <Rule n={1}>
              <strong>Five rounds.</strong> Each spin hands you one NBA team and
              era. Pick a player and slot him at{" "}
              <strong>Guard, Wing, Big,</strong> or a <strong>Flex</strong>.
            </Rule>
            <Rule n={2}>
              <strong>Build a real lineup.</strong> You need at least one true
              Guard, Wing, and Big; players can fill multiple spots. Tap a
              player, then a slot, to move him.
            </Rule>
            <Rule n={3}>
              <strong>Fit matters.</strong> The sim rewards spacing, playmaking,
              defense, and balanced usage. Five ball-dominant stars or two
              non-shooting bigs will cost you. Teams never repeat.
            </Rule>
            <Rule n={4}>
              <strong>Simulate.</strong> Your roster&rsquo;s era-neutral quality
              becomes a net rating, then an 82-game record. Going{" "}
              <strong>82-0</strong> takes a flawless five.
            </Rule>
          </ol>

          <div className="mt-4 grid gap-1 border-t border-[var(--md-paper-3)] pt-3 text-[13px] text-[var(--md-ink-muted)]">
            <div>
              <strong className="text-[var(--md-ink)]">Daily</strong>: the same
              five rolls for everyone today.
            </div>
            <div>
              <strong className="text-[var(--md-ink)]">Classic</strong>: stats
              shown. <strong className="text-[var(--md-ink)]">Ranked</strong>:
              stats hidden, draft from memory.
            </div>
          </div>
        </>
      ) : (
        <ol className="mt-4 flex flex-col gap-4 text-[14px] leading-relaxed">
          <Rule n={1}>
            <strong>Enter your five.</strong> Your team goes in as built. Add a{" "}
            <strong>sixth man</strong> and a <strong>captain</strong>; each one
            buffs it differently.
          </Rule>
          <Rule n={2}>
            <strong>Get seeded.</strong> Sixteen teams split East &amp; West by
            their players&rsquo; real conferences, seeded by net rating. Classic
            plays Classic, Ranked plays Ranked.
          </Rule>
          <Rule n={3}>
            <strong>Survive the series.</strong> Every round is a best-of-7.
            Home court, height, sixth-man recovery, fatigue (older teams fade),
            and roster fit all swing the games.
          </Rule>
          <Rule n={4}>
            <strong>Come back any time.</strong> Your name + PIN remembers every
            team you enter, so you can replay any bracket. 🤖 teams are AI
            fillers; the rest are real people.
          </Rule>
        </ol>
      )}
    </ModalFrame>
  );
}
