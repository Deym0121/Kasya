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

  const put = (arr: Landmark[], idx: number, x: number, y: number, z = 0) => {
    arr[idx] = { x, y, z, visibility: vis };
  };

  for (let i = 0; i < n; i++) {
    const t = i / fps;
    const p = 2 * Math.PI * strideFreq * t;
    const s = Math.sin(p);
    const bounce = 0.02 * Math.sin(2 * p);
    // Depth so the rotatable 3D view isn't flat: left-body toward camera, right
    // away, with the swinging limbs separating a touch more in depth.
    const zA = 0.05 * s;
    const zL = 0.06 * s;

    const lm: Landmark[] = Array.from({ length: LANDMARK_COUNT }, () => ({ x: midX, y: 0.5, visibility: vis }));

    const hipY = 0.52 + bounce;
    const shY = 0.3 + bounce * 0.6;
    put(lm, 0, midX, shY - 0.08); // nose
    put(lm, 11, midX - 0.06, shY, 0.03); // L shoulder
    put(lm, 12, midX + 0.06, shY, -0.03); // R shoulder
    put(lm, 13, midX - 0.07 - 0.05 * s, shY + 0.12, zA); // L elbow
    put(lm, 15, midX - 0.07 - 0.09 * s, shY + 0.22, zA); // L wrist
    put(lm, 14, midX + 0.07 + 0.05 * s, shY + 0.12, -zA); // R elbow
    put(lm, 16, midX + 0.07 + 0.09 * s, shY + 0.22, -zA); // R wrist
    put(lm, LANDMARK.LEFT_HIP, midX - 0.04, hipY, 0.03);
    put(lm, LANDMARK.RIGHT_HIP, midX + 0.04, hipY, -0.03);

    const legL = s;
    const legR = -s;
    const bendL = 0.025 * Math.max(0, -legL);
    const bendR = 0.025 * Math.max(0, -legR);
    put(lm, LANDMARK.LEFT_KNEE, midX - 0.04 + 0.05 * legL, 0.7 - bendL, zL);
    put(lm, LANDMARK.RIGHT_KNEE, midX + 0.04 + 0.05 * legR, 0.7 - bendR, -zL);
    put(lm, LANDMARK.LEFT_ANKLE, midX - 0.04 + 0.1 * legL, 0.9, zL);
    put(lm, LANDMARK.RIGHT_ANKLE, midX + 0.04 + 0.1 * legR, 0.9, -zL);
    put(lm, LANDMARK.LEFT_HEEL, midX - 0.055 + 0.1 * legL, 0.92, zL);
    put(lm, LANDMARK.RIGHT_HEEL, midX + 0.025 + 0.1 * legR, 0.92, -zL);
    put(lm, LANDMARK.LEFT_FOOT_INDEX, midX - 0.01 + 0.11 * legL, 0.93, zL);
    put(lm, LANDMARK.RIGHT_FOOT_INDEX, midX + 0.07 + 0.11 * legR, 0.93, -zL);

    frames.push({ t: t * 1000, landmarks: lm });
  }
  return frames;
}

/**
 * A plausible synthetic REAR-view (frontal-plane) walk — the subject seen from
 * behind, walking away. Here `x` reads left↔right of the body and `y` is
 * vertical, so this drives the frontal-plane estimates the rear pass adds:
 * pelvic drop (hips tilt opposite each step), base of support (lateral ankle
 * separation), side-to-side sway, a small vertical foot lift in swing, and
 * left/right symmetry. Cadence still comes from the side pass — not this one.
 *
 * `asym` (0..1) skews left vs right so tests can exercise a lopsided walk.
 */
export function makeSyntheticRearWalk(
  opts: {
    durationSec?: number;
    fps?: number;
    cadence?: number;
    visibility?: number;
    /** pelvic obliquity amplitude (normalized) — bigger = more hip drop */
    hipDrop?: number;
    /** left/right imbalance, 0 = symmetric, 1 = strongly lopsided */
    asym?: number;
  } = {},
): PoseFrame[] {
  const durationSec = opts.durationSec ?? 8;
  const fps = opts.fps ?? 30;
  const cadence = opts.cadence ?? 160;
  const vis = opts.visibility ?? 0.95;
  const hipDrop = opts.hipDrop ?? 0.012;
  const asym = Math.max(0, Math.min(1, opts.asym ?? 0));
  const strideFreq = cadence / 60 / 2;
  const n = Math.round(durationSec * fps);
  const midX = 0.5;
  const hipHalf = 0.05; // hip half-width
  const footHalf = 0.035; // base of support half-width (a little inside the hips)
  const kneeHalf = 0.045;
  const frames: PoseFrame[] = [];

  const put = (arr: Landmark[], idx: number, x: number, y: number) => {
    arr[idx] = { x, y, visibility: vis };
  };

  for (let i = 0; i < n; i++) {
    const t = i / fps;
    const p = 2 * Math.PI * strideFreq * t;
    const s = Math.sin(p);
    const bounce = 0.015 * Math.sin(2 * p);
    const sway = 0.02 * s; // pelvis drifts side to side once per stride
    // Pelvic obliquity flips each step (twice per stride); the swing-side hip drops.
    const oblique = hipDrop * Math.sin(2 * p);

    const lm: Landmark[] = Array.from({ length: LANDMARK_COUNT }, () => ({ x: midX, y: 0.5, visibility: vis }));

    const hipY = 0.52 + bounce;
    put(lm, 0, midX + sway, 0.22 + bounce * 0.6); // nose
    put(lm, 11, midX - 0.09 + sway, 0.3 + bounce * 0.6); // L shoulder
    put(lm, 12, midX + 0.09 + sway, 0.3 + bounce * 0.6); // R shoulder
    put(lm, LANDMARK.LEFT_HIP, midX - hipHalf + sway, hipY + oblique);
    put(lm, LANDMARK.RIGHT_HIP, midX + hipHalf + sway, hipY - oblique);

    // Feet lift a touch in swing; left swings when s>0, right when s<0.
    const liftL = 0.02 * Math.max(0, s);
    const liftR = 0.02 * Math.max(0, -s) * (1 - asym); // asym shrinks the right lift
    put(lm, LANDMARK.LEFT_KNEE, midX - kneeHalf + sway, 0.72 + bounce);
    put(lm, LANDMARK.RIGHT_KNEE, midX + kneeHalf + sway, 0.72 + bounce);
    put(lm, LANDMARK.LEFT_ANKLE, midX - footHalf + sway, 0.9 - liftL);
    put(lm, LANDMARK.RIGHT_ANKLE, midX + footHalf + sway, 0.9 - liftR);
    put(lm, LANDMARK.LEFT_HEEL, midX - footHalf - 0.005 + sway, 0.92 - liftL);
    put(lm, LANDMARK.RIGHT_HEEL, midX + footHalf + 0.005 + sway, 0.92 - liftR);
    put(lm, LANDMARK.LEFT_FOOT_INDEX, midX - footHalf + sway, 0.94 - liftL);
    put(lm, LANDMARK.RIGHT_FOOT_INDEX, midX + footHalf + sway, 0.94 - liftR);

    frames.push({ t: t * 1000, landmarks: lm });
  }
  return frames;
}
