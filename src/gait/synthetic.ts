import { PoseFrame, Landmark, LANDMARK, LANDMARK_COUNT } from './types';

/**
 * A plausible synthetic side-on walk. Used by the simulated scan (so review /
 * graph / replay work without a camera) and by tests. Produces antiphase ankle
 * swing (cadence), hip bounce (vertical oscillation), knee flexion, and feet
 * landing ahead of the hips (overstride) so the form metrics are non-trivial.
 */
export function makeSyntheticWalk(
  opts: { durationSec?: number; fps?: number; cadence?: number; visibility?: number } = {},
): PoseFrame[] {
  const durationSec = opts.durationSec ?? 8;
  const fps = opts.fps ?? 30;
  const cadence = opts.cadence ?? 168;
  const vis = opts.visibility ?? 0.95;
  const strideFreq = cadence / 60 / 2;
  const n = Math.round(durationSec * fps);
  const midX = 0.5;
  const frames: PoseFrame[] = [];

  const put = (arr: Landmark[], idx: number, x: number, y: number) => {
    arr[idx] = { x, y, visibility: vis };
  };

  for (let i = 0; i < n; i++) {
    const t = i / fps;
    const p = 2 * Math.PI * strideFreq * t;
    const s = Math.sin(p);
    const bounce = 0.02 * Math.sin(2 * p);

    const lm: Landmark[] = Array.from({ length: LANDMARK_COUNT }, () => ({ x: midX, y: 0.5, visibility: vis }));

    const hipY = 0.52 + bounce;
    const shY = 0.3 + bounce * 0.6;
    put(lm, 0, midX, shY - 0.08); // nose
    put(lm, 11, midX - 0.06, shY); // L shoulder
    put(lm, 12, midX + 0.06, shY); // R shoulder
    put(lm, 13, midX - 0.07 - 0.05 * s, shY + 0.12); // L elbow
    put(lm, 15, midX - 0.07 - 0.09 * s, shY + 0.22); // L wrist
    put(lm, 14, midX + 0.07 + 0.05 * s, shY + 0.12); // R elbow
    put(lm, 16, midX + 0.07 + 0.09 * s, shY + 0.22); // R wrist
    put(lm, LANDMARK.LEFT_HIP, midX - 0.04, hipY);
    put(lm, LANDMARK.RIGHT_HIP, midX + 0.04, hipY);

    const legL = s;
    const legR = -s;
    const bendL = 0.025 * Math.max(0, -legL);
    const bendR = 0.025 * Math.max(0, -legR);
    put(lm, LANDMARK.LEFT_KNEE, midX - 0.04 + 0.05 * legL, 0.7 - bendL);
    put(lm, LANDMARK.RIGHT_KNEE, midX + 0.04 + 0.05 * legR, 0.7 - bendR);
    put(lm, LANDMARK.LEFT_ANKLE, midX - 0.04 + 0.1 * legL, 0.9);
    put(lm, LANDMARK.RIGHT_ANKLE, midX + 0.04 + 0.1 * legR, 0.9);
    put(lm, LANDMARK.LEFT_HEEL, midX - 0.055 + 0.1 * legL, 0.92);
    put(lm, LANDMARK.RIGHT_HEEL, midX + 0.025 + 0.1 * legR, 0.92);
    put(lm, LANDMARK.LEFT_FOOT_INDEX, midX - 0.01 + 0.11 * legL, 0.93);
    put(lm, LANDMARK.RIGHT_FOOT_INDEX, midX + 0.07 + 0.11 * legR, 0.93);

    frames.push({ t: t * 1000, landmarks: lm });
  }
  return frames;
}
