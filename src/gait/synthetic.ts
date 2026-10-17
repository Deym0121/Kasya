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
  /**
   * Arm swing: the shoulder follows the OPPOSITE hip (gain × its angle + offset,
   * degrees forward of vertical); the elbow is bent `elbow` degrees, `elbowFwd`
   * more as the arm comes forward.
   */
  arm: { gain: number; offset: number; elbow: number; elbowFwd: number };
  /** ankle angle through the stride, degrees (+ dorsiflexion: toes toward the shin) */
  ankle: AngleCurve;
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
  // relaxed swing, elbows softly bent
  arm: { gain: 0.65, offset: -2, elbow: 20, elbowFwd: 18 },
  // heel strike, foot flat, the shin rolls over the foot, push-off, toes clear in swing
  ankle: [[0, 0], [0.07, -6], [0.25, 4], [0.45, 10], [0.6, -15], [0.7, -8], [0.85, 2], [0.95, 1]],
};

const RUN: GaitKinematics = {
  stanceFraction: 0.38,
  hip: [[0, 20], [0.18, 6], [0.38, -14], [0.5, -4], [0.72, 28], [0.88, 24]],
  knee: [[0, 18], [0.16, 40], [0.38, 18], [0.48, 45], [0.68, 100], [0.86, 28], [0.94, 18]],
  bounce: 0.025,
  // lowest at mid-stance, highest in flight
  bounceLowPhase: 0.18,
  // driving swing with the elbow held near 90°
  arm: { gain: 1.45, offset: 0, elbow: 68, elbowFwd: 26 },
  ankle: [[0, 5], [0.08, 12], [0.2, 18], [0.32, 2], [0.38, -20], [0.48, -12], [0.65, 0], [0.85, 7], [0.95, 6]],
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
  const contact: number[] = [];

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
      // The foot pitches with the shin and the ankle angle: toes up at heel strike,
      // flat through mid-stance, heel high at push-off.
      const pitch = sh + rad(sampleCurve(kin.ankle, phase));
      const dx = dir * Math.cos(pitch);
      const dy = -Math.sin(pitch);
      const nx = dir * Math.sin(pitch);
      const ny = Math.cos(pitch);
      const heelX = ankleX - 0.028 * dx + 0.042 * nx;
      const heelY = ankleY - 0.028 * dy + 0.042 * ny;
      const toeX = ankleX + 0.09 * dx + 0.032 * nx;
      const toeY = ankleY + 0.09 * dy + 0.032 * ny;
      const stance = ((phase % 1) + 1) % 1 < kin.stanceFraction;
      return { kneeX, kneeY, ankleX, ankleY, heelX, heelY, toeX, toeY, stance, swing: Math.sin(th) };
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
    // Each arm follows the opposite leg's hip angle, elbow bent (more when running).
    const upperArm = 0.144;
    const forearm = 0.113;
    const arm = (contraPhase: number, ids: { elbow: number; wrist: number; pinky: number; index: number; thumb: number }, z: number) => {
      const sh = kin.arm.gain * sampleCurve(kin.hip, contraPhase) + kin.arm.offset;
      const fwd = Math.max(0, Math.min(1, sh / 30));
      const tu = rad(sh);
      const tf = rad(sh + kin.arm.elbow + kin.arm.elbowFwd * fwd);
      const ex = shX + dir * upperArm * Math.sin(tu);
      const ey = shY + upperArm * Math.cos(tu);
      const wx = ex + dir * forearm * Math.sin(tf);
      const wy = ey + forearm * Math.cos(tf);
      const hx = dir * 0.05 * Math.sin(tf);
      const hy = 0.05 * Math.cos(tf);
      put(ids.elbow, ex, ey, z);
      put(ids.wrist, wx, wy, z);
      put(ids.index, wx + hx, wy + hy - 0.006, z);
      put(ids.pinky, wx + hx * 0.85, wy + hy * 0.85 + 0.006, z);
      put(ids.thumb, wx + hx * 0.6, wy + hy * 0.6 - 0.01, z);
    };
    arm(phaseR, { elbow: 13, wrist: 15, pinky: 17, index: 19, thumb: 21 }, -0.04); // L arm swings with the right leg
    arm(phaseL, { elbow: 14, wrist: 16, pinky: 18, index: 20, thumb: 22 }, 0.04); // R arm with the left leg
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
    put(LANDMARK.LEFT_HEEL, L.heelX, L.heelY, -0.05);
    put(LANDMARK.RIGHT_HEEL, R.heelX, R.heelY, 0.05);
    put(LANDMARK.LEFT_FOOT_INDEX, L.toeX, L.toeY, -0.05);
    put(LANDMARK.RIGHT_FOOT_INDEX, R.toeX, R.toeY, 0.05);

    // lowest point (largest y) of any foot that is in stance this frame
    const planted = [L, R].filter((f) => f.stance).map((f) => Math.max(f.heelY, f.toeY));
    contact.push(planted.length ? Math.max(...planted) : NaN);
    frames.push({ t: t * 1000, landmarks: lm });
  }
  // Keep planted feet ON the floor: shift each stance frame so its planted foot
  // touches one ground level; flight frames take the correction interpolated
  // between their neighbours (the bounce still lifts the body in flight).
  const known = contact.map((c, i) => [i, c] as const).filter(([, c]) => Number.isFinite(c));
  if (known.length) {
    const ground = known.reduce((s, [, c]) => s + c, 0) / known.length;
    const corr = contact.map((c) => (Number.isFinite(c) ? ground - c : NaN));
    for (let i = 0; i < corr.length; i++) {
      if (Number.isFinite(corr[i])) continue;
      let a = i - 1;
      while (a >= 0 && !Number.isFinite(corr[a])) a--;
      let b = i + 1;
      while (b < corr.length && !Number.isFinite(corr[b])) b++;
      const ca = a >= 0 ? corr[a] : corr[b];
      const cb = b < corr.length ? corr[b] : ca;
      corr[i] = a >= 0 && b < corr.length ? ca + ((cb - ca) * (i - a)) / (b - a) : ca;
    }
    // a light binomial smooth, so the hips don't kink where stance hands over to flight
    const at = (i: number) => corr[Math.min(corr.length - 1, Math.max(0, i))];
    const smoothCorr = corr.map((_, i) => (at(i - 2) + 4 * at(i - 1) + 6 * at(i) + 4 * at(i + 1) + at(i + 2)) / 16);
    // ...and never through the floor: lift where a foot would sink, eased in and out
    // (widen the lift, then smooth it) so the body still moves without kinks.
    const feet = [LANDMARK.LEFT_HEEL, LANDMARK.RIGHT_HEEL, LANDMARK.LEFT_FOOT_INDEX, LANDMARK.RIGHT_FOOT_INDEX];
    const sink = frames.map((f, i) => Math.max(0, Math.max(...feet.map((k) => f.landmarks[k].y)) + smoothCorr[i] - ground));
    const sk = (i: number) => sink[Math.min(sink.length - 1, Math.max(0, i))];
    const wide = sink.map((_, i) => Math.max(sk(i - 2), sk(i - 1), sk(i), sk(i + 1), sk(i + 2)));
    const wk = (i: number) => wide[Math.min(wide.length - 1, Math.max(0, i))];
    const lift = wide.map((_, i) => (wk(i - 2) + 4 * wk(i - 1) + 6 * wk(i) + 4 * wk(i + 1) + wk(i + 2)) / 16);
    frames.forEach((f, i) => {
      for (const p of f.landmarks) p.y += smoothCorr[i] - lift[i];
    });
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
