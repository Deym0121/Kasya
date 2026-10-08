import { describe, it, expect } from 'vitest';
import { workoutToRecord, selectNewImports } from '../importer';
import { simulateFixes } from '../sim';
import type { HealthWorkout } from '../health';

const start = new Date(Date.UTC(2026, 9, 6, 22, 0, 0));

function watchRun(over: Partial<HealthWorkout> = {}): HealthWorkout {
  const route = simulateFixes({ startT: start.getTime(), durationSec: 1800, speedMps: 3, noiseM: 0, hillM: 10 });
  return {
    externalId: 'UUID-A',
    sport: 'run',
    startedAt: start,
    endedAt: new Date(start.getTime() + 1800_000),
    distanceM: 5600,
    durationSec: 1790,
    sourceName: 'Apple Watch',
    avgHr: 152,
    maxHr: 171,
    steps: 5000,
    route,
    ...over,
  };
}

describe('workoutToRecord', () => {
  it("keeps the watch's totals and calibrates the route's splits to them", () => {
    const rec = workoutToRecord(watchRun());
    expect(rec.summary.distanceM).toBe(5600);
    expect(rec.summary.movingSec).toBe(1790);
    expect(rec.summary.source).toBe('health');
    expect(rec.summary.sourceName).toBe('Apple Watch');
    expect(rec.summary.avgHr).toBe(152);
    expect(rec.summary.avgCadence).toBe(Math.round(5000 / (1790 / 60)));
    expect(rec.summary.elevGainM).toBeGreaterThan(10);
    expect(rec.track!.points.at(-1)!.d).toBeCloseTo(5600, 0);
    expect(rec.track!.splits.length).toBe(6);
    expect(rec.summary.id).toBe('hk_UUID-A');
  });

  it('handles a workout with no route (treadmill / indoor)', () => {
    const rec = workoutToRecord(watchRun({ route: [], distanceM: 8000 }));
    expect(rec.track).toBeNull();
    expect(rec.summary.hasTrack).toBe(false);
    expect(rec.summary.distanceM).toBe(8000);
    expect(rec.summary.elevGainM).toBeNull();
  });

  it('drops steps on rides', () => {
    expect(workoutToRecord(watchRun({ sport: 'ride' })).summary.steps).toBeNull();
  });
});

describe('selectNewImports', () => {
  it('skips deleted, already-imported and in-batch duplicate workouts', () => {
    const a = watchRun();
    const b = watchRun({ externalId: 'UUID-B', sourceName: 'Connect' }); // Garmin wrote the same run too
    const c = watchRun({
      externalId: 'UUID-C',
      startedAt: new Date(start.getTime() + 86400_000),
      endedAt: new Date(start.getTime() + 86400_000 + 1800_000),
    });
    const d = watchRun({ externalId: 'UUID-D', startedAt: new Date(start.getTime() + 2 * 86400_000), endedAt: new Date(start.getTime() + 2 * 86400_000 + 600_000) });
    const existing = [workoutToRecord(c).summary];
    const picked = selectNewImports([a, b, c, d], existing, ['UUID-D']);
    expect(picked.map((w) => w.externalId)).toEqual(['UUID-A']);
  });
});
