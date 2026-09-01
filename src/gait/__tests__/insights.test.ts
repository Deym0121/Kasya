import { describe, it, expect } from 'vitest';
import { cadenceTip, cadenceVerdict } from '../insights';

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

describe('cadenceVerdict', () => {
  it('reads a typical running cadence as inside the band', () => {
    const v = cadenceVerdict(172);
    expect(v.inRange).toBe(true);
    expect(v.line).toContain('160–180');
    expect(v.line).toMatch(/running/);
    expect(v.line).toMatch(/inside/);
  });

  it('reads a low running cadence as sitting a bit below the band', () => {
    const v = cadenceVerdict(150, 'running');
    expect(v.inRange).toBe(false);
    expect(v.line).toContain('160–180');
    expect(v.line).toMatch(/below/);
  });

  it('uses walking bands for walking-shaped goals', () => {
    for (const goal of ['walking', 'daily_comfort', 'recovery']) {
      const v = cadenceVerdict(110, goal);
      expect(v.inRange).toBe(true);
      expect(v.line).toContain('90–130');
      expect(v.line).toMatch(/walking/);
      expect(v.line).toMatch(/inside/);
    }
  });

  it('reads above the band as brisk or quick, never as a concern', () => {
    const walker = cadenceVerdict(140, 'walking');
    expect(walker.inRange).toBe(false);
    expect(walker.line).toMatch(/above/);
    expect(walker.line).toMatch(/brisk/);
    const runner = cadenceVerdict(188);
    expect(runner.inRange).toBe(false);
    expect(runner.line).toMatch(/above/);
    expect(runner.line).toMatch(/quick/);
  });

  it('defaults to running bands like the rest of the coaching', () => {
    expect(cadenceVerdict(150).line).toContain('160–180');
    expect(cadenceVerdict(150, 'gym').line).toContain('160–180');
  });

  it('keeps every branch hedged and free of medical / prescriptive language', () => {
    const goals = [undefined, 'running', 'gym', 'walking', 'daily_comfort', 'recovery'];
    const values = [80, 110, 128, 150, 172, 188];
    for (const goal of goals) {
      for (const value of values) {
        const line = cadenceVerdict(value, goal).line.toLowerCase();
        expect(line).toMatch(/about|roughly|around/);
        expect(line).not.toMatch(/injur|diagnos|pronation|abnormal|medical|disease/);
        expect(line).not.toMatch(/\bmust\b|\brisk\b|\bproblem\b|\bfault\b|imbalance|\bcorrect\b/);
      }
    }
  });
});
