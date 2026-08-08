import { describe, it, expect } from 'vitest';
import { analyzeGaitDetailed, buildDetail } from '../detailed';
import { analyzeGait } from '../ruleEngine';
import { makeSyntheticWalk } from '../synthetic';

const walk = makeSyntheticWalk({ durationSec: 8, fps: 30, cadence: 160 });

describe('analyzeGaitDetailed', () => {
  it('surfaces the smart per-step metrics rounded like the form metrics', () => {
    const d = analyzeGaitDetailed(walk);
    expect(Number.isInteger(d.metrics.overstrideScore)).toBe(true);
    expect(Number.isInteger(d.metrics.rhythmRegularityPct)).toBe(true);
    expect(Number.isInteger(d.metrics.symmetryPct)).toBe(true);
  });

  it('quotes the same cadence in the walkthrough closing line as the headline', () => {
    const d = analyzeGaitDetailed(walk);
    const closing = d.walkthrough[d.walkthrough.length - 1];
    const quoted = closing.match(/~(\d+) per minute/);
    expect(quoted).toBeTruthy();
    expect(Number(quoted![1])).toBe(Math.round(d.cadence.value));
  });

  it('passes a walking goal through so an in-band walker is not told to speed up', () => {
    const slow = makeSyntheticWalk({ durationSec: 8, fps: 30, cadence: 110 });
    const d = analyzeGaitDetailed(slow, 'walking');
    const all = (d.feedback.observations.join(' ') + ' ' + d.feedback.recommendations.join(' ')).toLowerCase();
    expect(all).not.toMatch(/nudging your cadence up|quicker, shorter steps/);
  });
});

describe('buildDetail', () => {
  it('stores rounded metrics and a goal-aware feedback block', () => {
    const slow = makeSyntheticWalk({ durationSec: 8, fps: 30, cadence: 110 });
    const result = analyzeGait(slow);
    const detail = buildDetail(result, slow, 'walking');
    expect(Number.isInteger(detail.metrics.overstrideScore)).toBe(true);
    const all = (detail.feedback.observations.join(' ') + ' ' + detail.feedback.recommendations.join(' ')).toLowerCase();
    expect(all).not.toMatch(/nudging your cadence up|quicker, shorter steps/);
  });
});
