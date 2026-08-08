import { describe, it, expect } from 'vitest';
import { computeCadence, assessCaptureQuality, analyzeGait } from '../ruleEngine';
import { makeWalkingFrames } from './synthetic';
import { PoseFrame, Landmark, LANDMARK, LANDMARK_COUNT } from '../types';

/**
 * A STANDING-STILL subject with realistic landmark jitter. Deterministic: a
 * small seeded LCG (not Math.random), gaussian-ish via the sum of 12 uniforms.
 */
function makeStandingJitterFrames(seed: number, std = 0.005, durationSec = 10, fps = 30): PoseFrame[] {
  let s = seed >>> 0;
  const rand = () => ((s = (1664525 * s + 1013904223) >>> 0), s / 2 ** 32);
  const gauss = () => {
    let t = 0;
    for (let k = 0; k < 12; k++) t += rand();
    return (t - 6) * std;
  };
  const n = Math.round(durationSec * fps);
  const frames: PoseFrame[] = [];
  for (let i = 0; i < n; i++) {
    const landmarks: Landmark[] = Array.from({ length: LANDMARK_COUNT }, () => ({
      x: 0.5 + gauss(),
      y: 0.5 + gauss(),
      visibility: 0.95,
    }));
    landmarks[LANDMARK.LEFT_ANKLE] = { x: 0.48 + gauss(), y: 0.9 + gauss(), visibility: 0.95 };
    landmarks[LANDMARK.RIGHT_ANKLE] = { x: 0.52 + gauss(), y: 0.9 + gauss(), visibility: 0.95 };
    frames.push({ t: (i / fps) * 1000, landmarks });
  }
  return frames;
}

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

  it('counts zero steps for a standing subject with realistic landmark jitter', () => {
    for (const seed of [1, 7, 42, 1234, 99991]) {
      const r = computeCadence(makeStandingJitterFrames(seed));
      expect(r.stepCount).toBe(0);
      expect(r.cadence.value).toBe(0);
      expect(r.cadence.confidence).toBe('low');
    }
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

  it('fails quality when the ankles specifically are hidden, even if the 6-landmark average passes', () => {
    const frames = makeWalkingFrames({ durationSec: 10, fps: 30, cadence: 120, visibility: 0.95 });
    for (const f of frames) {
      f.landmarks[LANDMARK.LEFT_ANKLE].visibility = 0.2;
      f.landmarks[LANDMARK.RIGHT_ANKLE].visibility = 0.2;
    }
    const q = assessCaptureQuality(frames, 20);
    expect(q.ok).toBe(false);
    expect(q.issues.join(' ').toLowerCase()).toMatch(/ankle|lower leg/);
  });

  it('flags a jittering standing subject with an honest not-enough-movement issue', () => {
    const q = assessCaptureQuality(makeStandingJitterFrames(42), 0);
    expect(q.ok).toBe(false);
    expect(q.issues.join(' ').toLowerCase()).toMatch(/leg movement/);
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

  it('never reports a confident cadence for a jittering standing subject (any seed)', () => {
    for (const seed of [1, 7, 42, 1234, 99991]) {
      const result = analyzeGait(makeStandingJitterFrames(seed));
      expect(result.cadence.value).toBe(0);
      expect(result.cadence.confidence).toBe('low');
      expect(result.captureQuality.ok).toBe(false);
    }
  });
});
