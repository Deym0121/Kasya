import { describe, it, expect } from 'vitest';
import { toGaitReportRow, GaitReportRecord, GAIT_REPORT_ROW_KEYS } from '../reportRecord';

// A full record WITH landmark frames present, to prove the serializer strips them.
const record = {
  id: 'r1',
  createdAt: '2026-07-05T00:00:00Z',
  scanType: 'running',
  result: {
    cadence: { value: 168.4, unit: 'spm', confidence: 'high' },
    stepCount: 20,
    durationSec: 10,
    captureQuality: { visibilityScore: 0.9, gaitCyclesDetected: 5, ok: true, issues: [] },
  },
  cadenceTip: 'Nice steady cadence.',
  metrics: { verticalOscillationPct: 8, overstrideScore: 3, kneeFlexionRangeDeg: 40, symmetryPct: 96, rhythmRegularityPct: 92 },
  frontal: { metrics: { hipDropPct: 4, stepWidthPct: 10, lateralSwayPct: 5, symmetryPct: 94 } },
  frames: [{ t: 0, landmarks: [{ x: 0.1, y: 0.2, z: 0, visibility: 0.9 }] }],
  frontalFrames: [{ t: 0, landmarks: [{ x: 0.3, y: 0.4, z: 0, visibility: 0.8 }] }],
  walkthrough: ['step one', 'step two'],
} as unknown as GaitReportRecord;

describe('toGaitReportRow', () => {
  it('NEVER includes raw landmark frames (the numeric-only sync boundary)', () => {
    const row = toGaitReportRow(record);
    expect((row as any).frames).toBeUndefined();
    expect((row as any).frontalFrames).toBeUndefined();
    const json = JSON.stringify(row);
    expect(json).not.toContain('"frames"');
    expect(json).not.toContain('"frontalFrames"');
    expect(json).not.toContain('"landmarks"');
  });

  it('is a strict whitelist — only the known gait_reports columns appear', () => {
    const row = toGaitReportRow(record);
    for (const k of Object.keys(row)) expect(GAIT_REPORT_ROW_KEYS).toContain(k);
  });

  it('maps the derived numeric + text fields onto the row', () => {
    const row = toGaitReportRow(record);
    expect(row.scan_type).toBe('running');
    expect(row.cadence).toBe(168); // rounded
    expect(row.knee_flexion_range).toBe(40);
    expect(row.symmetry_score).toBe(96);
    expect(row.hip_drop_score).toBe(4);
    expect(row.capture_quality).toMatchObject({ ok: true, visibilityScore: 0.9 });
    expect(typeof row.summary).toBe('string');
    expect(row.metrics).toMatchObject({ cadence: { value: 168, confidence: 'high' } });
  });

  it('tolerates a minimal record with no metrics/frontal, still stripping frames', () => {
    const minimal = {
      id: 'x',
      createdAt: 't',
      scanType: 'walking',
      result: record.result,
      cadenceTip: 'tip',
      frames: [{ t: 1, landmarks: [{ x: 1, y: 1 }] }],
    } as unknown as GaitReportRecord;
    const row = toGaitReportRow(minimal);
    expect(row.scan_type).toBe('walking');
    expect(row.metrics).toBeTruthy(); // at least the cadence block
    expect((row as any).frames).toBeUndefined();
    expect(row.hip_drop_score).toBeNull();
  });
});
