import { describe, it, expect } from 'vitest';
import { skeletonViewBox, skeletonViewBoxAttr } from '../skeletonFrame';
import { makeSyntheticWalk } from '../../gait/synthetic';
import { PoseFrame } from '../../gait/types';

const shiftX = (frames: PoseFrame[], dx: number, k = 1): PoseFrame[] =>
  frames.map((f) => ({ t: f.t, landmarks: f.landmarks.map((p) => ({ ...p, x: (p.x + dx) * k })) }));

describe('skeletonViewBox', () => {
  it('centres a portrait native capture (x ≈ 0..0.56) instead of pinning it left', () => {
    const portrait = shiftX(makeSyntheticWalk({ cadence: 170 }), -0.22); // body around x ≈ 0.28
    const b = skeletonViewBox(portrait);
    expect(b.width).toBe(1);
    expect(b.height).toBe(1);
    expect(b.minY).toBe(0);
    expect(b.minX).toBeLessThan(0); // the box moved left to centre the body
    const centre = b.minX + b.width / 2;
    expect(Math.abs(centre - 0.28)).toBeLessThan(0.05);
  });

  it('widens (never crops) for a landscape web capture in frame-height units', () => {
    // A subject walking across a 16:9 frame: x spans ~0.2..1.6 frame heights.
    const across = makeSyntheticWalk({ gait: 'walk', cadence: 110, travel: true, durationSec: 4 });
    const b = skeletonViewBox(across);
    let lo = Infinity;
    let hi = -Infinity;
    for (const f of across) for (const p of f.landmarks) (lo = Math.min(lo, p.x)), (hi = Math.max(hi, p.x));
    expect(b.minX).toBeLessThanOrEqual(lo);
    expect(b.minX + b.width).toBeGreaterThanOrEqual(hi);
  });

  it('still renders an old frame-normalized web report and ignores dropped landmarks', () => {
    const old = makeSyntheticWalk({ cadence: 170 });
    old[0].landmarks[3] = { x: 0, y: 0, visibility: 0 }; // dropped landmark
    const b = skeletonViewBox(old);
    expect(b.width).toBe(1);
    expect(b.minX).toBeGreaterThan(-0.1);
    expect(skeletonViewBoxAttr(old)).toMatch(/^-?[\d.]+ 0 1 1$/);
  });

  it('falls back to the unit box with nothing to show', () => {
    expect(skeletonViewBox([])).toEqual({ minX: 0, minY: 0, width: 1, height: 1 });
  });
});
