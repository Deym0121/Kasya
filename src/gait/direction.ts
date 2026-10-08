import { PoseFrame, Landmark, LANDMARK } from './types';

const NOSE = 0;
const LEFT_EAR = 7;
const RIGHT_EAR = 8;

const seen = (p: Landmark | undefined): p is Landmark => !!p && (p.visibility ?? 0) >= 0.5;

/**
 * Per-frame direction of travel along the image x axis: +1 = moving / facing
 * toward +x, −1 = toward −x. Side-on gait events ("the foot is furthest
 * FORWARD at contact") only make sense once we know which way forward is — a
 * leftward walk, a mirrored front camera, or the return leg of a back-and-forth
 * walk all flip it.
 *
 * Cues, voted per frame and then smoothed over ~1 s:
 *  - feet point the way you travel (toe ahead of heel), one vote per foot;
 *  - the nose sits ahead of the ears;
 *  - overground, the hips translate (a double-weight vote when they clearly do;
 *    on a treadmill they don't, and the body cues carry it).
 * With no usable cue at all we fall back to +x (the historical assumption).
 */
export function travelDirection(frames: PoseFrame[]): (1 | -1)[] {
  const n = frames.length;
  if (n === 0) return [];
  const t = frames.map((f) => (f.t - frames[0].t) / 1000);
  const hipX = frames.map((f) => {
    const l = f.landmarks[LANDMARK.LEFT_HIP];
    const r = f.landmarks[LANDMARK.RIGHT_HIP];
    return l && r ? (l.x + r.x) / 2 : NaN;
  });

  const votes = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const L = frames[i].landmarks;
    let v = 0;
    for (const [heel, toe] of [
      [LANDMARK.LEFT_HEEL, LANDMARK.LEFT_FOOT_INDEX],
      [LANDMARK.RIGHT_HEEL, LANDMARK.RIGHT_FOOT_INDEX],
    ]) {
      const h = L[heel];
      const k = L[toe];
      if (seen(h) && seen(k) && Math.abs(k.x - h.x) > 0.005) v += Math.sign(k.x - h.x);
    }
    const nose = L[NOSE];
    const ears = [L[LEFT_EAR], L[RIGHT_EAR]].filter(seen);
    if (seen(nose) && ears.length) {
      const ex = ears.reduce((s, p) => s + p.x, 0) / ears.length;
      if (Math.abs(nose.x - ex) > 0.005) v += Math.sign(nose.x - ex);
    }
    votes[i] = v;
  }

  // Hip translation over a ±0.5 s window.
  let j0 = 0;
  let j1 = 0;
  for (let i = 0; i < n; i++) {
    while (j0 < i && t[i] - t[j0] > 0.5) j0++;
    while (j1 < n - 1 && t[j1 + 1] - t[i] <= 0.5) j1++;
    const dx = hipX[j1] - hipX[j0];
    const span = t[j1] - t[j0];
    // Clearly travelling: > ~0.05 frame heights per second.
    if (Number.isFinite(dx) && span > 0.25 && Math.abs(dx) / span > 0.05) votes[i] += 2 * Math.sign(dx);
  }

  // Smooth the votes over ±0.5 s so single noisy frames can't flip direction.
  const raw = new Array<number>(n).fill(0);
  j0 = 0;
  j1 = 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    while (j1 < n && t[j1] - t[i] <= 0.5) sum += votes[j1++];
    while (j0 < n && t[i] - t[j0] > 0.5) sum -= votes[j0++];
    raw[i] = Math.sign(sum);
  }

  // Undecided frames inherit the previous decided frame (leading ones the
  // first decided frame); no cue anywhere → +x.
  const out = new Array<1 | -1>(n);
  let last = 0;
  const firstDecided = raw.find((v) => v !== 0) ?? 1;
  for (let i = 0; i < n; i++) {
    if (raw[i] !== 0) last = raw[i];
    out[i] = (last || firstDecided) as 1 | -1;
  }
  return out;
}
