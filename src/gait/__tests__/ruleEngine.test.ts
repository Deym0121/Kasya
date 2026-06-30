import { describe, it, expect } from 'vitest';
import { computeCadence, assessCaptureQuality, analyzeGait } from '../ruleEngine';
import { makeWalkingFrames } from './synthetic';

describe('computeCadence', () => {
  it('recovers ~120 steps/min from a synthetic 120 spm walk', () => {
    const frames = makeWalkingFrames({ durationSec: 10, fps: 30, cadence: 120 });
    const r = computeCadence(frames);
    expect(r.stepCount).toBeGreaterThanOrEqual(18);
    expect(r.stepCount).toBeLessThanOrEqual(22);
    expect(r.cadence.value).toBeGreaterThanOrEqual(108);
    expect(r.cadence.value).toBeLessThanOrEqual(132);
    expect(r.cadence.unit).toBe('spm');
  });

  it('returns zero with low confidence when there are too few frames', () => {
    const r = computeCadence([]);
    expect(r.stepCount).toBe(0);
    expect(r.cadence.value).toBe(0);
    expect(r.cadence.confidence).toBe('low');
  });

  it('detects no steps when the subject is standing still', () => {
    const frames = makeWalkingFrames({ durationSec: 10, fps: 30, cadence: 0 });
    expect(computeCadence(frames).stepCount).toBe(0);
  });
});

describe('assessCaptureQuality', () => {
  it('flags a capture whose landmarks are poorly visible', () => {
    const frames = makeWalkingFrames({ durationSec: 10, fps: 30, cadence: 120, visibility: 0.2 });
    const q = assessCaptureQuality(frames, 20);
    expect(q.ok).toBe(false);
    expect(q.issues.length).toBeGreaterThan(0);
  });

  it('passes a clean, well-lit, multi-cycle capture', () => {
    const frames = makeWalkingFrames({ durationSec: 10, fps: 30, cadence: 120, visibility: 0.95 });
    const q = assessCaptureQuality(frames, 20);
    expect(q.ok).toBe(true);
    expect(q.gaitCyclesDetected).toBeGreaterThanOrEqual(2);
  });
});

describe('analyzeGait', () => {
  it('produces a trustworthy cadence result from a good capture', () => {
    const frames = makeWalkingFrames({ durationSec: 10, fps: 30, cadence: 160 });
    const result = analyzeGait(frames);
    expect(result.captureQuality.ok).toBe(true);
    expect(result.cadence.value).toBeGreaterThan(140);
    expect(result.cadence.value).toBeLessThan(180);
    expect(result.cadence.confidence).toBe('high');
  });
});
