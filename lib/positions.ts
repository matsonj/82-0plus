// Derived positions. nba_box_scores_v2 has no position column, so we infer them
// from the box line: rebounds + blocks push toward the frontcourt, assists pull
// toward the backcourt. Players can be eligible at MULTIPLE positions — combo
// guards are G/W, stretch bigs / point-centers are W/B — which is what makes the
// "≥1 of each, ≤3 of one" draft requirement satisfiable.

export type Role = "G" | "W" | "B";

export interface RoleInput {
  reb: number;
  blk: number;
  ast: number;
  // Real basketball-reference position ("G", "F", "C", "G-F", "F-C", …) when we
  // have it; null/undefined falls back to the box-derived heuristic below.
  pos?: string | null;
}

// b-ref position letters → our three lineup roles.
const LETTER_ROLE: Record<string, Role> = { G: "G", F: "W", C: "B" };

/** Roles a b-ref position string implies, in listed order (primary first). */
export function rolesFromPos(pos: string): Role[] {
  const roles: Role[] = [];
  for (const tok of pos.split("-")) {
    const r = LETTER_ROLE[tok.trim().toUpperCase()];
    if (r && !roles.includes(r)) roles.push(r);
  }
  return roles;
}

export const ALL_ROLES: Role[] = ["G", "W", "B"];

/** A lineup slot is a fixed role or a flex that accepts anyone. */
export type SlotKind = Role | "FLEX";

export const ROLE_LABEL: Record<Role, string> = {
  G: "Guard",
  W: "Wing",
  B: "Big",
};

export const SLOT_LABEL: Record<SlotKind, string> = {
  G: "Guard",
  W: "Wing",
  B: "Big",
  FLEX: "Flex",
};

/** Can a player occupy a lineup slot of this kind? Flex accepts anyone. */
export function canPlay(p: RoleInput, kind: SlotKind): boolean {
  return kind === "FLEX" || eligiblePositions(p).includes(kind);
}

/** Same check from a precomputed eligibility list (client uses the DTO's positions). */
export function canFill(positions: Role[], kind: SlotKind): boolean {
  return kind === "FLEX" || positions.includes(kind);
}

/** Higher = more of a big; lower = more of a guard. */
export function frontcourtIndex(p: RoleInput): number {
  return p.reb + 2 * p.blk - p.ast;
}

/** The set of positions a player can fill (overlapping zones → dual eligibility). */
export function eligiblePositions(p: RoleInput): Role[] {
  // Prefer real positions when we have them.
  if (p.pos) {
    const roles = rolesFromPos(p.pos);
    if (roles.length) return roles;
  }
  // Fallback: derive from the box line.
  const fc = frontcourtIndex(p);
  const roles: Role[] = [];
  if (fc <= 3) roles.push("G"); // guards + combo guards
  if (fc >= 1.5 && fc <= 9) roles.push("W"); // wings + combo guards + stretch bigs
  if (fc >= 6) roles.push("B"); // bigs + stretch bigs
  if (roles.length === 0) roles.push("W"); // safety (shouldn't happen)
  return roles;
}

export function isEligible(p: RoleInput, pos: Role): boolean {
  return eligiblePositions(p).includes(pos);
}

/** A single role for compact display (the player's most natural spot). */
export function primaryRole(p: RoleInput): Role {
  // Real position's primary (first listed) letter wins when available.
  if (p.pos) {
    const roles = rolesFromPos(p.pos);
    if (roles.length) return roles[0];
  }
  const fc = frontcourtIndex(p);
  if (fc <= 1.5) return "G";
  if (fc >= 7) return "B";
  return "W";
}

// b-ref letter → a 1–5 court position value (G=1, F=3, C=5). A combo position
// is the mean of its parts, so G-F=2 and F-C=4 fall naturally between the pures,
// regardless of token order ("C-F" === "F-C" === 4). Used to order a finished
// roster backcourt → frontcourt.
const POS_VALUE: Record<string, number> = { G: 1, F: 3, C: 5 };

/** A 1–5 court position rank from a b-ref pos string; 3 (neutral) when unknown. */
export function positionRank(pos?: string | null): number {
  if (!pos) return 3;
  const vals = pos
    .split("-")
    .map((t) => POS_VALUE[t.trim().toUpperCase()])
    .filter((v): v is number => v !== undefined);
  if (vals.length === 0) return 3;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function roleCounts(players: RoleInput[]): Record<Role, number> {
  const counts: Record<Role, number> = { G: 0, W: 0, B: 0 };
  for (const p of players) counts[primaryRole(p)] += 1;
  return counts;
}
