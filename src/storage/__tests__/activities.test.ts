import { describe, it, expect, beforeEach, vi } from 'vitest';

const store = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => store.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      await new Promise((r) => setTimeout(r, Math.random() * 3)); // make interleaving likely
      store.set(k, v);
    },
    removeItem: async (k: string) => void store.delete(k),
  },
}));

import { saveActivity, listActivities, deleteActivity, getTrack, listIgnoredImports, updateActivity } from '../activities';
import type { ActivityRecord } from '../../activity/types';

const rec = (id: string, extra: Partial<ActivityRecord['summary']> = {}): ActivityRecord => ({
  summary: {
    id,
    sport: 'run',
    name: id,
    startedAt: new Date(Date.UTC(2026, 9, 1, 6) + Number(id.replace(/\D/g, '') || 0) * 60_000).toISOString(),
    endedAt: new Date(Date.UTC(2026, 9, 1, 7)).toISOString(),
    distanceM: 5000,
    movingSec: 1500,
    elapsedSec: 1500,
    elevGainM: null,
    steps: null,
    avgCadence: null,
    avgHr: null,
    maxHr: null,
    source: 'kasya',
    hasTrack: true,
    preview: [],
    ...extra,
  },
  track: { points: [{ t: 0, lat: 14.5, lon: 121, alt: null, d: 0, mt: 0, seg: 0 }, { t: 1000, lat: 14.5001, lon: 121, alt: null, d: 11, mt: 1, seg: 0 }], splits: [] },
});

beforeEach(() => store.clear());

describe('activity storage', () => {
  it('concurrent saves never lose each other', async () => {
    await Promise.all(Array.from({ length: 12 }, (_, i) => saveActivity(rec(`a${i}`))));
    expect((await listActivities()).length).toBe(12);
  });

  it('round-trips a track and deletes it with the activity; deleted imports are remembered', async () => {
    await saveActivity(rec('a1'));
    await saveActivity(rec('h2', { source: 'health', externalId: 'UUID-2' }));
    expect((await getTrack('a1'))!.points).toHaveLength(2);
    await deleteActivity('a1');
    await deleteActivity('h2');
    expect(await getTrack('a1')).toBeNull();
    expect(await listActivities()).toEqual([]);
    expect(await listIgnoredImports()).toEqual(['UUID-2']);
  });
});

describe('editing', () => {
  it('updates name, sport and notes; blank name keeps the old one; bad sport is ignored', async () => {
    await saveActivity(rec('a1'));
    await updateActivity('a1', { name: '  Sunday long run  ', sport: 'walk', notes: ' humid ' });
    let a = (await listActivities())[0];
    expect([a.name, a.sport, a.notes]).toEqual(['Sunday long run', 'walk', 'humid']);
    await updateActivity('a1', { name: '   ', sport: 'swim' as never, notes: '' });
    a = (await listActivities())[0];
    expect([a.name, a.sport, a.notes]).toEqual(['Sunday long run', 'walk', undefined]);
  });
});
