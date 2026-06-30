import { describe, it, expect } from 'vitest';
import { buildGaitFeatures } from '../features';
import { GaitReportRecord } from '../../storage/reportRecord';

const report: GaitReportRecord = {
  id: 'abc',
  createdAt: '2026-07-01T00:00:00.000Z',
  scanType: 'running',
  cadenceTip: 'a tip',
  result: {
    cadence: { value: 162.4, unit: 'spm', confidence: 'high' },
    stepCount: 27,
    durationSec: 10.2,
    captureQuality: { visibilityScore: 0.97, gaitCyclesDetected: 13, ok: true, issues: [] },
  },
};

describe('buildGaitFeatures', () => {
  it('extracts rounded numeric features for the LLM', () => {
    const f = buildGaitFeatures(report);
    expect(f.goal).toBe('running');
    expect(f.cadenceSpm).toBe(162);
    expect(f.cadenceConfidence).toBe('high');
    expect(f.stepCount).toBe(27);
    expect(f.durationSec).toBe(10);
    expect(f.captureOk).toBe(true);
    expect(f.visibilityPct).toBe(97);
    expect(f.gaitCycles).toBe(13);
  });

  it('never includes identifying fields (no id, name, email, timestamp)', () => {
    const f = buildGaitFeatures(report);
    const keys = Object.keys(f);
    for (const k of keys) {
      expect(k).not.toMatch(/\b(id|name|email|created|timestamp)\b/i);
    }
    expect(JSON.stringify(f)).not.toContain('abc');
    expect(JSON.stringify(f)).not.toContain('2026-07-01');
  });
});
