import { describe, it, expect } from 'vitest';
import { bodyMetrics, buildFigure } from '../bodyModel';
import { prepareReplay } from '../motion';
import { makeSyntheticRearWalk, makeSyntheticWalk } from '../../gait/synthetic';
import { PoseFrame } from '../../gait/types';

const scale = (frames: PoseFrame[], k: number, flip = false): PoseFrame[] =>
  frames.map((f) => ({
    t: f.t,
    landmarks: f.landmarks.map((p) => ({ ...p, x: (flip ? 1 - p.x : p.x) * k, y: p.y * k })),
  }));

/** Every number in a path string. */
const nums = (d: string) => (d.match(/-?\d+(\.\d+)?(e-?\d+)?/g) ?? []).map(Number);
const xSpan = (d: string) => {
  const v = nums(d).filter((_, i) => i % 2 === 0);
  return Math.max(...v) - Math.min(...v);
};

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

describe('buildFigure', () => {
  const run = prepareReplay(makeSyntheticWalk({ cadence: 172, durationSec: 2 }));
  const m = bodyMetrics(run);

  it('produces finite geometry for every frame', () => {
    for (const f of run) {
      const fig = buildFigure(f.landmarks, m);
      const paths = [
        ...fig.flesh.back.map((l) => l.d),
        ...fig.flesh.front.map((l) => l.d),
        fig.flesh.torso,
        fig.flesh.neck,
        ...fig.bones.long.map((l) => l.d),
        ...fig.bones.thin.map((l) => l.d),
        ...fig.bones.ribs,
        ...fig.bones.pelvis,
        fig.bones.spine,
        ...fig.bones.vertebrae.map((v) => v.d),
        ...fig.bones.feet.map((l) => l.d),
        ...fig.bones.toes.map((l) => l.d),
        fig.bones.skull?.cranium,
        fig.bones.skull?.mandible,
        ...(fig.bones.skull?.teeth ?? []),
        ...(fig.bones.skull?.holes ?? []),
      ].filter((d): d is string => !!d);
      expect(paths.length).toBeGreaterThan(20);
      for (const d of paths) expect(nums(d).every(Number.isFinite)).toBe(true);
      // 7 cervical + 12 thoracic + 5 lumbar
      expect(fig.bones.vertebrae.length).toBe(24);
      // a real foot skeleton on each foot: 11 tarsals/metatarsals, 14 phalanges
      expect(fig.bones.feet.length).toBe(22);
      expect(fig.bones.toes.length).toBe(28);
      expect(fig.flesh.head).not.toBeNull();
      expect(fig.bones.skull?.teeth.length).toBeGreaterThan(8);
    }
  });

  it('draws the far-side limbs behind in a side view', () => {
    const fig = buildFigure(run[0].landmarks, m);
    expect(fig.flesh.back.length).toBeGreaterThan(0);
    expect(fig.flesh.back.every((l) => l.far)).toBe(true);
    expect(fig.frontness).toBeLessThan(0.2);
  });

  it('scales limb thickness with the person', () => {
    const big = buildFigure(run[5].landmarks, m);
    const small = scale([run[5]], 0.5)[0];
    const smallFig = buildFigure(small.landmarks, bodyMetrics(scale(run, 0.5)));
    expect(xSpan(smallFig.flesh.torso!) / xSpan(big.flesh.torso!)).toBeCloseTo(0.5, 1);
  });

  it('turns the torso square-on in a rear view, using the measured hip breadth', () => {
    const rear = prepareReplay(makeSyntheticRearWalk());
    const rm = bodyMetrics(rear);
    const fig = buildFigure(rear[10].landmarks, rm);
    expect(fig.frontness).toBeGreaterThan(0.8);
    const L = rear[10].landmarks;
    const hipSpread = Math.abs(L[23].x - L[24].x);
    expect(xSpan(fig.flesh.torso!)).toBeGreaterThan(hipSpread);
    expect(fig.bones.ribs.length).toBe(20); // both sides visible
  });

  it('keeps a head on the shoulders when the head landmarks are junk or missing', () => {
    const f = run[8];
    const sh = { x: (f.landmarks[11].x + f.landmarks[12].x) / 2, y: (f.landmarks[11].y + f.landmarks[12].y) / 2 };
    // Ears/eyes/nose dumped at the belly (as some trackers do), then dropped entirely.
    const junk = f.landmarks.map((p, k) => (k <= 10 ? { ...p, x: sh.x, y: 0.55 } : p));
    const gone = f.landmarks.map((p, k) => (k <= 10 ? { ...p, visibility: 0 } : p));
    for (const L of [junk, gone]) {
      const fig = buildFigure(L, m);
      expect(fig.flesh.head).not.toBeNull();
      expect(fig.flesh.head!.cy).toBeLessThan(sh.y - 0.05 * m.stature);
      expect(fig.bones.skull).not.toBeNull();
    }
  });

  it('draws a face in profile: one eye, nose, mouth and hair', () => {
    const fig = buildFigure(run[3].landmarks, m);
    expect(fig.human.eyes).toHaveLength(1);
    expect(fig.human.nose).toBeTruthy();
    expect(fig.human.mouth).toBeTruthy();
    expect(fig.human.hair).toBeTruthy();
  });
});
