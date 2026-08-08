import { describe, it, expect } from 'vitest';
import { cadenceTip } from '../insights';

describe('cadenceTip', () => {
  it('nudges toward quicker, lighter steps when cadence is low', () => {
    const tip = cadenceTip({ value: 150, unit: 'spm', confidence: 'high' });
    expect(tip).toContain('150');
    expect(tip).toMatch(/quick|light/i);
  });

  it('reassures when cadence is already brisk', () => {
    const tip = cadenceTip({ value: 178, unit: 'spm', confidence: 'high' });
    expect(tip).toContain('178');
    expect(tip).toMatch(/brisk|nice|keep/i);
  });

  it('asks for a re-record when confidence is low', () => {
    const tip = cadenceTip({ value: 0, unit: 'spm', confidence: 'low' });
    expect(tip).toMatch(/again|reliabl|lighting|frame/i);
  });

  it('does not tell a walker at a typical walking cadence to speed up', () => {
    for (const goal of ['walking', 'daily_comfort', 'recovery']) {
      const tip = cadenceTip({ value: 110, unit: 'spm', confidence: 'high' }, goal);
      expect(tip).toContain('110');
      expect(tip.toLowerCase()).not.toMatch(/nudg|quicker|speed up/);
      expect(tip.toLowerCase()).toMatch(/typical|walking|comfortable/);
    }
  });

  it('nudges gently only well below the typical walking band', () => {
    const tip = cadenceTip({ value: 88, unit: 'spm', confidence: 'high' }, 'walking');
    expect(tip).toContain('88');
    expect(tip.toLowerCase()).toMatch(/quicker|nudg/);
  });

  it('keeps the runner advice for running and gym goals (and by default)', () => {
    for (const goal of ['running', 'gym', undefined]) {
      const tip = cadenceTip({ value: 150, unit: 'spm', confidence: 'high' }, goal);
      expect(tip.toLowerCase()).toMatch(/quicker|light/);
    }
  });

  it('keeps every branch hedged and free of medical / prescriptive language', () => {
    const goals = [undefined, 'running', 'gym', 'walking', 'daily_comfort', 'recovery'];
    const values = [80, 110, 128, 150, 178];
    const tips: string[] = [cadenceTip({ value: 0, unit: 'spm', confidence: 'low' })];
    for (const goal of goals) {
      for (const value of values) {
        tips.push(cadenceTip({ value, unit: 'spm', confidence: 'high' }, goal));
      }
    }
    for (const tip of tips) {
      const t = tip.toLowerCase();
      expect(t).toMatch(/about|roughly|around|many|couldn/);
      expect(t).not.toMatch(/injur|diagnos|pronation|abnormal|medical|disease/);
      expect(t).not.toMatch(/\bmust\b|\brisk\b|\bproblem\b|\bfault\b|imbalance|\bcorrect\b/);
    }
  });
});
