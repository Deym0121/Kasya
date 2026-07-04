import { describe, it, expect } from 'vitest';
import { GENERIC_TIPS, pickCoachTip, buildCoachPlan } from '../coach';

const latest = {
  cadenceTip: 'Your cadence is about 160 steps per minute — a comfortable range for many.',
  feedback: { recommendations: ['Try to land with your foot a little closer under your body — it often feels smoother.'] },
};

describe('pickCoachTip', () => {
  it('is deterministic for a fixed day key', () => {
    const a = pickCoachTip(latest, '2026-07-03');
    const b = pickCoachTip(latest, '2026-07-03');
    expect(a).toEqual(b);
  });

  it('rotates through the pool across different days', () => {
    const texts = new Set<string>();
    for (let d = 1; d <= 20; d++) texts.add(pickCoachTip(latest, `2026-07-${String(d).padStart(2, '0')}`).text);
    expect(texts.size).toBeGreaterThan(1);
  });

  it('can surface report-sourced tips and flags them as scan-sourced', () => {
    let sawScan = false;
    for (let d = 1; d <= 28; d++) {
      const t = pickCoachTip(latest, `2026-06-${String(d).padStart(2, '0')}`);
      if (t.source === 'scan') {
        sawScan = true;
        expect([latest.cadenceTip, ...latest.feedback.recommendations]).toContain(t.text);
      }
    }
    expect(sawScan).toBe(true);
  });

  it('falls back to the generic pool with no report', () => {
    const t = pickCoachTip(null, '2026-07-03');
    expect(GENERIC_TIPS).toContain(t.text);
    expect(t.source).toBe('general');
  });

  it('keeps the entire generic pool free of medical / prescriptive language', () => {
    const all = GENERIC_TIPS.join(' ').toLowerCase();
    expect(all).not.toMatch(/injur|diagnos|pronation|abnormal|medical|disease/);
    expect(all).not.toMatch(/\bshould\b|\bmust\b|\brisk\b|\bproblem\b|\bfault\b|imbalance|\bcorrect\b/);
    for (const tip of GENERIC_TIPS) expect(tip.toLowerCase()).toMatch(/often|usually|can|makes|best|easier/);
  });
});

describe('buildCoachPlan', () => {
  const base = { goal: 'running', cadenceSpm: 168 };

  it('always returns a cadence-anchored headline and at least one focus item', () => {
    const p = buildCoachPlan(base);
    expect(p.headline).toMatch(/168/);
    expect(p.items.length).toBeGreaterThan(0);
  });

  it('surfaces focus items for flagged metrics', () => {
    const p = buildCoachPlan({ ...base, bouncePct: 15, overstrideScore: 80, rhythmPct: 60, symmetryPct: 65 });
    const areas = p.items.map((i) => i.area).join(' ').toLowerCase();
    expect(areas).toMatch(/bounce/);
    expect(areas).toMatch(/placement/);
    expect(areas).toMatch(/rhythm/);
    expect(areas).toMatch(/left/);
  });

  it('asks for a re-scan when the capture was poor', () => {
    const p = buildCoachPlan({ ...base, captureOk: false });
    expect(p.items[0].cue.toLowerCase()).toMatch(/record again|re-?scan|frame/);
  });

  it('never uses medical / prescriptive language in any branch', () => {
    const p = buildCoachPlan({ ...base, bouncePct: 15, overstrideScore: 80, rhythmPct: 60, symmetryPct: 65 });
    const all = (p.headline + ' ' + p.items.map((i) => `${i.area} ${i.cue}`).join(' ')).toLowerCase();
    expect(all).not.toMatch(/injur|diagnos|pronation|abnormal|medical|disease/);
    expect(all).not.toMatch(/\bshould\b|\bmust\b|\bfault\b|imbalance|\bcorrect\b/);
  });
});
