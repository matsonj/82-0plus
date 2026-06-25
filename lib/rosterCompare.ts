// Pure helpers for the daily head-to-head roster compare. Extracted from the
// (client) DailyShareLanding so the rules that are easy to get subtly wrong —
// the diff SIGN, the stamp THRESHOLDS, and who won a slot — are unit-testable
// without pulling in React.

/** A stable per-player identity (matches BracketView.playerKey) so the same pick
 *  is recognised on both sides of a head-to-head. */
export const pickKey = (p: { name: string; team: string; season: number }) =>
  `${p.name}|${p.team}|${p.season}`;

/** "1972" → "1970s" — the slot's decade (the shared team/era everyone drafts). */
export const decadeLabel = (season: number) => `${Math.floor(season / 10) * 10}s`;

/** Who has the better-graded pick for a slot, from YOUR side: "you", "them", or
 *  null (a shared pick, an exact tie, or a missing opponent). Drives the coral
 *  winner name. */
export function slotWinner(
  youGq: number,
  themGq: number | undefined,
  shared: boolean,
): "you" | "them" | null {
  if (themGq === undefined || shared) return null;
  if (youGq > themGq) return "you";
  if (themGq > youGq) return "them";
  return null;
}

/** How to render the central GQ-DIFF cell. The number is signed from YOUR side
 *  (positive = you're ahead). Visual impact scales with the gap: ≤10 a quiet
 *  number, >10 a marker stamp, >20 a bigger stamp. `ahead` drives the colour
 *  (press-yellow ahead / inverted flame-red behind). A push — same player,
 *  missing opponent, or a vanishing (<0.05) gap — is a dash. */
export type GqDiffView =
  | { kind: "dash" }
  | { kind: "number"; text: string }
  | { kind: "stamp"; text: string; ahead: boolean; big: boolean };

export function gqDiffView(
  youGq: number,
  themGq: number | undefined,
  shared: boolean,
): GqDiffView {
  if (themGq === undefined || shared) return { kind: "dash" };
  const diff = youGq - themGq;
  const mag = Math.abs(diff);
  if (mag < 0.05) return { kind: "dash" };
  const text = `${diff > 0 ? "+" : ""}${diff.toFixed(1)}`;
  if (mag <= 10) return { kind: "number", text };
  return { kind: "stamp", text, ahead: diff > 0, big: mag > 20 };
}
