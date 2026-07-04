import { describe, it, expect } from 'vitest';
import {
  analyzeFrontal,
  assessFrontalQuality,
  buildFrontalFeedback,
  analyzeFrontalDetailed,
  analyzeFrontalSides,
  frontalSummary,
  FrontalMetrics,
} from '../frontal';
import { makeSyntheticRearWalk } from '../synthetic';

const rear = makeSyntheticRearWalk({ durationSec: 8, fps: 30, cadence: 160 });

describe('analyzeFrontal', () => {
  it('returns finite frontal-plane metrics in sensible ranges for a rear-view walk', () => {
    const m = analyzeFrontal(rear);
    for (const v of Object.values(m)) expect(Number.isFinite(v)).toBe(true);
    expect(m.hipDropPct).toBeGreaterThanOrEqual(0);
    expect(m.hipDropPct).toBeLessThanOrEqual(100);
    expect(m.stepWidthPct).toBeGreaterThan(0);
    expect(m.lateralSwayPct).toBeGreaterThanOrEqual(0);
    expect(m.symmetryPct).toBeGreaterThanOrEqual(0);
    expect(m.symmetryPct).toBeLessThanOrEqual(100);
  });

  it('reads a clean, even walk as fairly symmetric', () => {
    expect(analyzeFrontal(rear).symmetryPct).toBeGreaterThanOrEqual(80);
  });

  it('detects more hip drop as the pelvic obliquity grows', () => {
    const mild = analyzeFrontal(makeSyntheticRearWalk({ hipDrop: 0.006 }));
    const strong = analyzeFrontal(makeSyntheticRearWalk({ hipDrop: 0.03 }));
    expect(strong.hipDropPct).toBeGreaterThan(mild.hipDropPct);
  });

  it('reads a lopsided walk as less symmetric than an even one', () => {
    const even = analyzeFrontal(makeSyntheticRearWalk({ asym: 0 }));
    const lopsided = analyzeFrontal(makeSyntheticRearWalk({ asym: 0.8 }));
    expect(lopsided.symmetryPct).toBeLessThan(even.symmetryPct);
  });

  it('returns empty metrics for too few frames', () => {
    expect(analyzeFrontal(rear.slice(0, 2)).stepWidthPct).toBe(0);
  });
});

describe('assessFrontalQuality', () => {
  it('passes a clean, well-lit rear capture', () => {
    const q = assessFrontalQuality(rear);
    expect(q.ok).toBe(true);
    expect(q.issues.length).toBe(0);
  });

  it('flags a capture whose landmarks are poorly visible', () => {
    const q = assessFrontalQuality(makeSyntheticRearWalk({ visibility: 0.2 }));
    expect(q.ok).toBe(false);
    expect(q.issues.length).toBeGreaterThan(0);
  });

  it('flags an empty capture', () => {
    const q = assessFrontalQuality([]);
    expect(q.ok).toBe(false);
  });
});

describe('buildFrontalFeedback', () => {
  const balanced: FrontalMetrics = { hipDropPct: 8, stepWidthPct: 80, lateralSwayPct: 6, symmetryPct: 95 };

  it('always returns at least one observation and recommendation', () => {
    const f = buildFrontalFeedback(balanced, true);
    expect(f.observations.length).toBeGreaterThan(0);
    expect(f.recommendations.length).toBeGreaterThan(0);
  });

  it('asks to re-record when the capture is poor', () => {
    const f = buildFrontalFeedback(balanced, false);
    expect(f.recommendations.join(' ').toLowerCase()).toMatch(/again|record|frame/);
  });

  it('never uses medical, injury, or pronation language', () => {
    const noisy: FrontalMetrics = { hipDropPct: 40, stepWidthPct: 30, lateralSwayPct: 20, symmetryPct: 55 };
    const f = buildFrontalFeedback(noisy, true);
    const all = (f.observations.join(' ') + ' ' + f.recommendations.join(' ')).toLowerCase();
    expect(all).not.toMatch(/injur|diagnos|pronation|valgus|abnormal|medical|disease|trendelenburg/);
  });
});

describe('analyzeFrontalSides', () => {
  it('returns finite per-foot lift and placement in sensible ranges', () => {
    const s = analyzeFrontalSides(rear);
    for (const foot of [s.left, s.right]) {
      expect(Number.isFinite(foot.liftPct)).toBe(true);
      expect(Number.isFinite(foot.placementPct)).toBe(true);
      expect(foot.liftPct).toBeGreaterThanOrEqual(0);
      expect(foot.liftPct).toBeLessThanOrEqual(100);
      expect(foot.placementPct).toBeGreaterThan(0);
    }
  });

  it('reads an even walk as near-equal left/right foot lift', () => {
    const s = analyzeFrontalSides(makeSyntheticRearWalk({ asym: 0 }));
    expect(Math.abs(s.left.liftPct - s.right.liftPct)).toBeLessThan(3);
  });

  it('reads a lopsided walk as a bigger left/right lift difference', () => {
    const even = analyzeFrontalSides(makeSyntheticRearWalk({ asym: 0 }));
    const lop = analyzeFrontalSides(makeSyntheticRearWalk({ asym: 0.8 }));
    const evenGap = Math.abs(even.left.liftPct - even.right.liftPct);
    const lopGap = Math.abs(lop.left.liftPct - lop.right.liftPct);
    expect(lopGap).toBeGreaterThan(evenGap);
  });

  it('returns empty per-foot data for too few frames', () => {
    const s = analyzeFrontalSides(rear.slice(0, 2));
    expect(s.left.placementPct).toBe(0);
    expect(s.right.placementPct).toBe(0);
  });
});

describe('analyzeFrontalDetailed + frontalSummary', () => {
  it('bundles metrics, quality, feedback and per-side data, and summarizes in plain language', () => {
    const a = analyzeFrontalDetailed(rear);
    expect(a.quality.ok).toBe(true);
    expect(a.metrics.symmetryPct).toBeGreaterThan(0);
    expect(a.sides.left.placementPct).toBeGreaterThan(0);
    expect(a.sides.right.placementPct).toBeGreaterThan(0);
    const s = frontalSummary(a.metrics).toLowerCase();
    expect(s).toMatch(/behind|hip|base|balanced/);
    expect(s).not.toMatch(/injur|diagnos|pronation|valgus/);
  });
});
