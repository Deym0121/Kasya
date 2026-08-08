import { describe, it, expect } from 'vitest';
import { buildTrends, cadenceDelta, deltaCopy, TrendReportLike } from '../progress';

function report(
  createdAt: string,
  cadence: number,
  opts: { confidence?: string; ok?: boolean; symmetry?: number; stance?: number } = {},
): TrendReportLike {
  return {
    createdAt,
    result: {
      cadence: { value: cadence, confidence: opts.confidence ?? 'high' },
      captureQuality: { ok: opts.ok ?? true },
    },
    steps:
      opts.symmetry != null || opts.stance != null
        ? { symmetryPct: opts.symmetry ?? 0, stanceRatioPct: opts.stance ?? 0 }
        : undefined,
  };
}

// Newest-first, like listReports() returns.
const three = [
  report('2026-07-03T10:00:00Z', 168, { symmetry: 92, stance: 60 }),
  report('2026-07-02T10:00:00Z', 160, { symmetry: 88, stance: 58 }),
  report('2026-07-01T10:00:00Z', 150, { symmetry: 90, stance: 61 }),
];

describe('buildTrends', () => {
  it('orders points oldest → newest regardless of input order', () => {
    const t = buildTrends(three);
    expect(t.cadence.map((p) => p.value)).toEqual([150, 160, 168]);
    expect(t.symmetry.map((p) => p.value)).toEqual([90, 88, 92]);
    expect(t.stance.map((p) => p.value)).toEqual([61, 58, 60]);
  });

  it('skips low-confidence and failed-capture scans from every trend series', () => {
    const t = buildTrends([
      ...three,
      report('2026-06-30T10:00:00Z', 40, { confidence: 'low', symmetry: 70, stance: 50 }),
      report('2026-06-29T10:00:00Z', 155, { ok: false, symmetry: 71, stance: 51 }),
    ]);
    expect(t.cadence.map((p) => p.value)).toEqual([150, 160, 168]);
    expect(t.symmetry.map((p) => p.value)).toEqual([90, 88, 92]);
    expect(t.stance.map((p) => p.value)).toEqual([61, 58, 60]);
  });

  it('returns empty trends for zero scans', () => {
    const t = buildTrends([]);
    expect(t.cadence).toEqual([]);
    expect(t.symmetry).toEqual([]);
    expect(t.stance).toEqual([]);
  });
});

describe('cadenceDelta', () => {
  it('is null with fewer than two usable scans', () => {
    expect(cadenceDelta([])).toBeNull();
    expect(cadenceDelta([three[0]])).toBeNull();
    expect(cadenceDelta([three[0], report('2026-07-02T10:00:00Z', 100, { confidence: 'low' })])).toBeNull();
  });

  it('compares the two most recent usable scans', () => {
    const d = cadenceDelta(three)!;
    expect(d.deltaSpm).toBe(8);
    expect(d.direction).toBe('up');
  });

  it('treats small differences as steady', () => {
    const d = cadenceDelta([report('2026-07-03T10:00:00Z', 161), report('2026-07-02T10:00:00Z', 160)])!;
    expect(d.direction).toBe('steady');
  });

  it('detects a downward change', () => {
    const d = cadenceDelta([report('2026-07-03T10:00:00Z', 150), report('2026-07-02T10:00:00Z', 160)])!;
    expect(d.direction).toBe('down');
    expect(d.deltaSpm).toBe(-10);
  });
});

describe('deltaCopy', () => {
  it('is hedged and free of medical / prescriptive language in every branch', () => {
    const branches = [
      deltaCopy({ deltaSpm: 8, direction: 'up' }),
      deltaCopy({ deltaSpm: -6, direction: 'down' }),
      deltaCopy({ deltaSpm: 1, direction: 'steady' }),
    ];
    for (const c of branches) {
      expect(c.toLowerCase()).toMatch(/about/);
      expect(c.toLowerCase()).not.toMatch(/injur|diagnos|pronation|abnormal|medical|disease/);
      expect(c.toLowerCase()).not.toMatch(/\bshould\b|\bmust\b|\brisk\b|\bproblem\b|\bfault\b|imbalance|\bcorrect\b/);
    }
  });
});
