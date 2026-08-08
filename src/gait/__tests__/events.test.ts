import { describe, it, expect } from 'vitest';
import { detectFootEvents } from '../events';
import { makeWalkingFrames } from './synthetic';
import { PoseFrame, Landmark, LANDMARK, LANDMARK_COUNT } from '../types';

/**
 * A STANDING-STILL subject with realistic landmark jitter — same deterministic
 * seeded-LCG fixture as ruleEngine.test.ts. Guards the absolute stillness floor
 * in detectFootEvents: without it the self-scaling peak thresholds fabricate
 * foot contacts from pure jitter.
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

describe('detectFootEvents', () => {
  it('finds per-foot contacts in a real synthetic walk', () => {
    const events = detectFootEvents(makeWalkingFrames({ durationSec: 10, fps: 30, cadence: 120 }));
    expect(events.left.contacts.length).toBeGreaterThan(0);
    expect(events.right.contacts.length).toBeGreaterThan(0);
    expect(events.ordered.length).toBeGreaterThan(0);
  });

  it('fabricates no contacts for a standing subject with realistic landmark jitter', () => {
    for (const seed of [1, 7, 42, 1234, 99991]) {
      const events = detectFootEvents(makeStandingJitterFrames(seed));
      expect(events.left.contacts).toEqual([]);
      expect(events.right.contacts).toEqual([]);
      expect(events.ordered).toEqual([]);
    }
  });
});
