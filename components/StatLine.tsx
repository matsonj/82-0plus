import type { PlayerLine } from "@/lib/types";

const STATS: { key: keyof PlayerLine; label: string }[] = [
  { key: "pts", label: "PPG" },
  { key: "reb", label: "RPG" },
  { key: "ast", label: "APG" },
  { key: "stl", label: "SPG" },
  { key: "blk", label: "BPG" },
];

export function StatLine({ line }: { line: PlayerLine }) {
  return (
    <div className="md-statline">
      {STATS.map((s) => (
        <div key={s.key} className="md-stat">
          <div className="md-stat__label">{s.label}</div>
          <div className="md-stat__value">{line[s.key]}</div>
        </div>
      ))}
    </div>
  );
}
