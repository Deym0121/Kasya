import { describe, it, expect, vi } from 'vitest';
import { resolveRaces } from '../source';
import type { RaceEvent } from '../types';

const E = (id: string): RaceEvent => ({
  id, name: id, country: 'PH', city: 'Manila', dateStart: '2026-12-01',
  distances: ['10K'], major: false, sourceUrl: 'https://example.org',
});

describe('resolveRaces', () => {
  it('prefers live data and writes it to cache', async () => {
    const writeCache = vi.fn(async () => {});
    const r = await resolveRaces({
      fetchLive: async () => [E('live')],
      readCache: async () => [E('cached')],
      seed: [E('seed')],
      writeCache,
    });
    expect(r.source).toBe('live');
    expect(r.events[0].id).toBe('live');
    expect(writeCache).toHaveBeenCalledWith([E('live')]);
  });

  it('falls back to cache when live fails', async () => {
    const r = await resolveRaces({
      fetchLive: async () => { throw new Error('offline'); },
      readCache: async () => [E('cached')],
      seed: [E('seed')],
      writeCache: async () => {},
    });
    expect(r.source).toBe('cache');
    expect(r.events[0].id).toBe('cached');
  });

  it('falls back to the bundled seed when live and cache are empty', async () => {
    const r = await resolveRaces({
      fetchLive: async () => null,
      readCache: async () => null,
      seed: [E('seed')],
      writeCache: async () => {},
    });
    expect(r.source).toBe('seed');
    expect(r.events[0].id).toBe('seed');
  });

  it('never throws, even when everything fails', async () => {
    const r = await resolveRaces({
      fetchLive: async () => { throw new Error('x'); },
      readCache: async () => { throw new Error('y'); },
      seed: [E('seed')],
      writeCache: async () => { throw new Error('z'); },
    });
    expect(r.source).toBe('seed');
  });
});
