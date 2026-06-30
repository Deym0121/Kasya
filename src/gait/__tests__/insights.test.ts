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
});
