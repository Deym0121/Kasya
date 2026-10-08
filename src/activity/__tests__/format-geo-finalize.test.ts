import { describe, it, expect } from 'vitest';
import { formatDuration, formatKm, formatPace, formatSpeed, paceOf, defaultName } from '../format';
import { haversine, simplify, previewOf, bounds } from '../geo';
import { Recorder } from '../recorder';
import { simulateFixes } from '../sim';
import { finalizeRecording, isDuplicateImport, totals, startOfWeek, weekDays, segmentWindows, stepsOver } from '../finalize';
import type { ActivitySummary } from '../types';

describe('format', () => {
  it('formats durations, distances, paces and speeds', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3723)).toBe('1:02:03');
    expect(formatKm(5023)).toBe('5.02');
    expect(formatKm(5029)).toBe('5.02'); // truncated, never rounded up
    expect(formatKm(2554.9)).toBe(formatKm(2555));
    expect(formatKm(5000)).toBe('5.00');
    expect(formatKm(123456)).toBe('123.4');
    expect(formatPace(332)).toBe('5:32');
    expect(formatPace(null)).toBe('–:––');
    expect(formatPace(Infinity)).toBe('–:––');
    expect(formatSpeed(10000, 1200)).toBe('30.0');
    expect(paceOf(5000, 1500)).toBe(300);
    expect(paceOf(5, 10)).toBeNull();
  });

  it('names activities by time of day', () => {
    expect(defaultName('run', new Date(2026, 9, 8, 6, 0))).toBe('Morning Run');
    expect(defaultName('ride', new Date(2026, 9, 8, 19, 0))).toBe('Evening Ride');
    expect(defaultName('walk', new Date(2026, 9, 8, 12, 30))).toBe('Lunch Walk');
  });
});

describe('geo', () => {
  it('haversine: 1° of latitude ≈ 111.2 km', () => {
    expect(haversine(0, 0, 1, 0) / 1000).toBeCloseTo(111.2, 0);
  });

  it('simplify keeps the shape and both ends', () => {
    const line: [number, number][] = Array.from({ length: 101 }, (_, i) => [14.55 + i * 1e-5, 121.05]);
    const s = simplify(line, 1);
    expect(s).toEqual([line[0], line[100]]);
  });

  it('previewOf caps the point count', () => {
    const fixes = simulateFixes({ durationSec: 3000, noiseM: 3 });
    const p = previewOf(fixes.map((f) => [f.lat, f.lon]), 48);
    expect(p.length).toBeLessThanOrEqual(48);
    expect(p.length).toBeGreaterThan(10);
  });

  it('bounds', () => {
    expect(bounds([])).toBeNull();
    expect(bounds([[1, 2], [3, -4]])).toEqual({ minLat: 1, maxLat: 3, minLon: -4, maxLon: 2 });
  });
});

describe('finalizeRecording', () => {
  it('builds a summary + track with splits, cadence and a preview', () => {
    const r = new Recorder('run', Date.UTC(2026, 9, 8, 22, 0, 0));
    simulateFixes({ durationSec: 1500, speedMps: 3.3, noiseM: 3 }).forEach((f) => r.addFix(f));
    r.finish();
    const rec = finalizeRecording(r, { endedAt: r.startedAt + 1_520_000, steps: 4200, id: 'a1', name: '' });
    expect(rec.summary.id).toBe('a1');
    expect(rec.summary.distanceM).toBeGreaterThan(4800);
    expect(rec.summary.elapsedSec).toBe(1520);
    expect(rec.summary.avgCadence).toBeGreaterThan(160);
    expect(rec.summary.avgCadence).toBeLessThan(175);
    expect(rec.summary.preview.length).toBeLessThanOrEqual(48);
    const d = rec.summary.distanceM;
    expect(rec.track!.splits.length).toBe(Math.floor(d / 1000) + (d % 1000 >= 50 ? 1 : 0));
    expect(rec.summary.source).toBe('kasya');
  });

  it('never stores steps on a ride', () => {
    const r = new Recorder('ride', 0);
    simulateFixes({ durationSec: 300, speedMps: 7 }).forEach((f) => r.addFix(f));
    const rec = finalizeRecording(r, { endedAt: 300_000, steps: 900 });
    expect(rec.summary.steps).toBeNull();
    expect(rec.summary.avgCadence).toBeNull();
  });
});

const row = (p: Partial<ActivitySummary>): ActivitySummary => ({
  id: 'x',
  sport: 'run',
  name: 'Run',
  startedAt: '2026-10-06T06:00:00.000Z',
  endedAt: '2026-10-06T07:00:00.000Z',
  distanceM: 10000,
  movingSec: 3600,
  elapsedSec: 3600,
  elevGainM: 50,
  steps: null,
  avgCadence: null,
  avgHr: null,
  maxHr: null,
  source: 'kasya',
  hasTrack: true,
  preview: [],
  ...p,
});

describe('imports + totals', () => {
  it('dedupes by Health UUID and by overlapping same-family sessions', () => {
    const existing = [row({ id: 'k1' }), row({ id: 'h1', externalId: 'UUID-1', startedAt: '2026-10-01T06:00:00.000Z', endedAt: '2026-10-01T06:30:00.000Z' })];
    expect(isDuplicateImport({ externalId: 'UUID-1', sport: 'run', startedAt: '2026-09-01T00:00:00Z', endedAt: '2026-09-01T01:00:00Z' }, existing)).toBe(true);
    // the watch recorded the same run (walk counts as the same foot family)
    expect(isDuplicateImport({ sport: 'walk', startedAt: '2026-10-06T06:05:00.000Z', endedAt: '2026-10-06T06:58:00.000Z' }, existing)).toBe(true);
    // a ride at the same time is a different session
    expect(isDuplicateImport({ sport: 'ride', startedAt: '2026-10-06T06:05:00.000Z', endedAt: '2026-10-06T06:58:00.000Z' }, existing)).toBe(false);
    // barely touching windows aren't duplicates
    expect(isDuplicateImport({ sport: 'run', startedAt: '2026-10-06T06:50:00.000Z', endedAt: '2026-10-06T07:50:00.000Z' }, existing)).toBe(false);
    // a short phone walk inside a long watch run must not swallow the run
    const walk = [row({ id: 'w', sport: 'walk', startedAt: '2026-10-10T07:00:00.000Z', endedAt: '2026-10-10T07:10:00.000Z' })];
    expect(isDuplicateImport({ sport: 'run', startedAt: '2026-10-10T06:00:00.000Z', endedAt: '2026-10-10T08:00:00.000Z' }, walk)).toBe(false);
  });

  it('sums totals and buckets the week Monday-first', () => {
    const t = totals([row({}), row({ distanceM: 5000, movingSec: 1500, elevGainM: null })]);
    expect(t).toEqual({ count: 2, distanceM: 15000, movingSec: 5100, elevGainM: 50 });
    const now = new Date(2026, 9, 8, 12); // Thursday
    expect(startOfWeek(now).getDay()).toBe(1);
    const mon = new Date(2026, 9, 5, 7).toISOString();
    const thu = new Date(2026, 9, 8, 7).toISOString();
    const lastWeek = new Date(2026, 9, 1, 7).toISOString();
    const days = weekDays([row({ startedAt: mon }), row({ startedAt: thu, distanceM: 3000 }), row({ startedAt: lastWeek })], now);
    expect(days).toEqual([10000, 0, 0, 3000, 0, 0, 0]);
  });
});

describe('segmentWindows / stepsOver', () => {
  const pt = (t: number, seg: number) => ({ t, lat: 0, lon: 0, alt: null, d: 0, mt: 0, seg });

  it('excludes manually paused time and extends the live segment to now', () => {
    const pts = [pt(5_000, 0), pt(60_000, 0), pt(200_000, 1), pt(300_000, 1)];
    expect(segmentWindows(pts, 0, null)).toEqual([[0, 60_000], [200_000, 300_000]]);
    expect(segmentWindows(pts, 0, 330_000)).toEqual([[0, 60_000], [200_000, 330_000]]);
    expect(segmentWindows([], 1_000, 61_000)).toEqual([[1_000, 61_000]]);
    expect(segmentWindows([], 1_000, null)).toEqual([]);
  });

  it('sums steps per window and gives up if a window is unreadable', async () => {
    const perSec = async (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 1000) * 2;
    expect(await stepsOver([[0, 60_000], [200_000, 300_000]], perSec)).toBe(320);
    expect(await stepsOver([[0, 60_000]], async () => null)).toBeNull();
    expect(await stepsOver([], perSec)).toBeNull();
  });
});
