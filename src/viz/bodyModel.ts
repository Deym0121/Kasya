import type { Landmark, PoseFrame } from '../gait/types';
import { isValid } from './motion';
import { add, clamp, closedCurve, dist, dot, mid, mix, mul, openCurve, perp, sub, unit, type Pt } from './geometry';
import { footBones, footFrame, shoe } from './footSkeleton';
import { skullShapes, vertebraPath, type SkullShapes } from './skull';

/**
 * Geometry for the gait replay's three views — Human (a clothed runner),
 * Anatomy (translucent body over the skeleton) and Skeleton (bones only, with a
 * real foot skeleton, see footSkeleton.ts) — built from BlazePose landmarks. Every size is a fraction of the subject's OWN estimated stature, so
 * the figure takes the shape of the person filmed — near or far from the camera,
 * tall or short — instead of fixed-size limbs. Torso width follows the measured
 * shoulder/hip spread, so the body turns naturally between side and rear views.
 * Pure (no RN imports): returns SVG path strings + primitives, unit-tested in node.
 *
 * Proportions are adult anthropometric averages (segment lengths ≈ Drillis &
 * Contini / Winter; girths from adult reference ranges). They shape the drawing
 * only — nothing here is a measurement of the user.
 */

export type { Pt };

const L_SHOULDER = 11;
const R_SHOULDER = 12;
const L_ELBOW = 13;
const R_ELBOW = 14;
const L_WRIST = 15;
const R_WRIST = 16;
const L_PINKY = 17;
const R_PINKY = 18;
const L_INDEX = 19;
const R_INDEX = 20;
const L_HIP = 23;
const R_HIP = 24;
const L_KNEE = 25;
const R_KNEE = 26;
const L_ANKLE = 27;
const R_ANKLE = 28;
const L_HEEL = 29;
const R_HEEL = 30;
const L_TOE = 31;
const R_TOE = 32;
const NOSE = 0;
const L_EYE = 2;
const R_EYE = 5;
const L_EAR = 7;
const R_EAR = 8;

function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : null;
}

/**
 * Outline of a segment from `a` to `b` with separate front/back half-width
 * profiles (sampled at evenly spaced stations), rounded at both ends. `front` is
 * the side `frontDir` points to (anterior in a side view).
 */
function segmentShape(a: Pt, b: Pt, front: number[], back: number[], frontDir: Pt | null, overlap = 0): string {
  const axis = unit(sub(b, a));
  let n = perp(axis);
  if (frontDir && n.x * frontDir.x + n.y * frontDir.y < 0) n = mul(n, -1);
  const length = dist(a, b);
  const start = sub(a, mul(axis, overlap * length));
  const end = add(b, mul(axis, overlap * length));
  const k = front.length;
  const station = (i: number) => mix(start, end, i / (k - 1));
  const fronts = front.map((w, i) => add(station(i), mul(n, w)));
  const backs = back.map((w, i) => sub(station(i), mul(n, w)));
  const capEnd = add(end, mul(axis, (front[k - 1] + back[k - 1]) * 0.45));
  const capStart = sub(start, mul(axis, (front[0] + back[0]) * 0.45));
  return closedCurve([...fronts, capEnd, ...backs.reverse(), capStart]);
}

export type View = 'side' | 'front';

export interface BodyMetrics {
  /** estimated standing height in capture units (frame heights) */
  stature: number;
  /** direction the subject faces in a side view: +1 → screen right, −1 → left */
  facing: 1 | -1;
  /** which side is nearer the camera in a side view (null = unknown / facing camera) */
  near: 'left' | 'right' | null;
}

const pt = (L: Landmark[], k: number): Pt | null => (isValid(L[k]) ? { x: L[k].x, y: L[k].y } : null);

/**
 * Per-clip body measurements, from the subject's own skeleton. Stature comes
 * from leg length (thigh + shank ≈ 0.49 × height, insensitive to knee bend) and
 * trunk length (shoulder line → hip line ≈ 0.29 × height), medians over the clip.
 */
export function bodyMetrics(frames: PoseFrame[]): BodyMetrics {
  const legs: number[] = [];
  const trunks: number[] = [];
  const facingVotes: number[] = [];
  const depth: number[] = [];
  for (const f of frames ?? []) {
    const L = f.landmarks;
    for (const [h, k, a] of [
      [L_HIP, L_KNEE, L_ANKLE],
      [R_HIP, R_KNEE, R_ANKLE],
    ]) {
      const ph = pt(L, h);
      const pk = pt(L, k);
      const pa = pt(L, a);
      if (ph && pk && pa) legs.push(dist(ph, pk) + dist(pk, pa));
    }
    const ls = pt(L, L_SHOULDER);
    const rs = pt(L, R_SHOULDER);
    const lh = pt(L, L_HIP);
    const rh = pt(L, R_HIP);
    if (ls && rs && lh && rh) trunks.push(dist(mid(ls, rs), mid(lh, rh)));
    // Facing: toes point forward; the nose sits in front of the ears.
    for (const [heel, toe] of [
      [L_HEEL, L_TOE],
      [R_HEEL, R_TOE],
    ]) {
      const ph = pt(L, heel);
      const pt2 = pt(L, toe);
      if (ph && pt2 && Math.abs(pt2.x - ph.x) > 0.005) facingVotes.push(Math.sign(pt2.x - ph.x));
    }
    const nose = pt(L, NOSE);
    const le = pt(L, L_EAR);
    const re = pt(L, R_EAR);
    if (nose && (le || re)) {
      const ear = le && re ? mid(le, re) : (le ?? re)!;
      if (Math.abs(nose.x - ear.x) > 0.005) facingVotes.push(2 * Math.sign(nose.x - ear.x));
    }
    // Near side: MediaPipe z is smaller toward the camera; visibility helps too.
    const zl = [L[L_HIP]?.z, L[L_SHOULDER]?.z].filter((v): v is number => Number.isFinite(v as number));
    const zr = [L[R_HIP]?.z, L[R_SHOULDER]?.z].filter((v): v is number => Number.isFinite(v as number));
    const vl = (L[L_HIP]?.visibility ?? 0) + (L[L_SHOULDER]?.visibility ?? 0);
    const vr = (L[R_HIP]?.visibility ?? 0) + (L[R_SHOULDER]?.visibility ?? 0);
    const zDiff = zl.length && zr.length ? zr.reduce((s, v) => s + v, 0) / zr.length - zl.reduce((s, v) => s + v, 0) / zl.length : 0;
    depth.push(zDiff + 0.5 * (vl - vr));
  }
  const fromLeg = median(legs);
  const fromTrunk = median(trunks);
  const estimates = [fromLeg != null ? fromLeg / 0.49 : null, fromTrunk != null ? fromTrunk / 0.29 : null].filter(
    (v): v is number => v != null && v > 0.05,
  );
  const stature = estimates.length ? estimates.reduce((s, v) => s + v, 0) / estimates.length : 0.75;
  const votes = facingVotes.reduce((s, v) => s + v, 0);
  const d = median(depth) ?? 0;
  return {
    stature: clamp(stature, 0.1, 3),
    facing: votes < 0 ? -1 : 1,
    near: d > 0.04 ? 'left' : d < -0.04 ? 'right' : null,
  };
}

export interface Limb {
  d: string;
  /** far side of the body in a side view (drawn behind, dimmer) */
  far: boolean;
  /** which body part, so a view can layer legs and arms naturally */
  part?: 'leg' | 'arm' | 'foot';
}

export interface ShoeShape {
  upper: string;
  sole: string;
  laces: string[];
  far: boolean;
}

export interface Ellipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** degrees */
  rotate: number;
}

export interface Figure {
  /** human body volumes, in draw order (far limbs first) */
  flesh: { back: Limb[]; torso: string | null; neck: string | null; head: Ellipse | null; front: Limb[] };
  /** Human view extras: clothing, shoes, hair and profile features */
  human: {
    shirt: string | null;
    shorts: string | null;
    sleeves: Limb[];
    shortsLegs: Limb[];
    shoes: ShoeShape[];
    hair: string | null;
    nose: string | null;
    ear: Ellipse | null;
    /** eyes (one in profile, two square-on); none from behind */
    eyes: Ellipse[];
    brows: string[];
    mouth: string | null;
  };
  /** anatomical skeleton */
  bones: {
    skull: SkullShapes | null;
    spine: string | null;
    /** 7 cervical, 12 thoracic, 5 lumbar: body (+ spinous process in a side view) */
    vertebrae: { cx: number; cy: number; r: number; d: string }[];
    ribs: string[];
    sternum: string | null;
    clavicles: string[];
    pelvis: string[];
    long: Limb[];
    thin: Limb[];
    /** tarsals + metatarsals of each foot */
    feet: Limb[];
    /** toe phalanges */
    toes: Limb[];
    patellae: { cx: number; cy: number; r: number }[];
  };
  /** 0 = pure side view … 1 = facing / back to the camera, this frame */
  frontness: number;
  /** stroke widths used by the bone outlines, scaled to the body */
  strokes: { bone: number; fine: number };
}

// Hip bone in profile, cm around the hip joint (x forward, y down): ASIS →
// AIIS → pubis → ischial tuberosity → sciatic notches → PSIS → iliac crest.
const HIP_BONE_SIDE: [number, number][] = [
  [5.2, -7.0], [4.3, -5.2], [4.8, -3.6], [3.6, -1.6], [5.6, 1.6], [6.6, 2.6], [6.2, 5.2], [3.6, 6.0], [0.8, 7.0],
  [-1.8, 7.6], [-3.6, 5.6], [-3.6, 3.0], [-4.6, 1.2], [-3.6, -1.2], [-5.2, -3.8], [-6.6, -5.4], [-7.2, -7.8],
  [-5.2, -10.6], [-1.0, -12.0], [3.0, -10.4],
];
const OBTURATOR_SIDE: [number, number][] = [[0.6, 3.2], [2.0, 2.4], [3.8, 3.0], [4.2, 4.4], [3.0, 5.4], [1.2, 5.0]];
// Sacrum + coccyx in profile, cm from the top of S1 (where the lumbar spine ends).
const SACRUM_SIDE: [number, number][] = [
  [2.0, 0.2], [-2.4, -0.6], [-3.8, 3.5], [-3.2, 8.0], [-1.6, 10.8], [-0.4, 11.6], [0.0, 10.6], [-0.2, 7.6], [0.8, 3.8],
];

// Half-width profiles (fractions of stature) at 5 stations, proximal → distal.
// [anterior/front, posterior/back]. Calf and buttock bulges are posterior,
// quadriceps anterior — mirrored automatically with the facing direction.
const PROFILE = {
  thigh: { front: [0.054, 0.056, 0.048, 0.038, 0.03], back: [0.06, 0.05, 0.042, 0.035, 0.029] },
  shank: { front: [0.03, 0.028, 0.025, 0.021, 0.018], back: [0.03, 0.043, 0.037, 0.026, 0.018] },
  upperArm: { front: [0.034, 0.03, 0.027, 0.024, 0.021], back: [0.032, 0.03, 0.026, 0.023, 0.021] },
  forearm: { front: [0.023, 0.025, 0.021, 0.017, 0.014], back: [0.023, 0.024, 0.02, 0.016, 0.014] },
  hand: { front: [0.014, 0.019, 0.018, 0.014, 0.009], back: [0.014, 0.016, 0.015, 0.012, 0.009] },
  foot: { front: [0.022, 0.02, 0.016, 0.012, 0.008], back: [0.028, 0.022, 0.016, 0.011, 0.008] },
  neck: { front: [0.034, 0.033, 0.033, 0.036, 0.04], back: [0.03, 0.03, 0.032, 0.036, 0.042] },
};
// Torso half-widths along the trunk axis (top of shoulders → just below the hip
// joints). Side view = chest/belly (front) and back/buttocks (back); front view
// = left/right half-width, floored by the measured shoulder / hip spread.
const TORSO_T = [0, 0.18, 0.38, 0.58, 0.78, 0.92, 1.04];
const TORSO_SIDE_FRONT = [0.045, 0.072, 0.07, 0.058, 0.057, 0.055, 0.03];
const TORSO_SIDE_BACK = [0.05, 0.06, 0.054, 0.042, 0.052, 0.07, 0.05];
const TORSO_FRONT_HALF = [0.105, 0.112, 0.098, 0.085, 0.092, 0.1, 0.075];

/**
 * Builds the body + skeleton for one pose. `L` should be a cleaned/interpolated
 * pose (see motion.ts) in capture units.
 */
export function buildFigure(L: Landmark[], m: BodyMetrics): Figure {
  const H = m.stature;
  const get = (k: number) => pt(L, k);
  const ls = get(L_SHOULDER);
  const rs = get(R_SHOULDER);
  const lh = get(L_HIP);
  const rh = get(R_HIP);
  const sh = ls && rs ? mid(ls, rs) : (ls ?? rs);
  const hp = lh && rh ? mid(lh, rh) : (lh ?? rh);

  // How square-on the body is to the camera this frame (handles turning).
  const trunkLen = sh && hp ? dist(sh, hp) : 0.29 * H;
  const shoulderSpread = ls && rs ? Math.abs(ls.x - rs.x) : 0;
  const frontness = clamp((shoulderSpread / Math.max(trunkLen, 1e-6) - 0.15) / 0.55, 0, 1);
  const sideness = 1 - frontness;
  const forward: Pt = { x: m.facing, y: 0 };
  const frontDir = frontness > 0.85 ? null : forward;

  const blend = (front: number[], back: number[]) => {
    // In a square-on view anterior/posterior collapse to a symmetric width.
    const avg = front.map((f, i) => (f + back[i]) / 2);
    return {
      f: front.map((v, i) => (v * sideness + avg[i] * frontness) * H),
      b: back.map((v, i) => (v * sideness + avg[i] * frontness) * H),
    };
  };
  const shape = (a: Pt | null, b: Pt | null, p: { front: number[]; back: number[] }, overlap = 0.04) => {
    if (!a || !b || dist(a, b) < 1e-4) return null;
    const w = blend(p.front, p.back);
    return segmentShape(a, b, w.f, w.b, frontDir, overlap);
  };
  const far = (side: 'left' | 'right') => m.near != null && side !== m.near && frontness < 0.6;

  // ---------- flesh ----------
  const back: Limb[] = [];
  const front: Limb[] = [];
  // Fingertips must sit near the wrist; a stray hand landmark would otherwise
  // stretch the hand across the body, so fall back to continuing the forearm.
  const handTip = (index: number, pinky: number) => {
    const s = index === L_INDEX;
    const wrist = get(s ? L_WRIST : R_WRIST);
    const elbow = get(s ? L_ELBOW : R_ELBOW);
    const i = get(index);
    const p = get(pinky);
    const tip = i && p ? mid(i, p) : (i ?? p);
    if (wrist && tip && dist(wrist, tip) < 0.13 * H && dist(wrist, tip) > 0.01 * H) return tip;
    if (wrist && elbow) return add(wrist, mul(unit(sub(wrist, elbow)), 0.08 * H));
    return null;
  };
  // A slice of a limb from its start to `to` (0..1), e.g. a sleeve or shorts leg.
  const slice = (a: Pt | null, b: Pt | null, p: { front: number[]; back: number[] }, to: number, grow: number) => {
    if (!a || !b) return null;
    const at = (arr: number[], u: number) => {
      const x = u * (arr.length - 1);
      const i = Math.min(Math.floor(x), arr.length - 2);
      return arr[i] + (arr[i + 1] - arr[i]) * (x - i);
    };
    const stations = [0, 0.25, 0.5, 0.75, 1].map((k) => k * to);
    return shape(a, mix(a, b, to), {
      front: stations.map((u) => at(p.front, u) * grow),
      back: stations.map((u) => at(p.back, u) * grow),
    }, 0.06);
  };
  const sleeves: Limb[] = [];
  const shortsLegs: Limb[] = [];
  for (const side of ['left', 'right'] as const) {
    const s = side === 'left';
    const isFar = far(side);
    const parts: [string | null, Limb['part']][] = [
      [shape(get(s ? L_HIP : R_HIP), get(s ? L_KNEE : R_KNEE), PROFILE.thigh), 'leg'],
      [shape(get(s ? L_KNEE : R_KNEE), get(s ? L_ANKLE : R_ANKLE), PROFILE.shank), 'leg'],
      [shape(get(s ? L_ANKLE : R_ANKLE), get(s ? L_TOE : R_TOE), PROFILE.foot, 0.12), 'foot'],
      [shape(get(s ? L_HEEL : R_HEEL), get(s ? L_TOE : R_TOE), {
        front: PROFILE.foot.front.map((v) => v * 0.7),
        back: PROFILE.foot.back.map((v) => v * 0.7),
      }, 0.02), 'foot'],
      [shape(get(s ? L_SHOULDER : R_SHOULDER), get(s ? L_ELBOW : R_ELBOW), PROFILE.upperArm), 'arm'],
      [shape(get(s ? L_ELBOW : R_ELBOW), get(s ? L_WRIST : R_WRIST), PROFILE.forearm), 'arm'],
      [shape(get(s ? L_WRIST : R_WRIST), handTip(s ? L_INDEX : R_INDEX, s ? L_PINKY : R_PINKY), PROFILE.hand, 0.1), 'arm'],
    ];
    for (const [d, part] of parts) if (d) (isFar ? back : front).push({ d, far: isFar, part });
    const sleeve = slice(get(s ? L_SHOULDER : R_SHOULDER), get(s ? L_ELBOW : R_ELBOW), PROFILE.upperArm, 0.42, 1.14);
    if (sleeve) sleeves.push({ d: sleeve, far: isFar, part: 'arm' });
    const leg = slice(get(s ? L_HIP : R_HIP), get(s ? L_KNEE : R_KNEE), PROFILE.thigh, 0.46, 1.08);
    if (leg) shortsLegs.push({ d: leg, far: isFar, part: 'leg' });
  }

  let torso: string | null = null;
  let torsoBetween: ((t0: number, t1: number, grow: number) => string) | null = null;
  let trunkAt: ((t: number) => Pt) | null = null;
  let trunkNormal: Pt | null = null;
  if (sh && hp) {
    const down = unit(sub(hp, sh));
    let n = perp(down);
    if (n.x * forward.x + n.y * forward.y < 0) n = mul(n, -1); // n → anterior
    const top = sub(sh, mul(down, 0.035 * H));
    const span = dist(sh, hp) + 0.035 * H;
    trunkAt = (t: number) => add(top, mul(down, t * span));
    trunkNormal = n;
    const hipSpread = lh && rh ? Math.abs(lh.x - rh.x) : 0;
    const halfFront = TORSO_FRONT_HALF.map((w, i) => {
      // Measured spreads keep the person's own shoulder/hip breadth.
      const t = TORSO_T[i];
      const floor = t < 0.3 ? shoulderSpread / 2 + 0.03 * H : t > 0.7 ? hipSpread / 2 + 0.05 * H : 0;
      return Math.max(w * H, floor);
    });
    const offsetAt = (t: number, side: number[]) => {
      let i = 0;
      while (i < TORSO_T.length - 2 && TORSO_T[i + 1] < t) i++;
      const u = clamp((t - TORSO_T[i]) / (TORSO_T[i + 1] - TORSO_T[i]), 0, 1);
      const lerp = (arr: number[]) => arr[i] + (arr[i + 1] - arr[i]) * u;
      return lerp(side) * H * sideness + lerp(halfFront) * frontness;
    };
    // Outline of the trunk between two levels, optionally grown (clothing).
    torsoBetween = (t0: number, t1: number, grow: number) => {
      const ts = Array.from({ length: 7 }, (_, k) => t0 + ((t1 - t0) * k) / 6);
      const fronts = ts.map((t) => add(trunkAt!(t), mul(n, offsetAt(t, TORSO_SIDE_FRONT) * grow)));
      const backs = ts.map((t) => sub(trunkAt!(t), mul(n, offsetAt(t, TORSO_SIDE_BACK) * grow)));
      return closedCurve([...fronts, ...backs.reverse()]);
    };
    torso = torsoBetween(0, 1.04, 1);
  }

  // Head: sized from stature, centred over the ears, tilted with the neck.
  // Head landmarks must sit above the shoulders; junk (or a head cropped out
  // of frame) falls back to a head placed from the shoulders.
  const trunkUp = sh && hp ? unit(sub(sh, hp)) : { x: 0, y: -1 };
  const headOk = (p: Pt | null): Pt | null =>
    p && (!sh || (dot(sub(p, sh), trunkUp) > 0.03 * H && dist(p, sh) < 0.2 * H)) ? p : null;
  const le = headOk(get(L_EAR));
  const re = headOk(get(R_EAR));
  const nose = headOk(get(NOSE));
  const ear = le && re ? mid(le, re) : (le ?? re);
  let head: Ellipse | null = null;
  let neck: string | null = null;
  let skull: SkullShapes | null = null;
  // Square-on, MediaPipe's depth tells a face from the back of the head.
  const nz = L[NOSE]?.z;
  const ez = [L[L_EAR]?.z, L[R_EAR]?.z].filter((z): z is number => typeof z === 'number');
  const faceToCamera = typeof nz === 'number' && ez.length ? nz < ez.reduce((a, b) => a + b, 0) / ez.length : true;
  const anchor =
    ear ?? (nose ? add(nose, { x: -m.facing * 0.06 * H * sideness, y: 0 }) : sh ? add(sh, mul(trunkUp, 0.1 * H)) : null);
  if (anchor) {
    const up = sh ? unit(sub(anchor, sh)) : { x: 0, y: -1 };
    const tilt = clamp((Math.atan2(up.x, -up.y) * 180) / Math.PI, -35, 35);
    const f = m.facing * sideness;
    // In profile the head spans from behind the ear to the nose tip; the ear
    // sits a little behind and below the centre. Square-on it's centred.
    // Ear canal → nose tip is ≈ 0.065 × stature; the back of the skull is
    // ≈ 0.056 behind the ear and the nose tip stands ≈ 0.012 proud of the face.
    const face = nose && ear ? clamp(Math.abs(nose.x - ear.x), 0.03 * H, 0.1 * H) : 0.065 * H;
    const backOfHead = -0.056 * H;
    const frontOfFace = face - 0.012 * H;
    const c = add(anchor, add(mul(up, 0.006 * H), { x: f * ((backOfHead + frontOfFace) / 2), y: 0 }));
    const rx = Math.max(0.048 * H, (frontOfFace - backOfHead) / 2) * sideness + 0.045 * H * frontness;
    const ry = 0.066 * H;
    head = { cx: c.x, cy: c.y, rx, ry, rotate: tilt };
    if (sh) neck = shape(add(anchor, mul(up, -0.022 * H)), sh, PROFILE.neck, 0.05);
    skull = skullShapes({
      anchor,
      tilt,
      stature: H,
      facing: m.facing,
      frontness,
      face: nose && ear ? Math.abs(nose.x - ear.x) : null,
      faceToCamera,
    });
  }

  // ---------- skeleton ----------
  const long: Limb[] = [];
  const thin: Limb[] = [];
  const feet: Limb[] = [];
  const toes: Limb[] = [];
  const shoes: ShoeShape[] = [];
  const patellae: Figure['bones']['patellae'] = [];
  // "Dog-bone" long bone: wide epiphyses, slim shaft.
  const bone = (a: Pt | null, b: Pt | null, ends: [number, number], shaft: number) => {
    if (!a || !b || dist(a, b) < 1e-4) return null;
    const [p, d] = ends;
    const w = [p, (p + shaft) / 2, shaft, shaft, (d + shaft) / 2, d].map((v) => (v / 2) * H);
    return segmentShape(a, b, w, w, null, 0);
  };
  for (const side of ['left', 'right'] as const) {
    const s = side === 'left';
    const isFar = far(side);
    const hip = get(s ? L_HIP : R_HIP);
    const knee = get(s ? L_KNEE : R_KNEE);
    const ankle = get(s ? L_ANKLE : R_ANKLE);
    const heel = get(s ? L_HEEL : R_HEEL);
    const toe = get(s ? L_TOE : R_TOE);
    const shoulder = get(s ? L_SHOULDER : R_SHOULDER);
    const elbow = get(s ? L_ELBOW : R_ELBOW);
    const wrist = get(s ? L_WRIST : R_WRIST);
    const tip = handTip(s ? L_INDEX : R_INDEX, s ? L_PINKY : R_PINKY);
    const push = (list: Limb[], d: string | null) => d && list.push({ d, far: isFar });

    push(long, bone(hip, knee, [0.04, 0.046], 0.02)); // femur (head + condyles)
    push(long, bone(knee, ankle, [0.044, 0.028], 0.018)); // tibia
    push(long, bone(shoulder, elbow, [0.028, 0.03], 0.013)); // humerus
    if (knee && ankle) {
      // Fibula: thin, posterior in a side view, lateral when square-on.
      const ax = unit(sub(ankle, knee));
      let off = mul(perp(ax), 0.016 * H);
      if (frontDir && off.x * frontDir.x + off.y * frontDir.y > 0) off = mul(off, -1);
      push(thin, openCurve([add(mix(knee, ankle, 0.08), off), add(mix(knee, ankle, 0.5), mul(off, 0.85)), add(mix(knee, ankle, 0.96), off)]));
      // Patella sits in front of the knee.
      const pk = frontDir ? add(knee, mul(frontDir, 0.028 * H * sideness)) : knee;
      patellae.push({ cx: pk.x, cy: pk.y - 0.01 * H, r: 0.014 * H });
    }
    if (elbow && wrist) {
      // Radius + ulna: two slim parallel bones.
      const ax = unit(sub(wrist, elbow));
      const off = mul(perp(ax), 0.008 * H);
      push(thin, openCurve([add(elbow, off), add(mix(elbow, wrist, 0.5), mul(off, 1.3)), add(wrist, off)]));
      push(thin, openCurve([sub(elbow, off), sub(mix(elbow, wrist, 0.5), mul(off, 0.8)), sub(wrist, off)]));
    }
    if (wrist && tip) {
      const ax = unit(sub(tip, wrist));
      const n = perp(ax);
      for (const o of [-1, 0, 1]) {
        const base = add(mix(wrist, tip, 0.15), mul(n, o * 0.008 * H));
        push(thin, openCurve([base, add(mix(wrist, tip, 1.15), mul(n, o * 0.011 * H))]));
      }
    }
    const frame = footFrame(heel, toe, ankle, H, m.facing, frontness);
    if (frame) {
      const fb = footBones(frame);
      fb.bones.forEach((d) => push(feet, d));
      fb.toes.forEach((d) => push(toes, d));
      shoes.push({ ...shoe(frame), far: isFar });
    }
  }

  const vertebrae: Figure['bones']['vertebrae'] = [];
  let spine: string | null = null;
  const ribs: string[] = [];
  let sternum: string | null = null;
  const clavicles: string[] = [];
  const pelvis: string[] = [];
  if (trunkAt && trunkNormal) {
    const n = trunkNormal;
    // Spine sits toward the back with an S-curve: thoracic kyphosis bows it
    // back, lumbar lordosis forward. Collapses to the midline square-on.
    const curve = [
      [0.04, -0.035],
      [0.25, -0.05],
      [0.5, -0.044],
      [0.72, -0.026],
      [0.86, -0.036],
    ] as const;
    const spinePts = curve.map(([t, off]) => add(trunkAt!(t), mul(n, off * H * sideness)));
    const skullBase = ear ? add(ear, add(mul(n, -0.01 * H * sideness), { x: 0, y: 0.012 * H })) : null;
    const allPts = skullBase ? [skullBase, ...spinePts] : spinePts;
    spine = openCurve(allPts);
    // Vertebrae by arc length: the 7 cervical over the neck, then 12 thoracic
    // and 5 lumbar (≈ 61% / 39% of the trunk spine), growing toward the lumbar.
    const cum = [0];
    for (let i = 1; i < allPts.length; i++) cum.push(cum[i - 1] + dist(allPts[i - 1], allPts[i]));
    const total = cum[cum.length - 1] || 1e-6;
    const at = (s: number): Pt => {
      const d = clamp(s, 0, 1) * total;
      let j = 0;
      while (j < cum.length - 2 && cum[j + 1] < d) j++;
      const span = cum[j + 1] - cum[j] || 1e-6;
      return mix(allPts[j], allPts[j + 1], (d - cum[j]) / span);
    };
    const neckEnd = skullBase ? cum[1] / total : 0;
    const thoracicEnd = neckEnd + (1 - neckEnd) * 0.61;
    const levels: { from: number; to: number; count: number; depth: [number, number]; process: number; drop: number }[] = [
      { from: 0, to: neckEnd, count: skullBase ? 7 : 0, depth: [0.0042, 0.0055], process: 0.007, drop: 0.2 },
      { from: neckEnd, to: thoracicEnd, count: 12, depth: [0.0058, 0.0085], process: 0.013, drop: 1.4 },
      { from: thoracicEnd, to: 1, count: 5, depth: [0.0095, 0.0115], process: 0.011, drop: 0.25 },
    ];
    for (const lv of levels) {
      const step = (lv.to - lv.from) / Math.max(lv.count, 1);
      for (let i = 0; i < lv.count; i++) {
        const s = lv.from + (i + 0.5) * step;
        const c0 = at(s);
        const along = unit(sub(at(s + 0.01), at(s - 0.01)));
        // Body faces the front of the trunk; the spinous process points back.
        let front = perp(along);
        if (front.x * n.x + front.y * n.y < 0) front = mul(front, -1);
        const u = lv.count > 1 ? i / (lv.count - 1) : 0;
        const depth = (lv.depth[0] + (lv.depth[1] - lv.depth[0]) * u) * H * (1 + 0.25 * frontness);
        const half = Math.max(0.38 * step * total, 0.002 * H);
        const c = add(c0, mul(front, depth * 0.55 * sideness));
        // C7 ("vertebra prominens") has the longest neck process.
        const proc = (lv.count === 7 && i === 6 ? 0.012 : lv.process) * H * sideness;
        vertebrae.push({ cx: c.x, cy: c.y, r: Math.max(half, depth), d: vertebraPath(c, along, front, half, depth, proc, lv.drop * half) });
      }
    }
    // Ribs: arcs from the spine curving down to the front (side view) or out to
    // both flanks (square-on); 10 pairs over the upper trunk.
    // Rib length as a share of the full arc: short 1st rib, longest mid-cage,
    // and the last two "floating" ribs stop short of the front.
    const RIB_REACH = [0.55, 0.72, 0.85, 0.93, 0.98, 1, 0.98, 0.9, 0.62, 0.45];
    const down = unit(sub(trunkAt(1), trunkAt(0)));
    for (let r = 0; r < 10; r++) {
      const t = 0.06 + r * 0.05;
      const root = add(trunkAt(t), mul(n, -0.042 * H * sideness));
      const reach = RIB_REACH[r];
      for (const sgn of frontness > 0.15 ? [1, -1] : [1]) {
        // Ribs run down and forward from the spine (≈ 15–20% of the trunk lower
        // at the front), bowing out at the side.
        const lateral = mul(n, sgn * 0.078 * H * frontness * reach);
        const anterior = mul(n, (0.064 - r * 0.0015) * H * sideness * reach);
        const drop = mul(down, (0.035 + r * 0.004) * H * (0.4 + 0.6 * sideness) * reach);
        const endPt = add(add(root, mul(n, 0.042 * H * sideness * reach)), add(add(anterior, lateral), drop));
        const bow = add(mix(root, endPt, 0.5), add(mul(n, -0.012 * H * sideness), add(mul(lateral, 0.22), mul(down, -0.012 * H))));
        ribs.push(openCurve([root, bow, endPt]));
      }
    }
    if (sideness > 0.3) {
      sternum = openCurve([add(trunkAt(0.1), mul(n, 0.06 * H)), add(trunkAt(0.32), mul(n, 0.068 * H)), add(trunkAt(0.5), mul(n, 0.062 * H))]);
    } else {
      sternum = openCurve([trunkAt(0.08), trunkAt(0.3), trunkAt(0.46)]);
    }
    const notch = add(trunkAt(0.06), mul(n, 0.05 * H * sideness));
    for (const s of [ls, rs]) if (s) clavicles.push(openCurve([notch, add(mix(notch, s, 0.5), { x: 0, y: -0.008 * H }), s]));
    // Pelvis. Side view: each hip bone in profile around its hip joint —
    // iliac wing, pubis in front, ischium below/behind, obturator foramen —
    // and the sacrum + coccyx continuing the spine. Square-on: iliac blades.
    const cm = 0.0053 * H;
    const trunkPt = (o: Pt, [x, y]: [number, number]) => add(o, add(mul(n, x * cm), mul(down, y * cm)));
    if (frontness < 0.55) {
      for (const h of [lh, rh]) {
        if (!h) continue;
        const outline = closedCurve(HIP_BONE_SIDE.map((c) => trunkPt(h, c)));
        const foramen = closedCurve(OBTURATOR_SIDE.map((c) => trunkPt(h, c)));
        pelvis.push(`${outline} ${foramen}`);
      }
      const s1 = spinePts[spinePts.length - 1];
      pelvis.push(closedCurve(SACRUM_SIDE.map((c) => trunkPt(s1, c))));
    } else {
      for (const h of [lh, rh]) {
        if (!h) continue;
        const out = hp ? unit(sub(h, hp)) : { x: 0, y: 0 };
        const c = add(sub(h, mul(down, 0.045 * H)), add(mul(out, 0.02 * H * frontness), mul(n, -0.01 * H * sideness)));
        const w = (0.05 * sideness + 0.042 * frontness) * H;
        const ht = 0.04 * H;
        pelvis.push(closedCurve([
          add(c, add(mul(n, w), mul(down, -ht * 0.3))),
          add(c, mul(down, -ht)),
          add(c, add(mul(n, -w), mul(down, -ht * 0.4))),
          add(c, add(mul(n, -w * 0.5), mul(down, ht * 0.6))),
          add(h, mul(down, 0.01 * H)),
          add(c, add(mul(n, w * 0.6), mul(down, ht * 0.5))),
        ]));
      }
      if (hp) {
        const sac = add(hp, mul(n, -0.045 * H * sideness));
        pelvis.push(closedCurve([sub(sac, mul(down, 0.04 * H)), add(sac, add(mul(n, 0.012 * H), mul(down, 0.01 * H))), add(sac, mul(down, 0.045 * H)), add(sac, add(mul(n, -0.014 * H), mul(down, 0.005 * H)))]));
      }
    }
  }

  // ---------- Human view extras ----------
  let hair: string | null = null;
  let noseShape: string | null = null;
  let earShape: Ellipse | null = null;
  const eyes: Ellipse[] = [];
  const brows: string[] = [];
  let mouth: string | null = null;
  if (head) {
    // Head-local coordinates: u toward the back of the head, v up, both as
    // fractions of the head's radii; θ = 0 at the crown, positive toward the back.
    const rad = (head.rotate * Math.PI) / 180;
    const rot = (v: Pt): Pt => ({ x: v.x * Math.cos(rad) - v.y * Math.sin(rad), y: v.x * Math.sin(rad) + v.y * Math.cos(rad) });
    const backX = -m.facing;
    const local = (u: number, v: number) => add({ x: head!.cx, y: head!.cy }, rot({ x: backX * u * head!.rx, y: -v * head!.ry }));
    const onHead = (deg: number, k: number) => {
      const t = (deg * Math.PI) / 180;
      return local(Math.sin(t) * k, Math.cos(t) * k);
    };
    const arc = (from: number, to: number, k: number, steps: number) =>
      Array.from({ length: steps + 1 }, (_, i) => onHead(from + ((to - from) * i) / steps, k));
    const inner = (pts: [number, number][]) => pts.map(([u, v]) => local(u, v));
    if (frontness <= 0.6) {
      // Short haircut in profile: forehead hairline → crown → nape, with the
      // hairline wrapping above and behind the ear and a short sideburn.
      hair = closedCurve([
        ...arc(-56, 128, 1.04, 12),
        ...inner([[0.64, -0.58], [0.36, -0.4], [0.27, -0.04], [0.16, 0.25], [-0.06, 0.31], [-0.25, 0.18], [-0.29, -0.12], [-0.37, -0.08], [-0.42, 0.38], [-0.66, 0.62]]),
      ]);
    } else if (faceToCamera) {
      hair = closedCurve([...arc(-98, 98, 1.04, 10), ...inner([[-0.9, 0.08], [-0.62, 0.52], [0, 0.66], [0.62, 0.52], [0.9, 0.08]])]);
    } else {
      hair = closedCurve([...arc(-112, 112, 1.04, 10), ...inner([[-0.84, -0.5], [-0.4, -0.7], [0, -0.74], [0.4, -0.7], [0.84, -0.5]])]);
    }
    const le2 = headOk(get(L_EYE));
    const re2 = headOk(get(R_EYE));
    const fwd = rot({ x: m.facing, y: 0 });
    const dn = rot({ x: 0, y: 1 });
    const at = (o: Pt, f: number, d: number) => add(o, add(mul(fwd, f * H), mul(dn, d * H)));
    if (frontness <= 0.6) {
      if (nose) {
        // Nose ≈ 5 cm from the bridge to the tip, standing ≈ 2 cm proud of the face.
        noseShape = closedCurve([at(nose, -0.013, -0.025), at(nose, 0.0015, -0.002), at(nose, 0.0005, 0.004), at(nose, -0.007, 0.009), at(nose, -0.014, 0.006)]);
        mouth = openCurve([at(nose, -0.007, 0.022), at(nose, -0.016, 0.023)]);
      }
      // One eye in profile: from the landmarks, or set back from the nose.
      const eye = le2 && re2 ? mid(le2, re2) : (le2 ?? re2 ?? (nose ? at(nose, -0.022, -0.012) : null));
      if (eye) {
        eyes.push({ cx: eye.x, cy: eye.y, rx: 0.0042 * H, ry: 0.0032 * H, rotate: head.rotate });
        brows.push(openCurve([at(eye, -0.008, -0.007), at(eye, -0.001, -0.011), at(eye, 0.006, -0.009)]));
      }
      if (ear) earShape = { cx: ear.x, cy: ear.y, rx: 0.011 * H, ry: 0.018 * H, rotate: head.rotate };
    } else if (faceToCamera) {
      const side = rot({ x: 1, y: 0 });
      for (const e of [le2, re2]) {
        if (!e) continue;
        eyes.push({ cx: e.x, cy: e.y, rx: 0.0055 * H, ry: 0.0034 * H, rotate: head.rotate });
        brows.push(openCurve([add(e, add(mul(side, -0.008 * H), mul(dn, -0.007 * H))), add(e, mul(dn, -0.01 * H)), add(e, add(mul(side, 0.008 * H), mul(dn, -0.007 * H)))]));
      }
      if (nose) mouth = openCurve([add(nose, add(mul(side, -0.01 * H), mul(dn, 0.022 * H))), add(nose, mul(dn, 0.024 * H)), add(nose, add(mul(side, 0.01 * H), mul(dn, 0.022 * H)))]);
    }
  }

  return {
    flesh: { back, torso, neck, head, front },
    human: {
      shirt: torsoBetween ? torsoBetween(0, 0.8, 1.05) : null,
      shorts: torsoBetween ? torsoBetween(0.72, 1.08, 1.07) : null,
      sleeves,
      shortsLegs,
      shoes,
      hair,
      nose: noseShape,
      ear: earShape,
      eyes,
      brows,
      mouth,
    },
    bones: { skull, spine, vertebrae, ribs, sternum, clavicles, pelvis, long, thin, feet, toes, patellae },
    frontness,
    strokes: { bone: 0.0045 * H, fine: 0.003 * H },
  };
}
