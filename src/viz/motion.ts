import type { Landmark, PoseFrame } from '../gait/types';

/**
 * Replay-only motion cleanup. The gait engine analyzes the raw landmarks; these
 * helpers only change how a saved capture is DRAWN:
 *  - short tracker dropouts are bridged so a limb doesn't blink out,
 *  - frame-to-frame jitter is removed with a centred (zero-phase) filter, so the
 *    smoothed body never lags behind the real movement,
 *  - playback blends between captured frames instead of stepping, so ~15fps
 *    captures stay fluid at 0.25× and line up with the video between frames.
 * Pure (no RN imports) so it's unit-tested in node.
 */

const DROPPED: Landmark = { x: 0, y: 0, visibility: 0 };

/** Same rule every viewer uses: dropped landmarks are stored as {0,0,visibility:0}. */
export function isValid(p: Landmark | null | undefined): p is Landmark {
  return (
    !!p &&
    (p.visibility ?? 1) > 0.2 &&
    !(p.x === 0 && p.y === 0) &&
    Number.isFinite(p.x) &&
    Number.isFinite(p.y)
  );
}

const vis = (p: Landmark) => p.visibility ?? 1;

function lerpLandmark(a: Landmark, b: Landmark, u: number, visibility: number): Landmark {
  const z = a.z != null && b.z != null ? a.z + (b.z - a.z) * u : (a.z ?? b.z);
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z, visibility };
}

/** Cubic Hermite (non-uniform Catmull-Rom) through p1→p2, using p0/p3 when present. */
function hermite(
  p0: Landmark | null,
  p1: Landmark,
  p2: Landmark,
  p3: Landmark | null,
  t0: number,
  t1: number,
  t2: number,
  t3: number,
  t: number,
): { x: number; y: number } {
  const h = t2 - t1 || 1;
  const u = (t - t1) / h;
  const slope = (a: Landmark, b: Landmark, ta: number, tb: number, axis: 'x' | 'y') => (b[axis] - a[axis]) / (tb - ta || 1);
  const m1 = (axis: 'x' | 'y') => (p0 ? slope(p0, p2, t0, t2, axis) : slope(p1, p2, t1, t2, axis)) * h;
  const m2 = (axis: 'x' | 'y') => (p3 ? slope(p1, p3, t1, t3, axis) : slope(p1, p2, t1, t2, axis)) * h;
  const h00 = 2 * u ** 3 - 3 * u ** 2 + 1;
  const h10 = u ** 3 - 2 * u ** 2 + u;
  const h01 = -2 * u ** 3 + 3 * u ** 2;
  const h11 = u ** 3 - u ** 2;
  return {
    x: h00 * p1.x + h10 * m1('x') + h01 * p2.x + h11 * m2('x'),
    y: h00 * p1.y + h10 * m1('y') + h01 * p2.y + h11 * m2('y'),
  };
}

/** Typical on-screen body height (frame units) — scales "fast" for near and far subjects alike. */
function bodySize(frames: PoseFrame[]): number {
  const spans: number[] = [];
  for (const f of frames) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of f.landmarks) {
      if (!isValid(p)) continue;
      lo = Math.min(lo, p.y);
      hi = Math.max(hi, p.y);
    }
    if (hi > lo) spans.push(hi - lo);
  }
  spans.sort((a, b) => a - b);
  return spans.length ? Math.max(spans[Math.floor(spans.length / 2)], 0.05) : 0.5;
}

function medianStep(frames: PoseFrame[]): number {
  const steps: number[] = [];
  for (let i = 1; i < frames.length; i++) {
    const d = frames[i].t - frames[i - 1].t;
    if (d > 0) steps.push(d);
  }
  if (!steps.length) return 66;
  steps.sort((a, b) => a - b);
  return steps[Math.floor(steps.length / 2)];
}

/**
 * Value at frame i of a visibility- and Gaussian-weighted local QUADRATIC fit
 * through the neighbours. Unlike a plain average, a quadratic keeps peaks and
 * turning points (a hip bounce, a foot reversing direction) where they are, so
 * it removes random wobble without flattening the movement. Falls back to the
 * weighted mean when there are too few samples for a stable fit.
 */
function fitAt(
  filled: Landmark[][],
  frames: PoseFrame[],
  i: number,
  k: number,
  radius: number,
  sigma: number,
): Landmark {
  const p = filled[i][k];
  const n = frames.length;
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0;
  let x0 = 0, x1 = 0, x2 = 0, y0 = 0, y1 = 0, y2 = 0;
  let z = 0, zw = 0, used = 0;
  for (let j = Math.max(0, i - radius); j <= Math.min(n - 1, i + radius); j++) {
    const q = filled[j][k];
    if (!isValid(q)) continue;
    const tau = (frames[j].t - frames[i].t) / sigma;
    const w = Math.exp(-0.5 * tau * tau) * Math.max(vis(q), 0.05);
    const t2 = tau * tau;
    s0 += w; s1 += w * tau; s2 += w * t2; s3 += w * t2 * tau; s4 += w * t2 * t2;
    x0 += w * q.x; x1 += w * tau * q.x; x2 += w * t2 * q.x;
    y0 += w * q.y; y1 += w * tau * q.y; y2 += w * t2 * q.y;
    if (q.z != null) { z += w * q.z; zw += w; }
    used++;
  }
  const zOut = zw > 0 ? z / zw : p.z;
  // Intercept of the quadratic fit by Cramer's rule.
  const det = s0 * (s2 * s4 - s3 * s3) - s1 * (s1 * s4 - s3 * s2) + s2 * (s1 * s3 - s2 * s2);
  if (used >= 4 && Math.abs(det) > 1e-9 * Math.max(1, s0 ** 3)) {
    const solve = (t0: number, t1: number, t2: number) =>
      (t0 * (s2 * s4 - s3 * s3) - s1 * (t1 * s4 - s3 * t2) + s2 * (t1 * s3 - s2 * t2)) / det;
    return { x: solve(x0, x1, x2), y: solve(y0, y1, y2), z: zOut, visibility: p.visibility };
  }
  return { x: x0 / s0, y: y0 / s0, z: zOut, visibility: p.visibility };
}

export interface ReplayOptions {
  /** longest dropout (ms) bridged by interpolation; longer gaps stay hidden */
  maxGapMs?: number;
  /** filter radius in frames on each side (0 disables smoothing) */
  radius?: number;
  /**
   * Speed (body heights per second) above which smoothing fades out. Joints that
   * are nearly still get the full filter (that's where wobble shows); a fast
   * swinging foot is left almost untouched so its arc isn't cut short.
   */
  fastSpeed?: number;
  /** filter width (Gaussian σ) in frames for a still joint */
  sigmaFrames?: number;
}

/**
 * Returns a cleaned COPY of the capture for drawing. Never mutates `frames`.
 * Dropouts are bridged with a curve through the motion on both sides; smoothing
 * is a visibility-weighted, speed-adaptive Gaussian over time (σ ≈ 0.9 frame for
 * a still joint, shrinking as the joint moves faster), centred so it never lags.
 */
export function prepareReplay(frames: PoseFrame[], opts: ReplayOptions = {}): PoseFrame[] {
  const n = frames?.length ?? 0;
  if (n < 2) return frames ?? [];
  const maxGapMs = opts.maxGapMs ?? 400;
  // At ~15fps (iPhone capture) only a narrow fit stays faithful to a running
  // stride; 30fps captures can afford a wider, steadier one.
  const step = medianStep(frames);
  const dense = step <= 42;
  const radius = opts.radius ?? (dense ? 3 : 2);
  const count = frames.reduce((m, f) => Math.max(m, f.landmarks.length), 0);
  const filled: Landmark[][] = frames.map((f) =>
    Array.from({ length: count }, (_, k) => (f.landmarks[k] ? { ...f.landmarks[k] } : { ...DROPPED })),
  );

  // 1. Bridge short dropouts between two good samples of the same landmark.
  for (let k = 0; k < count; k++) {
    let last = -1;
    for (let i = 0; i < n; i++) {
      if (!isValid(filled[i][k])) continue;
      if (last >= 0 && i - last > 1 && frames[i].t - frames[last].t <= maxGapMs) {
        const a = filled[last][k];
        const b = filled[i][k];
        const before = last > 0 && isValid(filled[last - 1][k]) ? last - 1 : -1;
        const after = i < n - 1 && isValid(frames[i + 1].landmarks[k]) ? i + 1 : -1;
        const span = frames[i].t - frames[last].t || 1;
        for (let j = last + 1; j < i; j++) {
          const u = (frames[j].t - frames[last].t) / span;
          const base = lerpLandmark(a, b, u, Math.min(vis(a), vis(b)));
          const c = hermite(
            before >= 0 ? filled[before][k] : null,
            a,
            b,
            after >= 0 ? frames[after].landmarks[k] : null,
            before >= 0 ? frames[before].t : 0,
            frames[last].t,
            frames[i].t,
            after >= 0 ? frames[after].t : 0,
            frames[j].t,
          );
          filled[j][k] = { ...base, x: c.x, y: c.y };
        }
      }
      last = i;
    }
  }

  if (radius <= 0) return frames.map((f, i) => ({ t: f.t, landmarks: filled[i] }));

  // 2. Zero-phase smoothing: each sample is a weighted mean of its neighbours
  //    on BOTH sides in time, so nothing is shifted later.
  const baseSigma = (opts.sigmaFrames ?? (dense ? 1.5 : 0.9)) * step;
  const fast = (opts.fastSpeed ?? 0.35) * bodySize(frames); // frame units per second
  const out: PoseFrame[] = frames.map((f) => ({ t: f.t, landmarks: new Array(count) }));
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < count; k++) {
      const p = filled[i][k];
      if (!isValid(p)) {
        out[i].landmarks[k] = p;
        continue;
      }
      // Local speed from the neighbours (falls back to one side at the ends).
      const a = filled[Math.max(0, i - 1)][k];
      const b = filled[Math.min(n - 1, i + 1)][k];
      const dtMs = frames[Math.min(n - 1, i + 1)].t - frames[Math.max(0, i - 1)].t;
      const speed = isValid(a) && isValid(b) && dtMs > 0 ? Math.hypot(b.x - a.x, b.y - a.y) / (dtMs / 1000) : 0;
      const sigma = baseSigma / (1 + (speed / fast) ** 2);
      if (sigma < 0.15 * baseSigma) {
        out[i].landmarks[k] = { ...p };
        continue;
      }
      out[i].landmarks[k] = fitAt(filled, frames, i, k, radius, sigma);
    }
  }
  return out;
}

/**
 * The pose at time `t` (same clock as frame.t), blended linearly between the two
 * captured frames around it. A landmark missing on one side snaps to the nearer
 * good sample rather than sliding in from {0,0}.
 */
export function poseAt(frames: PoseFrame[], t: number): Landmark[] {
  const n = frames?.length ?? 0;
  if (!n) return [];
  if (n === 1 || t <= frames[0].t) return frames[0].landmarks;
  if (t >= frames[n - 1].t) return frames[n - 1].landmarks;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = frames[lo];
  const b = frames[hi];
  const u = (t - a.t) / (b.t - a.t || 1);
  const count = Math.max(a.landmarks.length, b.landmarks.length);
  const out: Landmark[] = new Array(count);
  for (let k = 0; k < count; k++) {
    const p = a.landmarks[k];
    const q = b.landmarks[k];
    const pv = isValid(p);
    const qv = isValid(q);
    if (pv && qv) out[k] = lerpLandmark(p, q, u, Math.min(vis(p), vis(q)));
    else if (pv && u < 0.5) out[k] = p;
    else if (qv && u >= 0.5) out[k] = q;
    else out[k] = DROPPED;
  }
  return out;
}

/**
 * Live-camera smoothing (One Euro filter): strong smoothing while a joint is
 * still, almost none while it moves fast — steadies the overlay without the lag
 * a plain average adds. Display only; capture still records the raw landmarks.
 */
export class LiveLandmarkFilter {
  private prev: { x: number; y: number; dx: number; dy: number; t: number }[] = [];

  constructor(
    private minCutoff = 1.2,
    private beta = 8,
    private dCutoff = 1.0,
  ) {}

  reset() {
    this.prev = [];
  }

  apply<T extends { x: number; y: number }>(points: readonly T[], tMs: number): T[] {
    const alpha = (cutoff: number, dt: number) => {
      const r = 2 * Math.PI * cutoff * dt;
      return r / (r + 1);
    };
    return points.map((p, k) => {
      const s = this.prev[k];
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !s || tMs <= s.t) {
        if (p && Number.isFinite(p.x)) this.prev[k] = { x: p.x, y: p.y, dx: 0, dy: 0, t: tMs };
        return p;
      }
      const dt = Math.min((tMs - s.t) / 1000, 0.5);
      const ad = alpha(this.dCutoff, dt);
      const dx = ad * ((p.x - s.x) / dt) + (1 - ad) * s.dx;
      const dy = ad * ((p.y - s.y) / dt) + (1 - ad) * s.dy;
      const speed = Math.hypot(dx, dy);
      const a = alpha(this.minCutoff + this.beta * speed, dt);
      const x = a * p.x + (1 - a) * s.x;
      const y = a * p.y + (1 - a) * s.y;
      this.prev[k] = { x, y, dx, dy, t: tMs };
      return { ...p, x, y };
    });
  }
}
