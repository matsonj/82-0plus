import "server-only";

import { getPlayers } from "./queries";
import { draftSourceKey, type DraftRosterMap, type DraftSource } from "./draftSources";
import type { QueryOptions } from "./motherduck";
import type { GameMode } from "./types";

export async function getDraftRosters(
  sources: DraftSource[],
  mode: GameMode,
  options: QueryOptions,
): Promise<DraftRosterMap> {
  return Object.fromEntries(
    await Promise.all(
      sources.map(async (source) => [
        draftSourceKey(source),
        await getPlayers(source.team, source.decade, mode, options),
      ]),
    ),
  );
}
