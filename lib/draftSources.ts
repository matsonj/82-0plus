import type { PublicPlayer } from "./types";

export interface DraftSource {
  team: string;
  decade: number;
}

export type DraftRosterMap = Record<string, PublicPlayer[]>;

export function draftSourceKey(source: DraftSource): string {
  return `${source.team}|${source.decade}`;
}
