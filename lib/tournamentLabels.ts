// Tournament status/record label helpers — PURE and CLIENT-SAFE (no Node, no DB,
// no React). One home for the human wording that used to be copy-pasted (and had
// drifted) across My Teams, the header notifications, the private finals view,
// and the public results card.
//
// There are two distinct "how far did they get" axes, and we keep them separate
// on purpose:
//
//   • reachedRound (0..4) — a tree DEPTH the public/legacy results path counts:
//       0 = lost the opening round … 3 = lost the Final … 4 = champion.
//     This is what TournamentTeamSummary.reachedRound / you.reachedRound carry.
//
//   • finalStatus (a string) — the label lib/privateTournamentRun.statusLabel()
//     already BAKED INTO storage at finalize time ("Champion", "Lost Finals",
//     "Lost Conf Finals", "Lost Semis", "Lost R1", "Lost Play-In", "Eliminated").
//     We must reproduce those exact strings, never re-derive them, because the
//     value is read straight out of the row.
//
// Wording decisions (resolving the prior divergence):
//   • The "reachedRound" family had two competing short forms — "Lost the Final"
//     (My Teams) vs "Lost Finals" (stored finalStatus). We canonicalize the
//     reachedRound short form to MATCH the stored finalStatus vocabulary so a
//     team reads the same whether labeled from an index or a stored string:
//       0 → "Lost R1", 1 → "Lost Conf Semis", 2 → "Lost Conf Finals",
//       3 → "Lost Finals", 4 → "🏆 Champion", else "Eliminated".
//     (The trophy emoji is kept on the champion short form — it's used in list
//     rows and the results headline where the emoji is wanted.)
//   • A LONG, sentence-style form is kept for the results headline only
//     ("Lost in the Conference Finals", etc.) since that surface reads as prose.
//   • privateModeLabel lives in lib/privateTournament.ts — import it from there,
//     don't duplicate. (Re-exported here for one-stop importing.)

import { privateModeLabel } from "./privateTournament";
import type { BracketResult } from "./types";

export { privateModeLabel };

// ── Play-in earned seeds (size-20) ─────────────────────────────────────────────

/**
 * The seed each size-20 play-in team EARNED by outcome, derived at display time
 * from `bracket.playIn` — so it's correct for brackets stored before the engine
 * started writing the earned seed onto `BracketTeam.seed`.
 *
 * Per conference (games in push order): A = 7v8, B = 9v10 feeder, C = 8-seed
 * decider (A-loser vs B-winner). A winner → 7, C winner → 8, C loser → 9,
 * B loser → 10. Returns an empty map for non-size-20 brackets.
 */
export function playInEarnedSeeds(bracket: BracketResult): Map<string, number> {
  const seeds = new Map<string, number>();
  const playIn = bracket.playIn ?? [];
  const confs = Array.from(new Set(playIn.map((p) => p.conference)));
  for (const conf of confs) {
    const games = playIn.filter((p) => p.conference === conf);
    const a = games.find((g) => g.forSeed === 7);
    const [b, c] = games.filter((g) => g.forSeed === 8);
    if (!a || !b || !c) continue;
    const cLoser = c.winnerId === c.hiId ? c.loId : c.hiId;
    const bLoser = b.winnerId === b.hiId ? b.loId : b.hiId;
    seeds.set(a.winnerId, 7);
    seeds.set(c.winnerId, 8);
    seeds.set(cLoser, 9);
    seeds.set(bLoser, 10);
  }
  return seeds;
}

// ── reachedRound → label ──────────────────────────────────────────────────────

/**
 * Short, list-row phrasing for a `reachedRound` (0 = lost opening round … 4 =
 * champion). Matches the stored finalStatus vocabulary so the two paths agree.
 * Champion carries the trophy emoji (this form is used in chips/rows that want
 * it). Anything out of range → "Eliminated".
 */
export function reachedRoundLabel(reachedRound: number): string {
  switch (reachedRound) {
    case 0:
      return "Lost R1";
    case 1:
      return "Lost Conf Semis";
    case 2:
      return "Lost Conf Finals";
    case 3:
      return "Lost Finals";
    case 4:
      return "🏆 Champion";
    default:
      return "Eliminated";
  }
}

/**
 * The same axis as reachedRoundLabel but WITHOUT the trophy emoji — the bare
 * word "Champion" — for surfaces (e.g. the share image) that don't want emoji.
 */
export function reachedRoundLabelPlain(reachedRound: number): string {
  if (reachedRound >= 4) return "Champion";
  return reachedRoundLabel(reachedRound);
}

/**
 * Long, sentence-style phrasing for the results headline (prose surface). Pass
 * `isChampion` so a champion reads "🏆 Champion" regardless of the rounded index.
 */
export function reachedRoundSentence(
  reachedRound: number,
  isChampion: boolean,
): string {
  if (isChampion) return "🏆 Champion";
  switch (reachedRound) {
    case 0:
      return "Lost in Round 1";
    case 1:
      return "Lost in the Conference Semifinals";
    case 2:
      return "Lost in the Conference Finals";
    case 3:
      return "Lost in the Final";
    default:
      return "Eliminated";
  }
}

// ── Stored finalStatus passthrough ─────────────────────────────────────────────

/**
 * Normalize a STORED tournament status string for display. The value already
 * comes from lib/privateTournamentRun.statusLabel ("Champion", "Lost Finals",
 * "Lost Conf Finals", "Lost Semis", "Lost R1", "Lost Play-In", "Eliminated"), so
 * we keep it verbatim and only supply the "Final" fallback when it's missing.
 */
export function formatTournamentStatus(status: string | null | undefined): string {
  const s = status?.trim();
  return s && s.length > 0 ? s : "Final";
}

// ── Per-entry status (private tournaments) ─────────────────────────────────────

/**
 * The badge/line a private entrant sees BEFORE results exist, keyed by their
 * entry status:
 *   registered  → "Draft not started"
 *   partial     → "Draft in progress"
 *   submitted   → "Submitted · awaiting results"
 *   bot_replaced→ "🤖 Bot (timed out)"   (they let the clock run out; a bot took
 *                  their slot — same copy the private finals standings show)
 * Any unknown value falls back to "Draft not started".
 */
export function formatPrivateEntryStatus(entryStatus: string): string {
  switch (entryStatus) {
    case "submitted":
      return "Submitted · awaiting results";
    case "partial":
      return "Draft in progress";
    case "bot_replaced":
      return "🤖 Bot (timed out)";
    case "registered":
    default:
      return "Draft not started";
  }
}

// ── Record / margin formatters ─────────────────────────────────────────────────

/**
 * "W–L" using an en-dash (the separator used across the cards). Returns null when
 * either side is missing so callers can omit the record cleanly.
 */
export function formatRecord(
  w: number | null | undefined,
  l: number | null | undefined,
): string | null {
  if (w == null || l == null) return null;
  return `${w}–${l}`;
}

/**
 * A completed private entry's one-line standing: "W–L · Status", or just the
 * status when there's no record. `status` is the stored finalStatus string.
 */
export function formatRecordWithStatus(
  w: number | null | undefined,
  l: number | null | undefined,
  status: string | null | undefined,
): string {
  const rec = formatRecord(w, l);
  const label = formatTournamentStatus(status);
  return rec ? `${rec} · ${label}` : label;
}

/**
 * Signed realized margin, e.g. "+5.0" / "−3.2". Uses U+2212 (true minus) for
 * negatives. `positive` (value ≥ 0) is returned too so callers can color it.
 */
export function formatSignedMargin(value: number): {
  text: string;
  positive: boolean;
} {
  const positive = value >= 0;
  return {
    text: `${positive ? "+" : "−"}${Math.abs(value).toFixed(1)}`,
    positive,
  };
}
