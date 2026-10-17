import { describe, it, expect } from 'vitest';
import { isValid, LiveLandmarkFilter, poseAt, prepareReplay } from '../motion';
import { makeSyntheticWalk } from '../../gait/synthetic';
import { LANDMARK, PoseFrame } from '../../gait/types';

// Deterministic noise so the tests are stable.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff - 0.5;
  };
}
const jitter = (frames: PoseFrame[], amount: number, seed = 7): PoseFrame[] => {
  const r = rng(seed);
  return frames.map((f) => ({
    t: f.t,
    landmarks: f.landmarks.map((p) => ({ ...p, x: p.x + r() * amount, y: p.y + r() * amount })),
  }));
};
const ANKLE = LANDMARK.LEFT_ANKLE;
const rms = (a: PoseFrame[], b: PoseFrame[], k: number) =>
  Math.sqrt(a.reduce((s, f, i) => s + (f.landmarks[k].x - b[i].landmarks[k].x) ** 2 + (f.landmarks[k].y - b[i].landmarks[k].y) ** 2, 0) / a.length);

describe('prepareReplay', () => {
  // ~15fps like the iOS capture.
  const run = makeSyntheticWalk({ cadence: 170, fps: 15, durationSec: 4 });
  const HIP = LANDMARK.LEFT_HIP;

  it('removes jitter from a still body', () => {
    for (const fps of [15, 30]) {
      const clip = makeSyntheticWalk({ cadence: 170, fps, durationSec: 4 });
      const still = clip.map((f) => ({ t: f.t, landmarks: clip[0].landmarks }));
      const noisy = jitter(still, 0.012);
      expect(rms(prepareReplay(noisy), still, ANKLE)).toBeLessThan((fps === 15 ? 0.8 : 0.7) * rms(noisy, still, ANKLE));
    }
  });

  it('never makes fast movement worse, and steadies walking', () => {
    for (const fps of [15, 30]) {
      const clip = makeSyntheticWalk({ cadence: 170, fps, durationSec: 4 });
      // Clean run: smoothing must not cut the swinging foot's arc or flatten the bounce.
      expect(rms(prepareReplay(clip), clip, ANKLE)).toBeLessThan(0.002);
      const noisy = jitter(clip, 0.012);
      const out = prepareReplay(noisy);
      for (const k of [ANKLE, HIP, LANDMARK.LEFT_KNEE, 11]) {
        expect(rms(out, clip, k)).toBeLessThanOrEqual(rms(noisy, clip, k) * 1.01);
      }
    }
    const walk = makeSyntheticWalk({ cadence: 110, gait: 'walk', fps: 15, durationSec: 4 });
    const noisyWalk = jitter(walk, 0.012);
    expect(rms(prepareReplay(noisyWalk), walk, HIP)).toBeLessThan(0.85 * rms(noisyWalk, walk, HIP));
  });

  it('does not lag the movement (zero-phase)', () => {
    const noisy = jitter(run, 0.012);
    const smoothed = prepareReplay(noisy);
    const err = (shift: number) => {
      let s = 0;
      for (let i = 2; i < run.length - 2; i++) s += Math.abs(smoothed[i].landmarks[HIP].y - run[i + shift].landmarks[HIP].y);
      return s;
    };
    expect(err(0)).toBeLessThan(err(1));
    expect(err(0)).toBeLessThan(err(-1));
  });

  it('bridges a short dropout along the motion, not a long one, and never mutates its input', () => {
    const walk = makeSyntheticWalk({ cadence: 110, gait: 'walk', fps: 15, durationSec: 4 });
    const drop = (from: number, to: number): PoseFrame[] =>
      walk.map((f, i) => ({
        t: f.t,
        landmarks: f.landmarks.map((p, k) => (k === ANKLE && i >= from && i < to ? { x: 0, y: 0, visibility: 0 } : p)),
      }));
    const short = drop(20, 23); // 200ms
    const before = JSON.stringify(short);
    const fixed = prepareReplay(short, { radius: 0 });
    expect(JSON.stringify(short)).toBe(before);
    let curved = 0;
    let straight = 0;
    for (let i = 20; i < 23; i++) {
      expect(isValid(fixed[i].landmarks[ANKLE])).toBe(true);
      const truth = walk[i].landmarks[ANKLE];
      curved += Math.hypot(fixed[i].landmarks[ANKLE].x - truth.x, fixed[i].landmarks[ANKLE].y - truth.y);
      const u = (i - 19) / 4;
      const a = walk[19].landmarks[ANKLE];
      const b = walk[23].landmarks[ANKLE];
      straight += Math.hypot(a.x + (b.x - a.x) * u - truth.x, a.y + (b.y - a.y) * u - truth.y);
    }
    expect(curved / 3).toBeLessThan(0.02);
    expect(curved).toBeLessThan(straight);
    const long = prepareReplay(drop(20, 32), { radius: 0 }); // 800ms
    expect(isValid(long[25].landmarks[ANKLE])).toBe(false);
  });
});

describe('poseAt', () => {
  const frames: PoseFrame[] = [
    { t: 0, landmarks: [{ x: 0.2, y: 0.4, visibility: 1 }, { x: 0.5, y: 0.5, visibility: 1 }] },
    { t: 100, landmarks: [{ x: 0.4, y: 0.6, visibility: 1 }, { x: 0, y: 0, visibility: 0 }] },
  ];

  it('blends between captured frames', () => {
    const p = poseAt(frames, 25)[0];
    expect(p.x).toBeCloseTo(0.25);
    expect(p.y).toBeCloseTo(0.45);
  });

  it('snaps a landmark missing on one side to the nearer good sample', () => {
    expect(poseAt(frames, 20)[1]).toMatchObject({ x: 0.5, y: 0.5 });
    expect(isValid(poseAt(frames, 80)[1])).toBe(false);
  });

  it('clamps outside the capture', () => {
    expect(poseAt(frames, -50)[0].x).toBe(0.2);
    expect(poseAt(frames, 500)[0].x).toBe(0.4);
  });
});

describe('LiveLandmarkFilter', () => {
  it('steadies a still joint and still follows a fast move', () => {
    const f = new LiveLandmarkFilter();
    const r = rng(3);
    const out: number[] = [];
    for (let i = 0; i < 30; i++) out.push(f.apply([{ x: 0.5 + r() * 0.01, y: 0.5 }], i * 66)[0].x);
    const spread = Math.max(...out.slice(10)) - Math.min(...out.slice(10));
    expect(spread).toBeLessThan(0.006);
    // Jump 0.2 to the right and hold: within ~3 frames it's most of the way there.
    let x = 0;
    for (let i = 30; i < 33; i++) x = f.apply([{ x: 0.7, y: 0.5 }], i * 66)[0].x;
    expect(x).toBeGreaterThan(0.65);
  });
});
