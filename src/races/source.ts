import type { RaceEvent } from './types';

export type RaceSource = 'live' | 'cache' | 'seed';

interface Deps {
  fetchLive: () => Promise<RaceEvent[] | null>;
  readCache: () => Promise<RaceEvent[] | null>;
  seed: RaceEvent[];
  writeCache: (events: RaceEvent[]) => Promise<void>;
}

/**
 * Live → cache → bundled seed. Never throws — the tab must always render
 * (same fail-open philosophy as getConvex()). Cache write is best-effort.
 */
export async function resolveRaces(deps: Deps): Promise<{ events: RaceEvent[]; source: RaceSource }> {
  try {
    const live = await deps.fetchLive();
    if (live && live.length) {
      try {
        await deps.writeCache(live);
      } catch {
        // cache is an optimization, never a failure
      }
      return { events: live, source: 'live' };
    }
  } catch {
    // fall through
  }
  try {
    const cached = await deps.readCache();
    if (cached && cached.length) return { events: cached, source: 'cache' };
  } catch {
    // fall through
  }
  return { events: deps.seed, source: 'seed' };
}
