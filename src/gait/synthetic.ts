import { PoseFrame, Landmark, LANDMARK, LANDMARK_COUNT } from './types';

/** A sampled joint-angle curve over one stride: [phase 0..1 from foot strike, degrees]. */
type AngleCurve = ReadonlyArray<readonly [number, number]>;

interface GaitKinematics {
  /** fraction of the stride the foot is on the ground (toe-off phase) */
  stanceFraction: number;
  /** hip flexion (+) / extension (−) through the stride */
  hip: AngleCurve;
  /** knee flexion from straight through the stride */
  knee: AngleCurve;
  /** hip vertical bounce amplitude (normalized units) and the stride phase of its lowest point */
  bounce: number;
  bounceLowPhase: number;
}

/**
 * Typical sagittal-plane joint angles, simplified from normative gait curves
 * (walking ≈ 60% stance; easy running ≈ 38% stance with a flight phase). Used
 * only to make the demo / test skeleton move like a person — never as a norm
 * the user is scored against.
 */
// Hip angles are the thigh's angle from vertical (pelvic tilt folded in).
const WALK: GaitKinematics = {
  stanceFraction: 0.6,
  hip: [[0, 25], [0.12, 20], [0.3, 5], [0.5, -12], [0.62, -4], [0.75, 14], [0.87, 27]],
  knee: [[0, 4], [0.14, 17], [0.38, 5], [0.5, 9], [0.6, 36], [0.72, 62], [0.85, 38], [0.95, 6]],
  bounce: 0.012,
  // lowest in double support, highest over the planted foot
  bounceLowPhase: 0.05,
};

const RUN: GaitKinematics = {
  stanceFraction: 0.38,
  hip: [[0, 20], [0.18, 6], [0.38, -14], [0.5, -4], [0.72, 28], [0.88, 24]],
  knee: [[0, 18], [0.16, 40], [0.38, 18], [0.48, 45], [0.68, 100], [0.86, 28], [0.94, 18]],
  bounce: 0.025,
  // lowest at mid-stance, highest in flight
  bounceLowPhase: 0.18,
};

/** Smooth periodic (cubic Hermite) interpolation of a stride curve at `phase`. */
function sampleCurve(curve: AngleCurve, phase: number): number {
  const n = curve.length;
  const p = ((phase % 1) + 1) % 1;
  let i = 0;
  for (let k = 0; k < n; k++) if (curve[k][0] <= p) i = k;
  const at = (k: number): [number, number] => {
    const m = ((k % n) + n) % n;
    return [curve[m][0] + Math.floor(k / n), curve[m][1]];
  };
  const [tm, vm] = at(i - 1);
  const [t0, v0] = at(i);
  const [t1, v1] = at(i + 1);
  const [t2, v2] = at(i + 2);
  const h = t1 - t0;
  const m0 = ((v1 - vm) / (t1 - tm)) * h;
  const m1 = ((v2 - v0) / (t2 - t0)) * h;
  const u = (p - t0) / h;
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * v0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * v1 + (u3 - u2) * m1;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

export interface SyntheticWalkOptions {
  durationSec?: number;
  fps?: number;
  /** steps per minute */
  cadence?: number;
  visibility?: number;
  /**
   * 'walk' (~60% stance, knee bending ~60° in swing) or 'run' (~38% stance,
   * ~100° of swing knee bend). Defaults by cadence: under 140 spm walks.
   */
  gait?: 'walk' | 'run';
  /** +1 = travelling toward +x (default); −1 = toward −x (a leftward / mirrored capture) */
  direction?: 1 | -1;
  /** hips move across the frame (overground) instead of staying put (treadmill-style) */
  travel?: boolean;
  /**
   * 0 (default) = symmetric. Up to ~0.9 = the right step is shorter in both
   * length and time than the left — an extreme limp-like asymmetry for tests.
   */
  asymmetry?: number;
}

/**
 * A plausible synthetic side-on walk or run, built from typical joint-angle
 * curves (forward kinematics from the hips), in the analyzer's isotropic
 * coordinate space (both axes in units of frame height — what native capture
 * produces). Used by the simulated scan (so review / graph / replay work
 * without a camera) and by tests. Because it's driven by joint angles, the
 * knee numbers, the stance share and the foot's reach ahead of the hips are
 * physiologically plausible rather than artefacts of a sine wave.
 */
export function makeSyntheticWalk(opts: SyntheticWalkOptions = {}): PoseFrame[] {
  const durationSec = opts.durationSec ?? 8;
  const fps = opts.fps ?? 30;
  const cadence = opts.cadence ?? 168;
  const vis = opts.visibility ?? 0.95;
  const kin = (opts.gait ?? (cadence < 140 ? 'walk' : 'run')) === 'walk' ? WALK : RUN;
  const dir = opts.direction ?? 1;
  const asym = Math.max(0, Math.min(0.9, opts.asymmetry ?? 0));
  const strideFreq = cadence / 60 / 2;
  const n = Math.round(durationSec * fps);
  const thigh = 0.19;
  const shank = 0.19;
  // Right foot strikes this far through the left stride (0.5 = even steps).
  const rightOffset = 0.5 - 0.3 * asym;
  // Right hip flexes forward less → a shorter right step.
  const rightReach = 1 - 0.7 * asym;
  // Overground speed ≈ stride length × stride frequency (stride ≈ 2 step lengths).
  const speed = opts.travel ? 2 * 1.3 * (thigh + shank) * 0.5 * strideFreq : 0;
  const startX = opts.travel ? 0.5 - dir * 0.5 * speed * durationSec : 0.5;
  const frames: PoseFrame[] = [];

  for (let i = 0; i < n; i++) {
    const t = i / fps;
    const phaseL = strideFreq * t;
    const phaseR = phaseL - rightOffset;
    const hipX = startX + dir * speed * t;
    const bounce = -kin.bounce * Math.cos(4 * Math.PI * (phaseL - kin.bounceLowPhase));
    const hipY = 0.5 + bounce;

    const lm: Landmark[] = Array.from({ length: LANDMARK_COUNT }, () => ({ x: hipX, y: hipY, z: 0, visibility: vis }));
    const put = (idx: number, x: number, y: number, z = 0) => {
      lm[idx] = { x, y, z, visibility: vis };
    };

    const leg = (phase: number, reach: number) => {
      const h = sampleCurve(kin.hip, phase);
      const hipDeg = h > 0 ? h * reach : h;
      const kneeDeg = sampleCurve(kin.knee, phase);
      const th = rad(hipDeg);
      const sh = rad(hipDeg - kneeDeg);
      const kneeX = hipX + dir * thigh * Math.sin(th);
      const kneeY = hipY + thigh * Math.cos(th);
      const ankleX = kneeX + dir * shank * Math.sin(sh);
      const ankleY = kneeY + shank * Math.cos(sh);
      return { kneeX, kneeY, ankleX, ankleY, swing: Math.sin(th) };
    };
    const L = leg(phaseL, 1);
    const R = leg(phaseR, rightReach);

    // Torso leans a touch forward; arms swing opposite their legs.
    const shX = hipX + dir * 0.02;
    const shY = hipY - 0.25;
    put(LANDMARK.LEFT_HIP, hipX, hipY, -0.03);
    put(LANDMARK.RIGHT_HIP, hipX, hipY, 0.03);
    put(11, shX, shY, -0.03); // L shoulder
    put(12, shX, shY, 0.03); // R shoulder
    put(13, shX + dir * 0.06 * R.swing, shY + 0.12, -0.04); // L elbow (swings with the right leg)
    put(15, shX + dir * 0.1 * R.swing, shY + 0.22, -0.04); // L wrist
    put(14, shX + dir * 0.06 * L.swing, shY + 0.12, 0.04); // R elbow
    put(16, shX + dir * 0.1 * L.swing, shY + 0.22, 0.04); // R wrist
    // Head faces the direction of travel: nose ahead of the ears.
    put(0, shX + dir * 0.035, shY - 0.1);
    put(2, shX + dir * 0.028, shY - 0.11, -0.01); // L eye
    put(5, shX + dir * 0.028, shY - 0.11, 0.01); // R eye
    put(7, shX - dir * 0.005, shY - 0.1, -0.03); // L ear
    put(8, shX - dir * 0.005, shY - 0.1, 0.03); // R ear

    put(LANDMARK.LEFT_KNEE, L.kneeX, L.kneeY, -0.05);
    put(LANDMARK.RIGHT_KNEE, R.kneeX, R.kneeY, 0.05);
    put(LANDMARK.LEFT_ANKLE, L.ankleX, L.ankleY, -0.05);
    put(LANDMARK.RIGHT_ANKLE, R.ankleX, R.ankleY, 0.05);
    // Feet point the way you travel: heel behind the ankle, toes ahead.
    put(LANDMARK.LEFT_HEEL, L.ankleX - dir * 0.02, L.ankleY + 0.02, -0.05);
    put(LANDMARK.RIGHT_HEEL, R.ankleX - dir * 0.02, R.ankleY + 0.02, 0.05);
    put(LANDMARK.LEFT_FOOT_INDEX, L.ankleX + dir * 0.05, L.ankleY + 0.03, -0.05);
    put(LANDMARK.RIGHT_FOOT_INDEX, R.ankleX + dir * 0.05, R.ankleY + 0.03, 0.05);

    frames.push({ t: t * 1000, landmarks: lm });
  }
  return frames;
}

/** The true stance share (percent of a stride) the synthetic kinematics are built with. */
export function syntheticStancePct(gait: 'walk' | 'run'): number {
  return (gait === 'walk' ? WALK : RUN).stanceFraction * 100;
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
