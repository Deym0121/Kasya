import { describe, it, expect } from 'vitest';
import { computeFormMetrics, buildFeedback, FormMetrics } from '../form';
import { makeSyntheticWalk } from '../synthetic';

describe('computeFormMetrics', () => {
  it('returns finite metrics in sensible ranges for a synthetic walk', () => {
    const m = computeFormMetrics(makeSyntheticWalk({ durationSec: 8, fps: 30, cadence: 168 }));
    for (const v of Object.values(m)) expect(Number.isFinite(v)).toBe(true);
    expect(m.verticalOscillationPct).toBeGreaterThanOrEqual(0);
    expect(m.kneeFlexionRangeDeg).toBeGreaterThanOrEqual(0);
    expect(m.rhythmRegularityPct).toBeGreaterThanOrEqual(0);
    expect(m.rhythmRegularityPct).toBeLessThanOrEqual(100);
    expect(m.symmetryPct).toBeLessThanOrEqual(100);
  });
});

const good: FormMetrics = {
  verticalOscillationPct: 6,
  kneeFlexionRangeDeg: 40,
  overstrideScore: 20,
  rhythmRegularityPct: 90,
  symmetryPct: 92,
};

describe('buildFeedback', () => {
  it('always returns a summary and at least one recommendation', () => {
    const f = buildFeedback(170, 'high', good, true);
    expect(f.summary.length).toBeGreaterThan(0);
    expect(f.recommendations.length).toBeGreaterThan(0);
  });

  it('flags overstriding when the score is high', () => {
    const f = buildFeedback(158, 'high', { ...good, overstrideScore: 82 }, true);
    expect(f.observations.join(' ').toLowerCase()).toMatch(/ahead|overstrid|under you/);
  });

  it('asks to re-record when the capture is poor', () => {
    const f = buildFeedback(0, 'low', good, false);
    expect((f.summary + ' ' + f.recommendations.join(' ')).toLowerCase()).toMatch(
      /again|re-?record|frame|lighting/,
    );
  });

  it('never uses medical or injury language', () => {
    const f = buildFeedback(150, 'high', { ...good, verticalOscillationPct: 15, overstrideScore: 88 }, true);
    const all = (f.summary + ' ' + f.observations.join(' ') + ' ' + f.recommendations.join(' ')).toLowerCase();
    expect(all).not.toMatch(/injur|diagnos|pronation|abnormal|medical|disease/);
  });
});
