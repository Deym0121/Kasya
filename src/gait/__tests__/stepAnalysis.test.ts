import { describe, it, expect } from 'vitest';
import { detectFootEvents } from '../events';
import { analyzeSteps, describeGait } from '../stepAnalysis';
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
});

describe('describeGait', () => {
  it('explains the step cycle in plain, non-medical language', () => {
    const d = describeGait(analyzeSteps(walk), 8);
    expect(d.walkthrough.length).toBeGreaterThanOrEqual(4);
    const all = d.walkthrough.join(' ').toLowerCase();
    expect(all).toMatch(/swing|foot|land|stance|push/);
    expect(all).not.toMatch(/injur|diagnos|pronation|abnormal|medical/);
  });
});
