import type { Landmark, PoseFrame } from '../gait/types';
import { isValid } from './motion';

/**
 * Per-clip body measurements for the 3D gait replay (three/rig.ts), taken from
 * the subject's own skeleton so the figure has their size, the direction they
 * walked and the side that faced the camera. Pure (no RN imports), unit-tested.
 *
 * Proportions are adult anthropometric averages (segment lengths ≈ Drillis &
 * Contini / Winter). They shape the drawing only — nothing here is a
 * measurement of the user.
 */

type Pt = { x: number; y: number };
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const L_SHOULDER = 11;
const R_SHOULDER = 12;
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
const L_EAR = 7;
const R_EAR = 8;

function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : null;
}

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
