import { PoseFrame, Landmark, LANDMARK, LANDMARK_COUNT } from '../types';

/**
 * Build a synthetic side-on walking capture for tests.
 *
 * Models the anterior-posterior (horizontal) separation of the two ankles as a
 * sinusoid: one full stride per period, so |Lx - Rx| has two peaks per stride
 * (one per step). This lets a test assert a known step count / cadence.
 */
export function makeWalkingFrames(opts: {
  durationSec: number;
  fps: number;
  /** target cadence in steps per minute (0 = standing still) */
  cadence: number;
  /** landmark visibility to stamp on every point, [0,1] */
  visibility?: number;
}): PoseFrame[] {
  const { durationSec, fps, cadence, visibility = 0.9 } = opts;
  const strideFreq = cadence / 60 / 2; // strides per second
  const n = Math.round(durationSec * fps);
  const frames: PoseFrame[] = [];

  for (let i = 0; i < n; i++) {
    const t = i / fps;
    const phase = Math.sin(2 * Math.PI * strideFreq * t);
    const landmarks: Landmark[] = Array.from({ length: LANDMARK_COUNT }, () => ({
      x: 0.5,
      y: 0.5,
      visibility,
    }));
    // Ankles swing fore/aft in antiphase; everything else held roughly static.
    landmarks[LANDMARK.LEFT_ANKLE] = { x: 0.5 + 0.06 * phase, y: 0.9, visibility };
    landmarks[LANDMARK.RIGHT_ANKLE] = { x: 0.5 - 0.06 * phase, y: 0.9, visibility };
    frames.push({ t: t * 1000, landmarks });
  }

  return frames;
}

/** Deterministic seeded gaussian-ish noise source (sum of 12 uniforms from an LCG). */
export function seededGauss(seed: number): () => number {
  let s = seed >>> 0;
  const rand = () => ((s = (1664525 * s + 1013904223) >>> 0), s / 2 ** 32);
  return () => {
    let t = 0;
    for (let k = 0; k < 12; k++) t += rand();
    return t - 6;
  };
}

/**
 * A STANDING-STILL subject with landmark jitter of the given std on every
 * landmark (hips and ankles at plausible heights). `smoothing` > 0 low-passes
 * the jitter (an exponential filter, like a pose model's temporal smoothing),
 * which makes it drift slowly instead of flickering.
 */
export function makeStandingJitterFrames(
  seed: number,
  std = 0.005,
  opts: { durationSec?: number; fps?: number; smoothing?: number } = {},
): PoseFrame[] {
  const { durationSec = 10, fps = 30, smoothing = 0 } = opts;
  const gauss = seededGauss(seed);
  const n = Math.round(durationSec * fps);
  const state = new Array<number>(LANDMARK_COUNT * 2).fill(0);
  const frames: PoseFrame[] = [];
  const base = (idx: number): [number, number] =>
    idx === LANDMARK.LEFT_ANKLE
      ? [0.48, 0.9]
      : idx === LANDMARK.RIGHT_ANKLE
        ? [0.52, 0.9]
        : idx === LANDMARK.LEFT_HIP || idx === LANDMARK.RIGHT_HIP
          ? [0.5, 0.52]
          : [0.5, 0.5];
  // Exponential smoothing shrinks the noise; rescale so the std stays `std`.
  const gain = smoothing > 0 ? Math.sqrt((1 + smoothing) / (1 - smoothing)) : 1;
  for (let i = 0; i < n; i++) {
    const landmarks: Landmark[] = [];
    for (let k = 0; k < LANDMARK_COUNT; k++) {
      for (let a = 0; a < 2; a++) {
        const g = gauss() * std;
        state[2 * k + a] = smoothing > 0 ? smoothing * state[2 * k + a] + (1 - smoothing) * g : g;
      }
      const [bx, by] = base(k);
      landmarks.push({ x: bx + gain * state[2 * k], y: by + gain * state[2 * k + 1], visibility: 0.95 });
    }
    frames.push({ t: (i / fps) * 1000, landmarks });
  }
  return frames;
}

/** Add deterministic gaussian jitter (std, normalized units) to every landmark of a capture. */
export function addJitter(frames: PoseFrame[], std: number, seed = 7): PoseFrame[] {
  const gauss = seededGauss(seed);
  return frames.map((f) => ({
    t: f.t,
    landmarks: f.landmarks.map((p) => ({ ...p, x: p.x + gauss() * std, y: p.y + gauss() * std })),
  }));
}

/** Irregular frame timing (± `ms` per frame), like native's throttled delivery. */
export function jitterTiming(frames: PoseFrame[], ms: number, seed = 11): PoseFrame[] {
  const gauss = seededGauss(seed);
  return frames.map((f, i) => ({
    ...f,
    t: i === 0 ? f.t : f.t + Math.max(-0.45, Math.min(0.45, gauss() / 3)) * 2 * ms,
  }));
}

/**
 * What the web pose model emits for an isotropic capture: x normalized by the
 * frame WIDTH (x / aspect for a landscape frame of aspect width/height).
 */
export function toFrameNormalized(frames: PoseFrame[], aspect: number): PoseFrame[] {
  return frames.map((f) => ({ t: f.t, landmarks: f.landmarks.map((p) => ({ ...p, x: p.x / aspect })) }));
}

/** Two captures back to back (e.g. the outbound and return legs of a walk), with a gap in between. */
export function concatCaptures(a: PoseFrame[], b: PoseFrame[], gapMs = 600): PoseFrame[] {
  const offset = a[a.length - 1].t + gapMs - b[0].t;
  return [...a, ...b.map((f) => ({ ...f, t: f.t + offset }))];
}
