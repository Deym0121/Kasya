import { PoseFrame, LANDMARK } from './types';
import { findPeaks } from './signal';
import { MIN_SWING_AMPLITUDE } from './ruleEngine';

/** Each ankle's anterior–posterior position relative to the hip centre. */
function apSeries(frames: PoseFrame[], ankleIdx: number): number[] {
  return frames.map((f) => {
    const a = f.landmarks[ankleIdx];
    const lh = f.landmarks[LANDMARK.LEFT_HIP];
    const rh = f.landmarks[LANDMARK.RIGHT_HIP];
    if (!a || !lh || !rh) return 0;
    return a.x - (lh.x + rh.x) / 2;
  });
}

function smooth(a: number[], w = 5): number[] {
  if (a.length < 3) return a.slice();
  const k = Math.max(1, Math.floor(w / 2));
  const out = new Array<number>(a.length);
  for (let i = 0; i < a.length; i++) {
    let s = 0;
    let c = 0;
    for (let j = -k; j <= k; j++) {
      const idx = i + j;
      if (idx >= 0 && idx < a.length) {
        s += a[idx];
        c++;
      }
    }
    out[i] = s / c;
  }
  return out;
}

function range(a: number[]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const v of a) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

export interface FootEvents {
  left: { contacts: number[]; toeOffs: number[] };
  right: { contacts: number[]; toeOffs: number[] };
  /** all contacts across both feet, ordered in time */
  ordered: { foot: 'left' | 'right'; idx: number }[];
}

/**
 * Per-foot gait events from a side-on landmark series. In 2D walking the foot is
 * most FORWARD (ahead of the hips) around initial contact and most BACKWARD
 * around toe-off, so we take the forward extrema of each ankle as contacts and
 * the backward extrema as toe-offs. Estimates — not clinical event detection.
 */
export function detectFootEvents(frames: PoseFrame[]): FootEvents {
  const empty: FootEvents = {
    left: { contacts: [], toeOffs: [] },
    right: { contacts: [], toeOffs: [] },
    ordered: [],
  };
  if (frames.length < 6) return empty;
  const durationSec = (frames[frames.length - 1].t - frames[0].t) / 1000;
  if (durationSec <= 0) return empty;
  const fps = (frames.length - 1) / durationSec;
  const minDistance = Math.max(2, Math.round(0.35 * fps)); // same foot ~>=0.35s apart

  const detect = (ankleIdx: number) => {
    const s = smooth(apSeries(frames, ankleIdx), 5);
    const { min, max } = range(s);
    const r = max - min;
    // Same absolute stillness floor as computeCadence: the peak thresholds
    // below are self-scaling, so without it landmark jitter on a standing
    // subject would fabricate foot contacts.
    if (r < MIN_SWING_AMPLITUDE) return { contacts: [] as number[], toeOffs: [] as number[] };
    const contacts = findPeaks(s, { minHeight: min + 0.55 * r, minDistance });
    const toeOffs = findPeaks(s.map((v) => -v), { minHeight: -max + 0.55 * r, minDistance });
    return { contacts, toeOffs };
  };

  const left = detect(LANDMARK.LEFT_ANKLE);
  const right = detect(LANDMARK.RIGHT_ANKLE);
  const ordered = [
    ...left.contacts.map((idx) => ({ foot: 'left' as const, idx })),
    ...right.contacts.map((idx) => ({ foot: 'right' as const, idx })),
  ].sort((a, b) => a.idx - b.idx);
  return { left, right, ordered };
}
