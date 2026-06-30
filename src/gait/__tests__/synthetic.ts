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
