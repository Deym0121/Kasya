import { describe, it, expect } from 'vitest';
import { packTrack, unpackTrack, packEvent, unpackEvent, quantize, pointsFromRoute, calibrateToTotals } from '../pack';
import { Recorder, replay, type RecorderEvent } from '../recorder';
import { simulateFixes } from '../sim';
import { computeSplits } from '../splits';

describe('track packing', () => {
  it('round-trips a recorded track (within rounding) and rebuilds splits', () => {
    const r = new Recorder('run', 0);
    simulateFixes({ durationSec: 900, noiseM: 3 }).forEach((f) => r.addFix(f));
    const track = { points: r.points, splits: computeSplits(r.points) };
    const back = unpackTrack(JSON.parse(JSON.stringify(packTrack(track))))!;
    expect(back.points).toHaveLength(track.points.length);
    expect(back.points[10].lat).toBeCloseTo(track.points[10].lat, 6);
    expect(back.points.at(-1)!.d).toBeCloseTo(track.points.at(-1)!.d, 0);
    expect(back.splits.map((s) => s.index)).toEqual(track.splits.map((s) => s.index));
  });

  it('rejects garbage instead of crashing', () => {
    expect(unpackTrack(null)).toBeNull();
    expect(unpackTrack({ v: 2, p: [] })).toBeNull();
    expect(unpackTrack({ v: 1, p: [[1, 2], 'x', [1, 14.5, 121, null, 0, 0, 0]] })!.points).toHaveLength(1);
  });
});

describe('event packing', () => {
  it('replaying the packed log reproduces a quantised live recording exactly', () => {
    const fixes = simulateFixes({ durationSec: 400, noiseM: 3 });
    const log: RecorderEvent[] = [
      ...fixes.slice(0, 200).map((fix) => ({ kind: 'fix' as const, fix })),
      { kind: 'pause', t: fixes[200].t },
      { kind: 'resume', t: fixes[250].t },
      ...fixes.slice(250).map((fix) => ({ kind: 'fix' as const, fix })),
    ];
    const live = replay('run', 0, log.map(quantize));
    const packed = JSON.parse(JSON.stringify(log.map(packEvent)));
    const restored = replay('run', 0, packed.map(unpackEvent).filter(Boolean));
    expect(restored.distanceM).toBe(live.distanceM);
    expect(restored.movingSec).toBe(live.movingSec);
    expect(restored.points).toEqual(live.points);
    expect(unpackEvent('nope')).toBeNull();
    expect(unpackEvent([9, 1])).toBeNull();
  });
});

describe('watch routes', () => {
  it('builds a track, splits on long holes, and calibrates to the watch totals', () => {
    const fixes = simulateFixes({ durationSec: 1200, noiseM: 0 });
    const holed = [...fixes.slice(0, 600), ...fixes.slice(600).map((f) => ({ ...f, t: f.t + 300_000 }))];
    const pts = pointsFromRoute(holed);
    expect(new Set(pts.map((p) => p.seg)).size).toBe(2);
    const raw = pts.at(-1)!.d;
    const cal = calibrateToTotals(pts, raw * 1.05, null);
    expect(cal.at(-1)!.d).toBeCloseTo(raw * 1.05, 3);
    // wildly different totals (e.g. a treadmill distance) are ignored
    expect(calibrateToTotals(pts, raw * 3, null).at(-1)!.d).toBeCloseTo(raw, 3);
  });
});
