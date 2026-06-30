import { describe, it, expect } from 'vitest';
import { buildGaitReport } from '../reportRecord';
import { GaitResult } from '../../gait/types';

const sampleResult: GaitResult = {
  cadence: { value: 162, unit: 'spm', confidence: 'high' },
  stepCount: 27,
  durationSec: 10,
  captureQuality: { visibilityScore: 0.97, gaitCyclesDetected: 13, ok: true, issues: [] },
};

describe('buildGaitReport', () => {
  it('builds a persisted record with a cadence tip from a gait result', () => {
    const rec = buildGaitReport(sampleResult, 'running', 'abc', '2026-06-30T00:00:00.000Z');
    expect(rec.id).toBe('abc');
    expect(rec.createdAt).toBe('2026-06-30T00:00:00.000Z');
    expect(rec.scanType).toBe('running');
    expect(rec.result.cadence.value).toBe(162);
    expect(rec.cadenceTip).toContain('162');
  });
});
