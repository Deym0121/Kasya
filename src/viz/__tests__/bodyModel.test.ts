import { describe, it, expect } from 'vitest';
import { bodyMetrics } from '../bodyModel';
import { makeSyntheticWalk } from '../../gait/synthetic';
import { PoseFrame } from '../../gait/types';

const scale = (frames: PoseFrame[], k: number, flip = false): PoseFrame[] =>
  frames.map((f) => ({
    t: f.t,
    landmarks: f.landmarks.map((p) => ({ ...p, x: (flip ? 1 - p.x : p.x) * k, y: p.y * k })),
  }));

describe('bodyMetrics', () => {
  const walk = makeSyntheticWalk({ cadence: 120, gait: 'walk', durationSec: 3 });

  it('sizes the body from the subject, not a fixed constant', () => {
    const near = bodyMetrics(walk).stature;
    const far = bodyMetrics(scale(walk, 0.5)).stature;
    expect(near).toBeGreaterThan(0.7);
    expect(near).toBeLessThan(0.95);
    expect(far / near).toBeCloseTo(0.5, 2);
  });

  it('reads the facing direction and the near side', () => {
    expect(bodyMetrics(walk).facing).toBe(1);
    expect(bodyMetrics(makeSyntheticWalk({ cadence: 120, gait: 'walk', durationSec: 3, direction: -1 })).facing).toBe(-1);
    expect(bodyMetrics(walk).near).toBe('left'); // synthetic left side has the smaller z
  });
});
