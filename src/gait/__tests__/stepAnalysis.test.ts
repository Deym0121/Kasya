import { describe, it, expect } from 'vitest';
import { detectFootEvents } from '../events';
import { analyzeSteps, describeGait, StepAnalysis } from '../stepAnalysis';
import { makeSyntheticWalk } from '../synthetic';

const walk = makeSyntheticWalk({ durationSec: 8, fps: 30, cadence: 160 });

describe('detectFootEvents', () => {
  it('detects multiple, mostly-alternating left/right foot contacts', () => {
    const e = detectFootEvents(walk);
    expect(e.left.contacts.length).toBeGreaterThanOrEqual(6);
    expect(e.right.contacts.length).toBeGreaterThanOrEqual(6);
    expect(e.ordered.length).toBe(e.left.contacts.length + e.right.contacts.length);
    let alternations = 0;
    for (let i = 1; i < e.ordered.length; i++) {
      if (e.ordered[i].foot !== e.ordered[i - 1].foot) alternations++;
    }
    expect(alternations).toBeGreaterThan(e.ordered.length * 0.6);
  });
});

describe('analyzeSteps', () => {
  it('produces a plausible, detailed step analysis', () => {
    const a = analyzeSteps(walk);
    expect(a.stepCount).toBeGreaterThan(6);
    expect(a.cadenceSpm).toBeGreaterThan(120);
    expect(a.cadenceSpm).toBeLessThan(200);
    expect(a.stanceRatioPct).toBeGreaterThan(0);
    expect(a.stanceRatioPct).toBeLessThanOrEqual(100);
    expect(a.symmetryPct).toBeLessThanOrEqual(100);
    expect(a.rhythmRegularityPct).toBeGreaterThan(50);
    expect(['left', 'right']).toContain(a.leadFoot);
  });

  it('returns an empty analysis for too few frames', () => {
    expect(analyzeSteps(walk.slice(0, 3)).stepCount).toBe(0);
  });

  it('stores display scores rounded to integers', () => {
    const a = analyzeSteps(walk);
    expect(Number.isInteger(a.overstrideScore)).toBe(true);
    expect(Number.isInteger(a.rhythmRegularityPct)).toBe(true);
    expect(Number.isInteger(a.symmetryPct)).toBe(true);
  });
});

describe('describeGait', () => {
  it('explains the step cycle in plain, non-medical language', () => {
    const d = describeGait(analyzeSteps(walk), 8);
    expect(d.walkthrough.length).toBeGreaterThanOrEqual(4);
    const all = d.walkthrough.join(' ').toLowerCase();
    expect(all).toMatch(/swing|foot|land|stance|push/);
    expect(all).not.toMatch(/injur|diagnos|pronation|abnormal|medical/);
  });

  it('omits the stance and knee clauses when sparse events (exactly 2 contacts) left them unestimated', () => {
    // What analyzeSteps returns for exactly 2 contacts: stance needs a second
    // same-foot contact and the knee angles can degenerate to 0.
    const sparse: StepAnalysis = {
      stepCount: 2,
      cadenceSpm: 30,
      meanStepTimeSec: 0.52,
      rhythmRegularityPct: 0,
      stanceRatioPct: 0,
      overstrideScore: 20,
      kneeContactDeg: 0,
      kneePeakDeg: 0,
      symmetryPct: 0,
      leadFoot: 'left',
    };
    const d = describeGait(sparse, 5);
    const all = d.walkthrough.join(' ');
    expect(all).not.toMatch(/0% of each step/);
    expect(all).not.toMatch(/around 0°|toward about 0°|about 0° of/);
  });

  it('describes the knee at contact as flexion from straight, matching the swing convention', () => {
    const a = analyzeSteps(walk);
    const d = describeGait(a, 8);
    const strike = d.walkthrough[1];
    // No raw included angles like "around 179°" — bend from straight instead.
    expect(strike).not.toMatch(/1[0-8]\d°/);
    const bend = strike.match(/about (\d+)°/);
    expect(bend).toBeTruthy();
    expect(Number(bend![1])).toBe(Math.max(0, 180 - a.kneeContactDeg));
  });

  it('quotes the report cadence, not a re-derived one, in the closing line', () => {
    const d = describeGait(analyzeSteps(walk), 8, 147.6);
    expect(d.walkthrough[d.walkthrough.length - 1]).toContain('~148 per minute');
  });

  it('drops the per-minute parenthetical when no report cadence is given', () => {
    const d = describeGait(analyzeSteps(walk), 8);
    expect(d.summary).not.toMatch(/per minute/);
  });
});
