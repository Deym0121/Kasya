import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { HealthWorkout, WorkoutListing } from '../health';

const store = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => store.get(k) ?? null,
    setItem: async (k: string, v: string) => void store.set(k, v),
    removeItem: async (k: string) => void store.delete(k),
  },
}));

// A fake Apple Health: a list of workouts + an anchor that is just "how many
// we'd seen". Tests mutate `db`, `routes` and `deleted` between syncs.
let db: HealthWorkout[] = [];
let deleted: string[] = [];
let detailCalls: string[][] = [];
let onList: (() => void) | null = null;
vi.mock('../health', async () => {
  const days = await import('../days');
  return {
    ...days,
    HEALTH_NAME: 'Apple Health',
    healthAvailable: () => true,
    requestHealthAccess: async () => true,
    listWorkouts: async (anchor: string | null): Promise<WorkoutListing> => {
      onList?.();
      const seen = anchor ? Number(anchor) : 0;
      const headers = db.slice(seen).map(({ avgHr, maxHr, steps, route, ...h }) => h);
      const res = { headers, deletedIds: deleted, anchor: String(db.length) };
      deleted = [];
      return res;
    },
    workoutDetails: async (ids: string[]) => {
      detailCalls.push(ids);
      return db.filter((w) => ids.includes(w.externalId));
    },
    healthDailySteps: async () => [],
    healthStepsBetween: async () => null,
    saveWorkoutToHealth: async () => true,
  };
});

import { connectHealth, syncHealth, getHealthState, disconnectHealth } from '../healthSync';
import { listActivities, deleteActivity } from '../../storage/activities';
import { simulateFixes } from '../sim';
import { fillDays } from '../days';

const DAY = 86400_000;
function workout(i: number, opts: Partial<HealthWorkout> = {}): HealthWorkout {
  const start = new Date(Date.now() - (30 - i) * DAY);
  return {
    externalId: `UUID-${i}`,
    sport: 'run',
    startedAt: start,
    endedAt: new Date(start.getTime() + 1800_000),
    distanceM: 5000,
    durationSec: 1790,
    sourceName: 'Apple Watch',
    avgHr: 150,
    maxHr: 170,
    steps: 5000,
    route: simulateFixes({ startT: start.getTime(), durationSec: 120, noiseM: 0 }),
    ...opts,
  };
}

beforeEach(() => {
  store.clear();
  db = [];
  deleted = [];
  detailCalls = [];
  onList = null;
});

describe('Health sync', () => {
  it('first sync imports everything in batches of 10 and stores the anchor', async () => {
    db = Array.from({ length: 23 }, (_, i) => workout(i));
    const r = await connectHealth();
    expect(r).toEqual({ ok: true, imported: 23 });
    expect(detailCalls.map((c) => c.length)).toEqual([10, 10, 3]);
    expect((await listActivities()).length).toBe(23);
    expect((await getHealthState()).anchor).toBe('23');
  });

  it('a workout that syncs to Health late (dated days ago) is still imported next time', async () => {
    db = [workout(1)];
    await connectHealth();
    db.push(workout(2, { externalId: 'LATE', startedAt: new Date(Date.now() - 6 * DAY), endedAt: new Date(Date.now() - 6 * DAY + 3600_000) }));
    detailCalls = [];
    expect(await syncHealth()).toBe(1);
    expect(detailCalls).toEqual([['LATE']]); // only the new one is fetched in full
  });

  it('removes imports deleted in Health, and never re-imports ones deleted in Kasya', async () => {
    db = [workout(1), workout(2)];
    await connectHealth();
    deleted = ['UUID-1'];
    db = db.filter((w) => w.externalId !== 'UUID-1'); // gone from Health too
    await syncHealth();
    expect((await listActivities()).map((a) => a.externalId)).toEqual(['UUID-2']);
    await deleteActivity('hk_UUID-2');
    store.set('kasya:health:v1', JSON.stringify({ ...(await getHealthState()), anchor: null })); // force a full re-list
    await syncHealth();
    expect(await listActivities()).toEqual([]);
  });

  it('backfills a route that reached Health after the workout', async () => {
    db = [workout(29, { route: [] })];
    await connectHealth();
    expect((await listActivities())[0].hasTrack).toBe(false);
    db[0] = { ...db[0], route: simulateFixes({ startT: db[0].startedAt.getTime(), durationSec: 120, noiseM: 0 }) };
    await syncHealth();
    expect((await listActivities())[0].hasTrack).toBe(true);
  });

  it('does not write sync state back if the user disconnected mid-sync', async () => {
    db = [workout(1)];
    await connectHealth();
    db.push(workout(2));
    onList = () => void disconnectHealth();
    await syncHealth();
    const st = await getHealthState();
    expect(st.connected).toBe(false);
    expect(st.anchor).toBeNull();
  });
});

describe('fillDays', () => {
  it('fills days without a Health bucket with 0 so today is always last', () => {
    const now = new Date(2026, 9, 8, 7, 0);
    const out = fillDays([{ day: '2026-10-06', steps: 9000 }], 3, now);
    expect(out).toEqual([
      { day: '2026-10-06', steps: 9000 },
      { day: '2026-10-07', steps: 0 },
      { day: '2026-10-08', steps: 0 },
    ]);
  });
});
