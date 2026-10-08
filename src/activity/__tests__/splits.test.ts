import { describe, it, expect } from 'vitest';
import { computeSplits, fastestSplitIndex, seriesByDistance } from '../splits';
import type { TrackPoint } from '../types';

/** A straight synthetic track: each segment = [metres, seconds]. */
function track(parts: [number, number][], stepM = 10): TrackPoint[] {
  const pts: TrackPoint[] = [{ t: 0, lat: 0, lon: 0, alt: 0, d: 0, mt: 0, seg: 0 }];
  let d = 0;
  let mt = 0;
  for (const [m, s] of parts) {
    const n = Math.round(m / stepM);
    for (let i = 0; i < n; i++) {
      d += m / n;
      mt += s / n;
      pts.push({ t: mt * 1000, lat: 0, lon: 0, alt: d / 100, d, mt, seg: 0 });
    }
  }
  return pts;
}

describe('computeSplits', () => {
  it('splits an even-paced 3.5 km run into 3 full kms + a partial', () => {
    const s = computeSplits(track([[3500, 3500 * 0.3]])); // 5:00 /km
    expect(s.map((x) => x.index)).toEqual([1, 2, 3, 4]);
    for (const x of s.slice(0, 3)) {
      expect(x.distanceM).toBe(1000);
      expect(x.paceSecPerKm).toBeCloseTo(300, 5);
    }
    expect(s[3].distanceM).toBeCloseTo(500, 5);
    expect(s[3].paceSecPerKm).toBeCloseTo(300, 5);
  });

  it('interpolates km boundaries that fall between samples', () => {
    // 1st km at 4:00, 2nd km at 6:00 — sampled every 333 m
    const s = computeSplits(track([[1000, 240], [1000, 360]], 333));
    expect(s[0].paceSecPerKm).toBeCloseTo(240, 0);
    expect(s[1].paceSecPerKm).toBeCloseTo(360, 0);
  });

  it('drops a tiny tail and reports elevation change per split', () => {
    const s = computeSplits(track([[2020, 600]]));
    expect(s).toHaveLength(2);
    expect(s[0].elevDeltaM).toBeCloseTo(10, 5); // alt = d/100
  });

  it('returns nothing for a track with one point', () => {
    expect(computeSplits(track([]))).toEqual([]);
  });

  it('picks the fastest full km', () => {
    const s = computeSplits(track([[1000, 300], [1000, 280], [1000, 310], [400, 100]]));
    expect(fastestSplitIndex(s)).toBe(2); // the 400 m tail at 4:10 /km doesn't count
  });
});

describe('seriesByDistance', () => {
  it('samples pace every 100 m with a rolling window', () => {
    const pts = track([[1000, 300], [1000, 360]]);
    const series = seriesByDistance(pts, 100, 300);
    expect(series).toHaveLength(20);
    expect(series[5].pace).toBeCloseTo(300, 0); // 600 m: window 300–600, all at 5:00
    expect(series[19].pace).toBeCloseTo(360, 0); // 2000 m: window 1700–2000, all at 6:00
    expect(series[10].alt).toBeCloseTo(11, 5);
  });
});

describe('degenerate splits', () => {
  it('drops a tail with no moving time and never reports a zero-time km as fastest', () => {
    const pts: TrackPoint[] = [
      { t: 0, lat: 0, lon: 0, alt: null, d: 0, mt: 0, seg: 0 },
      { t: 1, lat: 0, lon: 0, alt: null, d: 1000, mt: 300, seg: 0 },
      { t: 2, lat: 0, lon: 0, alt: null, d: 2000, mt: 300, seg: 0 }, // bridged km, no time
      { t: 3, lat: 0, lon: 0, alt: null, d: 2200, mt: 300, seg: 0 }, // bridged tail
    ];
    const s = computeSplits(pts);
    expect(s).toHaveLength(2);
    expect(s[1].paceSecPerKm).toBe(0);
    expect(fastestSplitIndex(s)).toBe(1);
    expect(s.every((x) => Number.isFinite(x.paceSecPerKm))).toBe(true);
  });
});
