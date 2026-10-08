import { describe, it, expect } from 'vitest';
import { analyzeGait, computeCadence, gaitSignal, MIN_SWING_AMPLITUDE } from '../ruleEngine';
import { analyzeSteps, describeGait } from '../stepAnalysis';
import { analyzeGaitDetailed } from '../detailed';
import { computeFormMetrics } from '../form';
import { analyzeFrontal } from '../frontal';
import { detectSteps } from '../steps';
import { travelDirection } from '../direction';
import { toPoseFrame } from '../poseMapper';
import { makeSyntheticWalk, makeSyntheticRearWalk, syntheticStancePct } from '../synthetic';
import { METRIC_INFO } from '../metricInfo';
import { PoseFrame, LANDMARK } from '../types';
import {
  makeWalkingFrames,
  makeStandingJitterFrames,
  addJitter,
  jitterTiming,
  toFrameNormalized,
  concatCaptures,
} from './synthetic';

const SEEDS = [1, 7, 42, 1234, 99991];
const within = (v: number, target: number, tol: number) => Math.abs(v / target - 1) <= tol;

/** Mirror a capture horizontally (a front camera / a walk filmed from the other side). */
const mirror = (frames: PoseFrame[], about = 1): PoseFrame[] =>
  frames.map((f) => ({ t: f.t, landmarks: f.landmarks.map((p) => ({ ...p, x: about - p.x })) }));

/** Re-derive what web capture now stores: frame-normalized landmarks through toPoseFrame + aspect. */
const viaWebCapture = (frames: PoseFrame[], aspect: number): PoseFrame[] =>
  toFrameNormalized(frames, aspect).map((f) => toPoseFrame(f.landmarks, f.t, { aspect }));

describe('1. jitter gate — no real stepping never yields a cadence', () => {
  it('a standing subject with heavy landmark jitter gets no steps and low confidence (any seed, smoothing, fps)', () => {
    for (const std of [0.015, 0.02, 0.03]) {
      for (const smoothing of [0, 0.8, 0.95]) {
        for (const fps of [15, 30]) {
          for (const seed of SEEDS) {
            const frames = makeStandingJitterFrames(seed, std, { fps, smoothing });
            const r = analyzeGait(frames);
            expect(r.cadence.value).toBe(0);
            expect(r.cadence.confidence).toBe('low');
            expect(r.captureQuality.ok).toBe(false);
            expect(r.captureQuality.issues.join(' ').toLowerCase()).toMatch(/leg movement|stepping rhythm/);
            expect(analyzeSteps(frames).stepCount).toBe(0);
            expect(gaitSignal(frames).stepIndices).toEqual([]);
          }
        }
      }
    }
  });

  it('heavy jitter that clears the old amplitude floor is what used to fabricate a confident cadence', () => {
    // Guard the premise: this jitter swings past MIN_SWING_AMPLITUDE, so only
    // the new body-relative swing + rhythm checks stop it.
    const frames = makeStandingJitterFrames(42, 0.02);
    const det = detectSteps(frames);
    expect(det.swingAmplitude).toBeGreaterThan(MIN_SWING_AMPLITUDE);
    expect(det.indices).toEqual([]);
  });

  it('does not reject real walks with noisy landmarks, irregular timing, or turns', () => {
    for (const gait of ['walk', 'run'] as const) {
      for (const fps of [15, 30]) {
        const cadence = gait === 'walk' ? 105 : 170;
        const noisy = jitterTiming(addJitter(makeSyntheticWalk({ gait, fps, cadence, durationSec: 10 }), 0.02), 15);
        const r = analyzeGait(noisy);
        expect(r.captureQuality.ok).toBe(true);
        expect(r.cadence.confidence).toBe('high');
        expect(within(r.cadence.value, cadence, 0.03)).toBe(true);

        // Three crossings of the frame with turns in between.
        let f = makeSyntheticWalk({ gait, fps, cadence, durationSec: 3.3, travel: true });
        f = concatCaptures(f, makeSyntheticWalk({ gait, fps, cadence, durationSec: 3.3, travel: true, direction: -1 }), 900);
        f = concatCaptures(f, makeSyntheticWalk({ gait, fps, cadence, durationSec: 3.3, travel: true }), 900);
        const turns = analyzeGait(addJitter(f, 0.01));
        expect(turns.captureQuality.ok).toBe(true);
        expect(turns.cadence.confidence).not.toBe('low');
        expect(within(turns.cadence.value, cadence, 0.04)).toBe(true);
      }
    }
  });
});

describe('2. asymmetric gaits keep their full cadence and a consistent walkthrough', () => {
  it('extreme step asymmetry no longer halves cadence', () => {
    for (const asymmetry of [0.5, 0.7, 0.9]) {
      for (const gait of ['walk', 'run'] as const) {
        for (const fps of [15, 30]) {
          const cadence = gait === 'walk' ? 110 : 170;
          const frames = makeSyntheticWalk({ gait, fps, cadence, asymmetry });
          const r = analyzeGait(frames);
          expect(within(r.cadence.value, cadence, 0.03)).toBe(true);
          expect(r.cadence.confidence).toBe('high');
        }
      }
    }
  });

  it('the walkthrough step time agrees with the headline cadence it quotes', () => {
    for (const asymmetry of [0, 0.7, 0.9]) {
      const d = analyzeGaitDetailed(makeSyntheticWalk({ gait: 'walk', cadence: 110, asymmetry }));
      const closing = d.walkthrough[d.walkthrough.length - 1];
      const m = closing.match(/every ([\d.]+)s \(~(\d+) per minute\)/);
      expect(m).toBeTruthy();
      const stepSec = Number(m![1]);
      const perMin = Number(m![2]);
      expect(perMin).toBe(Math.round(d.cadence.value));
      expect(within(60 / stepSec, perMin, 0.02)).toBe(true);
    }
  });

  it('an uneven left/right step timing shows up as lower symmetry, not lower cadence', () => {
    expect(analyzeSteps(makeSyntheticWalk({ gait: 'walk', cadence: 110 })).symmetryPct).toBeGreaterThanOrEqual(95);
    expect(analyzeSteps(makeSyntheticWalk({ gait: 'walk', cadence: 110, asymmetry: 0.7 })).symmetryPct).toBeLessThan(75);
  });
});

describe('3. stance share — honest about what the 2D method measures', () => {
  it('reads close to the true ~60% for walking kinematics (the old ~50% was a sine-wave artifact)', () => {
    for (const cadence of [95, 110, 125]) {
      for (const fps of [15, 30]) {
        const a = analyzeSteps(makeSyntheticWalk({ gait: 'walk', cadence, fps }));
        expect(Math.abs(a.stanceRatioPct - syntheticStancePct('walk'))).toBeLessThanOrEqual(6);
      }
    }
  });

  it('the copy explains walking vs running and that running reads high', () => {
    const t = METRIC_INFO.stance.typical.toLowerCase();
    expect(t).toMatch(/walking/);
    expect(t).toMatch(/running|runs/);
    expect(t).toMatch(/higher/);
    expect(METRIC_INFO.stance.plain.toLowerCase()).toMatch(/stride/);
    const line = describeGait(analyzeSteps(makeSyntheticWalk({ gait: 'walk', cadence: 110 })), 4).walkthrough[2];
    expect(line).toMatch(/% of its stride on the ground \(a rough 2D estimate\)/);
  });
});

describe('4. direction of travel — leftward / mirrored walks read the same', () => {
  it('stance, knee-at-contact, reach and lead foot match a rightward walk', () => {
    for (const gait of ['walk', 'run'] as const) {
      for (const fps of [15, 30]) {
        const cadence = gait === 'walk' ? 110 : 170;
        const right = analyzeSteps(makeSyntheticWalk({ gait, fps, cadence, direction: 1 }));
        const left = analyzeSteps(makeSyntheticWalk({ gait, fps, cadence, direction: -1 }));
        const mirrored = analyzeSteps(mirror(makeSyntheticWalk({ gait, fps, cadence, direction: 1 })));
        for (const other of [left, mirrored]) {
          expect(other.stanceRatioPct).toBe(right.stanceRatioPct);
          expect(other.kneeContactDeg).toBe(right.kneeContactDeg);
          expect(other.overstrideScore).toBe(right.overstrideScore);
          expect(other.leadFoot).toBe(right.leadFoot);
        }
        // Knee at contact is the near-straight landing knee, not the toe-off bend.
        expect(180 - right.kneeContactDeg).toBeLessThan(gait === 'walk' ? 10 : 25);
      }
    }
  });

  it('handles a back-and-forth walk (direction flips mid-capture)', () => {
    const out = makeSyntheticWalk({ gait: 'walk', cadence: 110, durationSec: 4, travel: true, direction: 1 });
    const back = makeSyntheticWalk({ gait: 'walk', cadence: 110, durationSec: 4, travel: true, direction: -1 });
    const both = analyzeSteps(concatCaptures(out, back, 900));
    const oneWay = analyzeSteps(makeSyntheticWalk({ gait: 'walk', cadence: 110, durationSec: 8 }));
    expect(Math.abs(both.kneeContactDeg - oneWay.kneeContactDeg)).toBeLessThanOrEqual(3);
    expect(Math.abs(both.stanceRatioPct - oneWay.stanceRatioPct)).toBeLessThanOrEqual(5);
  });

  it('detects direction from body cues on a treadmill, and from hip travel when cues are missing', () => {
    expect(new Set(travelDirection(makeSyntheticWalk({ direction: -1 })))).toEqual(new Set([-1]));
    expect(new Set(travelDirection(makeSyntheticWalk({ direction: 1 })))).toEqual(new Set([1]));
    const cueless = makeSyntheticWalk({ gait: 'walk', cadence: 110, direction: -1, travel: true }).map((f) => ({
      t: f.t,
      landmarks: f.landmarks.map((p, i) =>
        [0, 7, 8, LANDMARK.LEFT_HEEL, LANDMARK.RIGHT_HEEL, LANDMARK.LEFT_FOOT_INDEX, LANDMARK.RIGHT_FOOT_INDEX].includes(i)
          ? { ...p, visibility: 0 }
          : p,
      ),
    }));
    expect(new Set(travelDirection(cueless))).toEqual(new Set([-1]));
  });
});

describe('5. one cadence source of truth', () => {
  it('report cadence, step-analysis cadence and step time agree exactly across 54+ configs, within 2% of truth', () => {
    let configs = 0;
    for (const gait of ['walk', 'run'] as const) {
      for (const cadence of gait === 'walk' ? [90, 110, 130] : [150, 170, 190]) {
        for (const fps of [15, 30, 60]) {
          for (const direction of [1, -1] as const) {
            for (const asymmetry of [0, 0.6]) {
              const frames = makeSyntheticWalk({ gait, cadence, fps, direction, asymmetry });
              const c = computeCadence(frames).cadence.value;
              const a = analyzeSteps(frames);
              expect(a.cadenceSpm).toBe(c);
              expect(Math.abs(60 / a.meanStepTimeSec - c)).toBeLessThan(1e-9);
              expect(within(c, cadence, 0.02)).toBe(true);
              configs++;
            }
          }
        }
      }
    }
    for (const cadence of [60, 100, 140, 180, 220]) {
      const frames = makeWalkingFrames({ durationSec: 10, fps: 30, cadence });
      expect(analyzeSteps(frames).cadenceSpm).toBe(computeCadence(frames).cadence.value);
      expect(within(computeCadence(frames).cadence.value, cadence, 0.02)).toBe(true);
      configs++;
    }
    expect(configs).toBeGreaterThanOrEqual(54);
  });

  it('the gait graph marks exactly the steps the cadence counted', () => {
    const frames = makeSyntheticWalk({ cadence: 170 });
    expect(gaitSignal(frames).stepIndices.length).toBe(computeCadence(frames).stepCount);
  });
});

describe('6. demo (simulated scan) numbers are physiologically plausible', () => {
  it('the demo capture (150–190 spm, running kinematics) has believable knee and bounce numbers', () => {
    for (const cadence of [150, 170, 190]) {
      const d = analyzeGaitDetailed(makeSyntheticWalk({ durationSec: 8, fps: 30, cadence }));
      expect(d.steps.kneePeakDeg).toBeGreaterThanOrEqual(85);
      expect(d.steps.kneePeakDeg).toBeLessThanOrEqual(115);
      const contactBend = 180 - d.steps.kneeContactDeg;
      expect(contactBend).toBeGreaterThanOrEqual(10);
      expect(contactBend).toBeLessThanOrEqual(25);
      expect(d.metrics.kneeFlexionRangeDeg).toBeGreaterThanOrEqual(70);
      expect(d.metrics.kneeFlexionRangeDeg).toBeLessThanOrEqual(100);
      expect(d.metrics.verticalOscillationPct).toBeGreaterThan(2);
      expect(d.metrics.verticalOscillationPct).toBeLessThan(12);
      expect(d.metrics.overstrideScore).toBeLessThan(65); // a typical runner isn't flagged
      expect(d.cadence.confidence).toBe('high');
    }
  });

  it('walking kinematics bend the knee ~60° in swing and land nearly straight', () => {
    const a = analyzeSteps(makeSyntheticWalk({ gait: 'walk', cadence: 110 }));
    expect(a.kneePeakDeg).toBeGreaterThanOrEqual(55);
    expect(a.kneePeakDeg).toBeLessThanOrEqual(70);
    expect(180 - a.kneeContactDeg).toBeLessThanOrEqual(10);
  });
});

describe('7. web (aspect-corrected) and native analysis agree', () => {
  it('a 16:9 web capture yields the same metrics as the isotropic native capture', () => {
    for (const gait of ['walk', 'run'] as const) {
      const native = makeSyntheticWalk({ gait, cadence: gait === 'walk' ? 110 : 170 });
      const web = viaWebCapture(native, 16 / 9);
      expect(computeFormMetrics(web)).toEqual(computeFormMetrics(native));
      const a = analyzeSteps(native);
      const b = analyzeSteps(web);
      expect(b.overstrideScore).toBe(a.overstrideScore);
      expect(b.kneePeakDeg).toBe(a.kneePeakDeg);
      expect(b.kneeContactDeg).toBe(a.kneeContactDeg);
      expect(b.stanceRatioPct).toBe(a.stanceRatioPct);
      expect(Math.abs(b.cadenceSpm - a.cadenceSpm)).toBeLessThan(1e-6);
    }
    const rear = makeSyntheticRearWalk();
    const rearWeb = viaWebCapture(rear, 16 / 9);
    const fa = analyzeFrontal(rear);
    const fb = analyzeFrontal(rearWeb);
    expect(Math.abs(fb.hipDropPct - fa.hipDropPct)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(fb.lateralSwayPct - fa.lateralSwayPct)).toBeLessThanOrEqual(0.1);
    expect(fb.stepWidthPct).toBe(fa.stepWidthPct);
  });

  it('without the correction the web units drift (why it is needed)', () => {
    const native = makeSyntheticWalk({ gait: 'run', cadence: 170 });
    const uncorrected = toFrameNormalized(native, 16 / 9);
    const a = analyzeSteps(native);
    const b = analyzeSteps(uncorrected);
    expect(Math.abs(b.overstrideScore - a.overstrideScore)).toBeGreaterThan(15);
    expect(Math.abs(b.kneePeakDeg - a.kneePeakDeg)).toBeGreaterThan(10);
  });

  it('MIN_SWING_AMPLITUDE keeps a wide margin for a small (far) subject on both platforms', () => {
    // Legs spanning only ~25% of the frame height (the generator's are ~38%).
    const scale = 0.25 / 0.38;
    const small = makeSyntheticWalk({ gait: 'walk', cadence: 100 }).map((f) => ({
      t: f.t,
      landmarks: f.landmarks.map((p) => ({ ...p, x: 0.5 + (p.x - 0.5) * scale, y: 0.5 + (p.y - 0.5) * scale })),
    }));
    for (const frames of [small, viaWebCapture(small, 16 / 9)]) {
      const det = detectSteps(frames);
      expect(det.swingAmplitude).toBeGreaterThan(2 * MIN_SWING_AMPLITUDE);
      expect(within(det.cadenceSpm, 100, 0.02)).toBe(true);
    }
  });
});
