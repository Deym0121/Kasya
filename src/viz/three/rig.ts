import type { Landmark, PoseFrame } from '../../gait/types';
import { isValid } from '../motion';
import type { BodyMetrics } from '../bodyModel';
import {
  add3,
  cross3,
  dist3,
  frameFrom,
  lerp3,
  madd3,
  norm3,
  perpTo,
  sub3,
  v3,
  type Frame,
  type V3,
} from './math';

/**
 * Lifts one replay pose (2D BlazePose landmarks from a SIDE-view capture) into
 * a 3D rig the renderer can orbit around.
 *
 * The camera sees the sagittal plane, so each landmark's x/y are kept as-is and
 * the missing depth comes from anatomy: every joint sits at a typical lateral
 * offset from the midline (hip joints ~5% of stature, shoulders ~10%…), the
 * near-camera side toward +z. When the near and far shoulders (or hips) are
 * filmed at different x, that difference becomes a real twist of the shoulder
 * girdle / pelvis — capped, because a few pixels of tracker noise would
 * otherwise spin the trunk. World units are the subject's stature; y is up from
 * the floor. Pure, unit-tested.
 */

export type Body = 'male' | 'female';
export type Side = 'r' | 'l';

export interface LimbJoints {
  shoulder: V3;
  elbow: V3;
  wrist: V3;
  /** knuckle line (mid index/pinky MCP) */
  hand: V3;
  hip: V3;
  knee: V3;
  ankle: V3;
  heel: V3;
  toe: V3;
  /** landmark index each joint came from, for highlighting */
  ids: { hip: number; knee: number; ankle: number };
}

export interface Rig {
  pelvis: Frame;
  chest: Frame;
  head: Frame;
  neckBase: V3;
  limbs: Record<Side, LimbJoints>;
  /** which body side faces the camera */
  near: Side;
  /** world-space joint for a landmark index (hips/knees/ankles), for glows */
  joint: (landmark: number) => V3 | null;
}

/** Per-clip placement: where the floor is and how big a person is in frame units. */
export interface Stage {
  /** stature in capture units (frame heights) */
  H: number;
  /** capture y of the floor */
  groundY: number;
  /** capture x the world origin sits at */
  originX: number;
  /** +1 → walks toward screen right */
  facing: 1 | -1;
  /** landmark side nearer the camera */
  nearLandmarks: 'left' | 'right';
}

const IDX = {
  left: { shoulder: 11, elbow: 13, wrist: 15, pinky: 17, index: 19, hip: 23, knee: 25, ankle: 27, heel: 29, toe: 31, ear: 7, eye: 2 },
  right: { shoulder: 12, elbow: 14, wrist: 16, pinky: 18, index: 20, hip: 24, knee: 26, ankle: 28, heel: 30, toe: 32, ear: 8, eye: 5 },
} as const;
const NOSE = 0;

/** Typical lateral offsets from the midline, as a fraction of stature. */
const LATERAL: Record<Body, Record<'hip' | 'knee' | 'ankle' | 'heel' | 'toe' | 'shoulder' | 'elbow' | 'wrist' | 'hand' | 'ear', number>> = {
  male: { hip: 0.052, knee: 0.048, ankle: 0.044, heel: 0.042, toe: 0.06, shoulder: 0.098, elbow: 0.114, wrist: 0.106, hand: 0.102, ear: 0.046 },
  female: { hip: 0.057, knee: 0.044, ankle: 0.04, heel: 0.038, toe: 0.055, shoulder: 0.09, elbow: 0.104, wrist: 0.098, hand: 0.094, ear: 0.044 },
};

function percentile(values: number[], p: number): number | null {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  return v[Math.min(v.length - 1, Math.max(0, Math.round((v.length - 1) * p)))];
}

/** Floor, scale and origin for a whole clip (stable across frames, so the figure doesn't bob with noise). */
export function stageFor(frames: PoseFrame[], metrics: BodyMetrics): Stage {
  const feet: number[] = [];
  const pelvisX: number[] = [];
  for (const f of frames ?? []) {
    const L = f.landmarks;
    for (const k of [29, 30, 31, 32, 27, 28]) if (isValid(L[k])) feet.push(L[k].y);
    if (isValid(L[23]) && isValid(L[24])) pelvisX.push((L[23].x + L[24].x) / 2);
  }
  const H = metrics.stature > 0 ? metrics.stature : 0.6;
  const facing = metrics.facing;
  // Unknown near side: a subject walking toward screen right shows their right side.
  const nearLandmarks = metrics.near ?? (facing === 1 ? 'right' : 'left');
  return {
    H,
    groundY: percentile(feet, 0.97) ?? 0.95,
    originX: percentile(pelvisX, 0.5) ?? 0.5,
    facing,
    nearLandmarks,
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Build the 3D rig for one (already smoothed) pose. Missing landmarks fall back
 * to anatomically placed guesses so the figure is never drawn broken.
 */
export function buildRig(L: Landmark[], stage: Stage, body: Body = 'male'): Rig {
  const lat = LATERAL[body];
  const { H, groundY, originX, facing } = stage;
  const fwd = v3(facing, 0, 0);
  const nearSet = stage.nearLandmarks;
  const farSet = nearSet === 'left' ? 'right' : 'left';
  // Body right = front × up. Facing +x with the camera on +z, the body's right is +z.
  const nearSide: Side = facing === 1 ? 'r' : 'l';
  const farSide: Side = nearSide === 'r' ? 'l' : 'r';

  const P = (k: number, z: number): V3 | null => (isValid(L[k]) ? v3((L[k].x - originX) / H, (groundY - L[k].y) / H, z) : null);

  const sideJoints = (set: 'left' | 'right', zSign: number) => {
    const ids = IDX[set];
    const g = (k: keyof typeof ids, latKey: keyof typeof lat) => P(ids[k], zSign * lat[latKey]);
    return {
      shoulder: g('shoulder', 'shoulder'),
      elbow: g('elbow', 'elbow'),
      wrist: g('wrist', 'wrist'),
      index: g('index', 'hand'),
      pinky: g('pinky', 'hand'),
      hip: g('hip', 'hip'),
      knee: g('knee', 'knee'),
      ankle: g('ankle', 'ankle'),
      heel: g('heel', 'heel'),
      toe: g('toe', 'toe'),
      ear: g('ear', 'ear'),
      ids: { hip: ids.hip, knee: ids.knee, ankle: ids.ankle },
    };
  };
  const nearJ = sideJoints(nearSet, +1);
  const farJ = sideJoints(farSet, -1);

  // ---- trunk ---------------------------------------------------------------
  const pair = (a: V3 | null, b: V3 | null) => (a && b ? lerp3(a, b, 0.5) : (a ?? b));
  let midHip = pair(nearJ.hip, farJ.hip);
  let midShoulder = pair(nearJ.shoulder, farJ.shoulder);
  if (!midHip && midShoulder) midHip = add3(midShoulder, v3(0, -0.29, 0));
  if (!midShoulder && midHip) midShoulder = add3(midHip, v3(0, 0.29, 0));
  if (!midHip || !midShoulder) {
    midHip = v3(0, 0.53, 0);
    midShoulder = v3(0, 0.82, 0);
  }
  midHip = v3(midHip.x, midHip.y, 0);
  midShoulder = v3(midShoulder.x, midShoulder.y, 0);
  const trunkUp = norm3(sub3(midShoulder, midHip));

  // Girdle twist from the near/far x difference, capped (noise guard).
  const girdle = (near: V3 | null, far: V3 | null, mid: V3, half: number, maxDeg: number): { r: V3; l: V3 } => {
    const maxDx = Math.tan((maxDeg * Math.PI) / 180) * half;
    const dx = near && far ? clamp((near.x - far.x) / 2, -maxDx, maxDx) : 0;
    const dy = near && far ? clamp((near.y - far.y) / 2, -0.02, 0.02) : 0;
    const nearP = v3(mid.x + dx, mid.y + dy, half);
    const farP = v3(mid.x - dx, mid.y - dy, -half);
    return nearSide === 'r' ? { r: nearP, l: farP } : { r: farP, l: nearP };
  };
  const hips = girdle(nearJ.hip, farJ.hip, midHip, lat.hip, 18);
  const shoulders = girdle(nearJ.shoulder, farJ.shoulder, midShoulder, lat.shoulder, 26);

  const girdleFrame = (o: V3, r: V3, l: V3): Frame => {
    const right = norm3(sub3(r, l), v3(0, 0, 1));
    const front = norm3(cross3(trunkUp, right), fwd); // up × right = front
    return frameFrom(o, trunkUp, front);
  };
  const pelvis = girdleFrame(midHip, hips.r, hips.l);
  const chest = girdleFrame(midShoulder, shoulders.r, shoulders.l);
  const neckBase = madd3(madd3(chest.o, chest.u, 0.03), chest.f, -0.008);

  // ---- head ----------------------------------------------------------------
  const nose = P(NOSE, 0);
  const earMid = pair(nearJ.ear, farJ.ear);
  let headO: V3;
  let headF: V3;
  if (earMid && nose && dist3(earMid, nose) > 0.02 && dist3(earMid, nose) < 0.14) {
    const e = v3(earMid.x, earMid.y, 0);
    // The nose sits a little below the ear canal: lift the ear→nose line ~10°.
    headF = norm3(add3(norm3(sub3(nose, e)), v3(0, 0.17, 0)));
    headO = madd3(madd3(e, headF, 0.006), v3(0, 1, 0), 0.01);
  } else {
    headF = chest.f;
    headO = madd3(neckBase, chest.u, 0.085);
  }
  // Keep the head on the neck: 6.5–10% of stature above the neck base.
  const neckVec = sub3(headO, neckBase);
  const neckLen = Math.sqrt(neckVec.x * neckVec.x + neckVec.y * neckVec.y + neckVec.z * neckVec.z);
  if (neckLen < 0.065 || neckLen > 0.1) headO = madd3(neckBase, norm3(neckVec, chest.u), clamp(neckLen, 0.065, 0.1));
  const headUpHint = norm3(add3(chest.u, v3(0, 1.5, 0)));
  const headFrontFlat = perpTo(headF, headUpHint, chest.f);
  const head = frameFrom(headO, perpTo(headUpHint, headFrontFlat, v3(0, 1, 0)), headFrontFlat);

  // ---- limbs ---------------------------------------------------------------
  const limb = (j: ReturnType<typeof sideJoints>, side: Side): LimbJoints => {
    const sh = shoulders[side];
    const hip = hips[side];
    const zs = side === nearSide ? 1 : -1;
    const keepZ = (p: V3 | null, z: number) => (p ? v3(p.x, p.y, zs * z) : null);
    const down = v3(0, -1, 0);
    const elbow = keepZ(j.elbow, lat.elbow) ?? madd3(sh, down, 0.17);
    const wrist = keepZ(j.wrist, lat.wrist) ?? madd3(elbow, norm3(sub3(elbow, sh), down), 0.15);
    const knuckles = j.index && j.pinky ? lerp3(j.index, j.pinky, 0.5) : (j.index ?? j.pinky);
    const handDir = knuckles ? norm3(sub3(knuckles, wrist), norm3(sub3(wrist, elbow))) : norm3(sub3(wrist, elbow), down);
    const hand = madd3(wrist, handDir, 0.055);
    const knee = keepZ(j.knee, lat.knee) ?? madd3(hip, down, 0.245);
    const ankle = keepZ(j.ankle, lat.ankle) ?? madd3(knee, down, 0.245);
    const shank = norm3(sub3(ankle, knee), down);
    const heel = keepZ(j.heel, lat.heel) ?? madd3(madd3(ankle, shank, 0.035), fwd, -0.025);
    let toe = keepZ(j.toe, lat.toe) ?? madd3(madd3(ankle, shank, 0.04), fwd, 0.12);
    // A foot is ~13–16% of stature heel→toe; tracker toes wander, so pin the length.
    const footLen = dist3(heel, toe);
    if (footLen < 0.1 || footLen > 0.17) toe = madd3(heel, norm3(sub3(toe, heel), fwd), clamp(footLen, 0.1, 0.17));
    return { shoulder: sh, elbow, wrist, hand, hip, knee, ankle, heel, toe, ids: j.ids };
  };
  const limbs: Record<Side, LimbJoints> = {
    [nearSide]: limb(nearJ, nearSide),
    [farSide]: limb(farJ, farSide),
  } as Record<Side, LimbJoints>;

  const joint = (k: number): V3 | null => {
    for (const s of ['r', 'l'] as Side[]) {
      const lj = limbs[s];
      if (lj.ids.hip === k) return lj.hip;
      if (lj.ids.knee === k) return lj.knee;
      if (lj.ids.ankle === k) return lj.ankle;
    }
    return null;
  };

  return { pelvis, chest, head, neckBase, limbs, near: nearSide, joint };
}
