"use client";

import type { PlayerSeasonRow } from "./queries"; // type only — erased at build (no server import)

// Client-side cache of /api/player responses, keyed by entity_id, so the player
// card carousel loads instantly once a card has been fetched (or prefetched on
// hover / for neighbours). In-flight requests are deduped by caching the promise.
const cache = new Map<string, Promise<PlayerSeasonRow[]>>();

export function loadPlayerSeasons(entityId: string): Promise<PlayerSeasonRow[]> {
  const hit = cache.get(entityId);
  if (hit) return hit;
  const promise = fetch(`/api/player?id=${encodeURIComponent(entityId)}`)
    .then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      return (d.seasons ?? []) as PlayerSeasonRow[];
    })
    .catch((e) => {
      cache.delete(entityId); // let a later open retry
      throw e;
    });
  cache.set(entityId, promise);
  return promise;
}

/** Fire-and-forget warm of the cache (hover / neighbour prefetch). */
export function prefetchPlayerSeasons(entityId: string | undefined | null): void {
  if (entityId) loadPlayerSeasons(entityId).catch(() => {});
}
