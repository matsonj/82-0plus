"use client";

import { Button, ModalFrame } from "@/components/ui";

// First-visit explainer for Tournament Edition. SLAM editorial treatment:
// ink masthead band, Archivo headline, numbered rules in Space Grotesk body.
export function TournamentHowToPlay({ onClose }: { onClose: () => void }) {
  return (
    <ModalFrame
      title="Tournament Edition"
      onClose={onClose}
      maxWidth="max-w-md"
      paddingClassName="p-0"
      className="flex max-h-[85vh] flex-col overflow-auto"
      overlayStyle={{ background: "rgba(21,17,14,0.7)" }}
      panelStyle={{ boxShadow: "var(--md-shadow-md)" }}
      headerClassName="border-b-2 border-[var(--md-coral)] bg-[var(--md-ink)] px-6 py-5"
      titleStyle={{ fontSize: 26, color: "var(--md-white)" }}
      closeClassName="font-cond text-lg font-bold transition-colors"
      closeStyle={{ color: "var(--md-paper-3)" }}
      footer={
        <div className="px-6 pb-6">
          <Button
            size="lg"
            fullWidth
            className="justify-center"
            style={{ background: "var(--md-coral)", color: "var(--md-white)" }}
            onClick={onClose}
          >
            Let&rsquo;s go
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-0 px-6 py-5">
        <ol className="flex flex-col gap-4 text-[14px] leading-relaxed">
          <li className="flex gap-3">
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center border-2 border-[var(--md-ink)] font-mono text-[11px] font-bold"
              style={{ background: "var(--md-coral)", color: "var(--md-white)" }}
            >
              1
            </span>
            <span>
              <strong>Enter your five.</strong> The team you just built goes in
              as-is. Then draft a <strong>sixth man</strong> and choose a{" "}
              <strong>captain</strong>; each one buffs your team differently.
            </span>
          </li>
          <li className="flex gap-3">
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center border-2 border-[var(--md-ink)] font-mono text-[11px] font-bold"
              style={{ background: "var(--md-coral)", color: "var(--md-white)" }}
            >
              2
            </span>
            <span>
              <strong>Get seeded into a 16-team bracket.</strong> Teams split into
              East &amp; West by their players&rsquo; real conferences, seeded by net
              rating. Classic teams play Classic, Ranked plays Ranked.
            </span>
          </li>
          <li className="flex gap-3">
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center border-2 border-[var(--md-ink)] font-mono text-[11px] font-bold"
              style={{ background: "var(--md-coral)", color: "var(--md-white)" }}
            >
              3
            </span>
            <span>
              <strong>Survive the series.</strong> Every round is a best-of-7.
              Home court, height, a sixth-man-driven recovery, fatigue (older
              teams fade) and a roster-fit <strong>game score</strong> all swing
              the games.
            </span>
          </li>
          <li className="flex gap-3">
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center border-2 border-[var(--md-ink)] font-mono text-[11px] font-bold"
              style={{ background: "var(--md-coral)", color: "var(--md-white)" }}
            >
              4
            </span>
            <span>
              <strong>Come back any time.</strong> Your account (name + PIN)
              remembers every team you enter. Look them up to replay the
              bracket. 🤖 teams are AI fillers; the rest are real people.
            </span>
          </li>
        </ol>
      </div>
    </ModalFrame>
  );
}
