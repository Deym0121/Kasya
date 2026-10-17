import { describe, it, expect } from 'vitest';
import { footBones, footFrame, footPoint, shoe } from '../footSkeleton';

const nums = (d: string) => (d.match(/-?\d+(\.\d+)?(e-?\d+)?/g) ?? []).map(Number);

describe('footSkeleton', () => {
  const H = 0.8; // stature in frame units
  const heel = { x: 0.5, y: 0.9 };
  const toe = { x: 0.62, y: 0.9 };
  const ankle = { x: 0.52, y: 0.86 };

  it('builds a full foot: 6 tarsals, 5 metatarsals, 14 phalanges', () => {
    const f = footFrame(heel, toe, ankle, H, 1)!;
    const { bones, toes } = footBones(f);
    expect(bones).toHaveLength(11);
    expect(toes).toHaveLength(14);
    for (const d of [...bones, ...toes]) {
      expect(d.startsWith('M')).toBe(true);
      expect(nums(d).every(Number.isFinite)).toBe(true);
    }
  });

  it('pitches with the foot: bones stay between heel and toe, above the sole', () => {
    // Toe-off: heel lifted, foot pitched ~35° nose-down.
    const lifted = { x: 0.5, y: 0.84 };
    const tip = { x: 0.6, y: 0.9 };
    const f = footFrame(lifted, tip, { x: 0.49, y: 0.8 }, H, 1)!;
    const all = footBones(f).bones.concat(footBones(f).toes).flatMap(nums);
    const xs = all.filter((_, i) => i % 2 === 0);
    expect(Math.min(...xs)).toBeGreaterThan(0.47);
    expect(Math.max(...xs)).toBeLessThan(0.64);
    // "up" points toward the ankle, so the arch sits above the heel→toe line.
    const arch = footPoint(f, 0.4, 0.25);
    const onLine = footPoint(f, 0.4, 0);
    expect(arch.y).toBeLessThan(onLine.y);
  });

  it('flips with facing and handles a foreshortened foot', () => {
    const left = footFrame({ x: 0.6, y: 0.9 }, { x: 0.48, y: 0.9 }, { x: 0.58, y: 0.86 }, H, -1)!;
    expect(footPoint(left, 1, 0).x).toBeLessThan(footPoint(left, 0, 0).x);
    const head_on = footFrame(heel, { x: heel.x + 0.0005, y: heel.y }, ankle, H, -1)!;
    expect(Math.abs(head_on.along.x)).toBeGreaterThan(0.002);
    expect(footBones(head_on).bones.every((d) => nums(d).every(Number.isFinite))).toBe(true);
    expect(footFrame(null, toe, ankle, H, 1)).toBeNull();
  });

  it('wraps a shoe around the foot', () => {
    const f = footFrame(heel, toe, ankle, H, 1)!;
    const s = shoe(f);
    expect(s.laces).toHaveLength(4);
    expect(nums(s.upper).every(Number.isFinite)).toBe(true);
    const soleYs = nums(s.sole).filter((_, i) => i % 2 === 1);
    expect(Math.max(...soleYs)).toBeGreaterThan(heel.y); // sole reaches below the heel landmark
  });
});

describe('footFrame square-on', () => {
  it('keeps a foot seen from behind level and short instead of twisting it', () => {
    // Rear view: the toe projects just below the heel (pure depth).
    const f = footFrame({ x: 0.5, y: 0.92 }, { x: 0.501, y: 0.94 }, { x: 0.5, y: 0.9 }, 0.8, 1, 0.9)!;
    expect(f.along.y).toBe(0);
    expect(Math.abs(f.along.x)).toBeGreaterThanOrEqual(0.22 * 0.12 - 1e-9);
    expect(f.up.y).toBeLessThan(-0.99); // still standing upright toward the ankle
  });
});
