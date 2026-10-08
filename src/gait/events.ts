import { PoseFrame, LANDMARK } from './types';
import { findPeaks } from './signal';
import { MIN_SWING_AMPLITUDE, smoothSeries, smoothingHalfWidth } from './steps';
import { travelDirection } from './direction';

/**
 * Each ankle's FORWARD position relative to the hip centre: (ankle − hip) x,
 * signed by the per-frame direction of travel so "forward" means forward
 * whichever way the subject walks across the frame.
 */
function forwardSeries(frames: PoseFrame[], ankleIdx: number, dir: (1 | -1)[], from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i < to; i++) {
    const f = frames[i];
    const a = f.landmarks[ankleIdx];
    const lh = f.landmarks[LANDMARK.LEFT_HIP];
    const rh = f.landmarks[LANDMARK.RIGHT_HIP];
    out.push(a && lh && rh ? dir[i] * (a.x - (lh.x + rh.x) / 2) : 0);
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
  /** per-frame direction of travel used to orient the events (+1 = toward +x) */
  direction: (1 | -1)[];
}

/**
 * Per-foot gait events from a side-on landmark series. In 2D the foot is most
 * FORWARD (ahead of the hips) around initial contact and most BACKWARD around
 * toe-off, so we take the forward extrema of each ankle as contacts and the
 * backward extrema as toe-offs (the coordinate method of Zeni et al., applied
 * to the ankle). "Forward" follows the detected direction of travel, so a
 * leftward or mirrored walk isn't read back to front; each constant-direction
 * stretch (e.g. each leg of a back-and-forth walk) is read on its own.
 * Estimates — not clinical event detection.
 */
export function detectFootEvents(frames: PoseFrame[]): FootEvents {
  const empty: FootEvents = {
    left: { contacts: [], toeOffs: [] },
    right: { contacts: [], toeOffs: [] },
    ordered: [],
    direction: [],
  };
  if (frames.length < 6) return empty;
  const durationSec = (frames[frames.length - 1].t - frames[0].t) / 1000;
  if (durationSec <= 0) return empty;
  const fps = (frames.length - 1) / durationSec;
  const minDistance = Math.max(2, Math.round(0.35 * fps)); // same foot ~>=0.35s apart
  const halfWidth = smoothingHalfWidth(fps);
  const direction = travelDirection(frames);

  // Constant-direction stretches.
  const runs: [number, number][] = [];
  let start = 0;
  for (let i = 1; i <= frames.length; i++) {
    if (i === frames.length || direction[i] !== direction[start]) {
      runs.push([start, i]);
      start = i;
    }
  }

  const detect = (ankleIdx: number) => {
    const contacts: number[] = [];
    const toeOffs: number[] = [];
    for (const [from, to] of runs) {
      if (to - from < 6) continue;
      const s = smoothSeries(forwardSeries(frames, ankleIdx, direction, from, to), halfWidth);
      const { min, max } = range(s);
      const r = max - min;
      // Same absolute stillness floor as cadence: the peak thresholds below
      // are self-scaling, so without it landmark jitter on a standing subject
      // would fabricate foot contacts.
      if (r < MIN_SWING_AMPLITUDE) continue;
      for (const p of findPeaks(s, { minHeight: min + 0.55 * r, minDistance })) contacts.push(from + p);
      for (const p of findPeaks(
        s.map((v) => -v),
        { minHeight: -max + 0.55 * r, minDistance },
      ))
        toeOffs.push(from + p);
    }
    return { contacts, toeOffs };
  };

  const left = detect(LANDMARK.LEFT_ANKLE);
  const right = detect(LANDMARK.RIGHT_ANKLE);
  const ordered = [
    ...left.contacts.map((idx) => ({ foot: 'left' as const, idx })),
    ...right.contacts.map((idx) => ({ foot: 'right' as const, idx })),
  ].sort((a, b) => a.idx - b.idx);
  return { left, right, ordered, direction };
}
