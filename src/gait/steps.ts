import { PoseFrame, LANDMARK } from './types';
import { median } from './signal';

/**
 * Shared step detection — the ONE source of truth for step timing. Cadence on
 * the report (ruleEngine.computeCadence), the gait graph's step markers and
 * the per-step breakdown (stepAnalysis) all read from `detectSteps`, so they
 * can never disagree with each other.
 *
 * Signal: the anterior–posterior separation of the two ankles (left x − right
 * x). It swings to one extreme as the left foot leads and to the other as the
 * right leads, so each alternating extremum is one step. Working on the raw
 * (un-rectified) separation means a lopsided gait — one long step, one short —
 * still yields every step, and the separation is direction-agnostic.
 */

/** Minimum frames before we attempt any measurement. */
export const MIN_FRAMES = 10;

/**
 * Below this rectified ankle-swing amplitude the subject is treated as still.
 * Units: frame HEIGHT (native and web analysis frames are both isotropic,
 * height-normalized — see PoseScanCamera.native / PoseScanScreen.web).
 * Landmark jitter on a standing subject reaches roughly 0.03 on this signal; a
 * real side-on walk clears 0.1 comfortably (a subject whose legs span ~40% of
 * the frame height swings ~0.13–0.3), so 0.05 leaves margin both ways. It is
 * no longer the only guard: heavier jitter that clears it still has to pass
 * the periodicity gate below.
 */
export const MIN_SWING_AMPLITUDE = 0.05;

/**
 * Minimum fore–aft ankle separation spread (5th–95th percentile, smoothed) as
 * a fraction of the subject's leg length. Scale-free, so it holds whether the
 * subject is near or far and on either platform. Real steps separate the
 * ankles by roughly ±0.3–0.8 leg lengths (a spread of ~0.6–1.6; even short
 * shuffling steps exceed 0.45); standing jitter stays far below 0.4.
 */
export const MIN_RELATIVE_SWING = 0.4;

/**
 * Minimum stride periodicity — the best normalized autocorrelation peak of the
 * ankle separation at a plausible stride lag, 0..1 — for motion to count as
 * stepping. Real walks and runs score ~0.9–1.0 even with noisy landmarks and
 * stay above ~0.5 with three turns in a 10 s capture; white jitter scores
 * ~0.1–0.3 (slowly drifting jitter can reach ~0.6, which is why it is not the
 * only gate).
 */
export const MIN_PERIODICITY = 0.4;

/**
 * Minimum autocorrelation at the exact stride period the detected steps imply.
 * Noise that happens to correlate at SOME lag rarely does so at the lag its
 * own fake "steps" imply; real walks score ~0.95+ (≥ ~0.4 even when the
 * capture is chopped up by three turns).
 */
export const MIN_STRIDE_CORRELATION = 0.25;

/**
 * Stride correlation needed (with ≥ 8 steps) before cadence is reported as
 * high confidence. A walk with several turns, or with steps split or merged
 * somewhere, lands in medium instead.
 */
export const HIGH_CONFIDENCE_PERIODICITY = 0.6;

/**
 * Why a capture did or didn't yield steps: 'too-short' (too few frames),
 * 'still' (not enough leg swing), 'no-rhythm' (movement, but no repeating
 * stride — jitter, shuffling, shifting in place), 'stepping'.
 */
export type StepStatus = 'too-short' | 'still' | 'no-rhythm' | 'stepping';

export interface StepDetection {
  /** frame indices of detected steps (alternating extrema of the ankle separation) */
  indices: number[];
  /** +1 = left ankle furthest toward +x (separation maximum), −1 = right ankle furthest toward +x */
  signs: (1 | -1)[];
  /** step times, seconds from the first frame (sub-frame refined) */
  times: number[];
  /** steps per minute while actually stepping (pauses / turns excluded); 0 = none */
  cadenceSpm: number;
  /** step-to-step intervals (s) judged to be continuous stepping */
  stepIntervals: number[];
  /** for each entry of stepIntervals, the sign of the step it starts from */
  stepIntervalSigns: (1 | -1)[];
  status: StepStatus;
  /** 0..1 how periodic the ankle motion is at its best plausible stride lag */
  periodicity: number;
  /** 0..1 autocorrelation at the stride period the detected steps imply */
  strideCorrelation: number;
  /** cadence implied by the autocorrelation stride period (an independent cross-check); 0 = none */
  periodCadenceSpm: number;
  /** peak-to-trough of the rectified separation (the absolute stillness signal) */
  swingAmplitude: number;
  /** separation spread ÷ leg length (the scale-free stillness signal); 0 = not measured */
  relativeSwing: number;
  /** |separation − median|, per frame — the gait graph's waveform */
  signal: number[];
  /** seconds from the first frame, per frame */
  frameTimes: number[];
  durationSec: number;
}

/** Anterior-posterior (horizontal) separation of the two ankles for one frame. */
export function ankleSeparation(frame: PoseFrame): number {
  const l = frame.landmarks[LANDMARK.LEFT_ANKLE];
  const r = frame.landmarks[LANDMARK.RIGHT_ANKLE];
  if (!l || !r) return 0;
  return l.x - r.x;
}

/** Centered moving average with half-width `k` samples (k = 0 → copy). */
export function smoothSeries(a: number[], k: number): number[] {
  if (k <= 0 || a.length < 3) return a.slice();
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

/** Smoothing half-width for ~0.1 s of motion at this frame rate (5 taps at 30 fps, 3 at 15). */
export function smoothingHalfWidth(fps: number): number {
  return Math.max(1, Math.round(0.05 * fps));
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Linear-interpolated resample of (times, values) onto a uniform grid at `fps`. */
function resampleUniform(times: number[], values: number[], fps: number): number[] {
  const duration = times[times.length - 1];
  const m = Math.floor(duration * fps) + 1;
  const out = new Array<number>(m);
  let j = 0;
  for (let i = 0; i < m; i++) {
    const t = i / fps;
    while (j < times.length - 2 && times[j + 1] < t) j++;
    const t0 = times[j];
    const t1 = times[j + 1] ?? t0;
    const u = t1 > t0 ? Math.max(0, Math.min(1, (t - t0) / (t1 - t0))) : 0;
    out[i] = values[j] + ((values[j + 1] ?? values[j]) - values[j]) * u;
  }
  return out;
}

/**
 * How periodic the separation signal is at a plausible stride rate (strides of
 * 0.45–3 s, i.e. ~40–265 steps/min), via normalized autocorrelation. Only a
 * local maximum that first dipped well below itself counts, so slow drift
 * (which correlates with itself at every lag) can't pass as a rhythm.
 */
interface Periodicity {
  /** best prominent autocorrelation peak at a plausible stride lag, 0..1 */
  score: number;
  /** the stride period that peak implies (s); 0 = none */
  strideSec: number;
  /** autocorrelation at an arbitrary lag (s), linearly interpolated; 0 outside the computed range */
  at: (sec: number) => number;
}

function stridePeriodicity(times: number[], sep: number[]): Periodicity {
  const duration = times[times.length - 1];
  const fps = Math.min(60, Math.max(10, (times.length - 1) / duration));
  const raw = resampleUniform(times, sep, fps);
  const mean = raw.reduce((s, v) => s + v, 0) / raw.length;
  const x = raw.map((v) => v - mean);
  const m = x.length;
  const minLag = Math.max(2, Math.round(0.45 * fps));
  const maxLag = Math.min(Math.round(3 * fps), Math.floor(m / 2));
  const none: Periodicity = { score: 0, strideSec: 0, at: () => 0 };
  if (maxLag <= minLag + 1) return none;

  const r = new Array<number>(maxLag + 2).fill(0);
  for (let k = 1; k <= maxLag + 1 && k < m; k++) {
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (let i = 0; i + k < m; i++) {
      sxy += x[i] * x[i + k];
      sxx += x[i] * x[i];
      syy += x[i + k] * x[i + k];
    }
    r[k] = sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
  }

  let best = 0;
  const candidates: { k: number; v: number }[] = [];
  let runningMin = Infinity;
  for (let k = 1; k <= maxLag; k++) {
    runningMin = Math.min(runningMin, r[k]);
    if (k < minLag) continue;
    const isPeak = r[k] >= r[k - 1] && r[k] > r[k + 1];
    if (isPeak && r[k] - runningMin >= 0.3) {
      candidates.push({ k, v: r[k] });
      if (r[k] > best) best = r[k];
    }
  }
  const at = (sec: number) => {
    const pos = sec * fps;
    if (!(pos >= 1) || pos > maxLag) return 0;
    const k0 = Math.floor(pos);
    return r[k0] + (r[k0 + 1] - r[k0]) * (pos - k0);
  };
  if (best <= 0) return { ...none, at };
  // The fundamental is the first strong peak (later ones are 2×, 3× the stride).
  const fundamental = candidates.find((c) => c.v >= 0.7 * best)!;
  const k = fundamental.k;
  const denom = r[k - 1] - 2 * r[k] + r[k + 1];
  const offset = denom < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (r[k - 1] - r[k + 1])) / denom)) : 0;
  return { score: Math.max(0, Math.min(1, best)), strideSec: (k + offset) / fps, at };
}

/** Typical hip-to-ankle height of the subject (frame units) — the body-size yardstick. */
function legLength(frames: PoseFrame[]): number {
  const lens: number[] = [];
  for (const f of frames) {
    const lh = f.landmarks[LANDMARK.LEFT_HIP];
    const rh = f.landmarks[LANDMARK.RIGHT_HIP];
    const la = f.landmarks[LANDMARK.LEFT_ANKLE];
    const ra = f.landmarks[LANDMARK.RIGHT_ANKLE];
    const seen = [lh, rh, la, ra].every((p) => p && (p.visibility ?? 1) >= 0.5);
    if (seen) lens.push((la.y - lh.y + (ra.y - rh.y)) / 2);
  }
  // Too few trustworthy frames → unknown (0), and the scale-free check is skipped.
  return lens.length >= frames.length / 3 ? median(lens) : 0;
}

/** Alternating extrema with hysteresis `delta` (each swing must travel at least delta). */
function alternatingExtrema(s: number[], delta: number): { idx: number; sign: 1 | -1 }[] {
  const out: { idx: number; sign: 1 | -1 }[] = [];
  let mx = -Infinity;
  let mn = Infinity;
  let mxPos = 0;
  let mnPos = 0;
  let seeking: 0 | 1 | -1 = 0; // 0 = undecided until the first full swing
  for (let i = 0; i < s.length; i++) {
    const v = s[i];
    if (v > mx) {
      mx = v;
      mxPos = i;
    }
    if (v < mn) {
      mn = v;
      mnPos = i;
    }
    if (seeking !== -1 && v < mx - delta) {
      out.push({ idx: mxPos, sign: 1 });
      mn = v;
      mnPos = i;
      seeking = -1;
    } else if (seeking !== 1 && v > mn + delta) {
      out.push({ idx: mnPos, sign: -1 });
      mx = v;
      mxPos = i;
      seeking = 1;
    }
  }
  // An "extremum" sitting on the very first/last sample is a capture edge, not a step.
  return out.filter((e) => e.idx > 0 && e.idx < s.length - 1);
}

function refineTime(s: number[], times: number[], i: number): number {
  if (i <= 0 || i >= s.length - 1) return times[i];
  const denom = s[i - 1] - 2 * s[i] + s[i + 1];
  if (denom === 0) return times[i];
  const offset = Math.max(-0.5, Math.min(0.5, (0.5 * (s[i - 1] - s[i + 1])) / denom));
  const dt = offset >= 0 ? times[i + 1] - times[i] : times[i] - times[i - 1];
  return times[i] + offset * dt;
}

/** Detect steps (and how trustworthy the stepping rhythm is) from a side-on capture. */
export function detectSteps(frames: PoseFrame[]): StepDetection {
  const n = frames.length;
  const frameTimes = frames.map((f) => (f.t - (frames[0]?.t ?? 0)) / 1000);
  const durationSec = n ? frameTimes[n - 1] : 0;
  const sep = frames.map(ankleSeparation);
  const baseline = median(sep);
  const signal = sep.map((v) => Math.abs(v - baseline));
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of signal) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const swingAmplitude = n ? hi - lo : 0;
  const none: StepDetection = {
    indices: [],
    signs: [],
    times: [],
    cadenceSpm: 0,
    stepIntervals: [],
    stepIntervalSigns: [],
    status: 'too-short',
    periodicity: 0,
    strideCorrelation: 0,
    periodCadenceSpm: 0,
    swingAmplitude,
    relativeSwing: 0,
    signal,
    frameTimes,
    durationSec: Math.max(0, durationSec),
  };
  if (n < MIN_FRAMES || durationSec <= 0) return none;
  // No meaningful ankle swing → not walking → no steps.
  if (swingAmplitude < MIN_SWING_AMPLITUDE) return { ...none, status: 'still' };

  const fps = (n - 1) / durationSec;
  const s = smoothSeries(sep, smoothingHalfWidth(fps));
  const sorted = [...s].sort((a, b) => a - b);
  const spread = quantile(sorted, 0.95) - quantile(sorted, 0.05);
  const leg = legLength(frames);
  // Swing relative to body size: real steps separate the ankles by a large
  // fraction of leg length; jitter doesn't, however close the camera is.
  const relativeSwing = leg > 0.05 ? spread / leg : 0;
  const period = stridePeriodicity(frameTimes, sep);
  const diag: StepDetection = {
    ...none,
    status: 'stepping',
    periodicity: period.score,
    periodCadenceSpm: period.strideSec > 0 ? 120 / period.strideSec : 0,
    relativeSwing,
  };
  if (leg > 0.05 && relativeSwing < MIN_RELATIVE_SWING) return { ...diag, status: 'still' };

  const extrema = alternatingExtrema(s, 0.35 * spread);
  const indices = extrema.map((e) => e.idx);
  const signs = extrema.map((e) => e.sign);
  const times = indices.map((i) => refineTime(s, frameTimes, i));

  // Stride (same-foot) intervals are immune to left/right timing differences,
  // so they anchor what counts as continuous stepping: anything much longer
  // is a pause, a turn or a missed step and is left out of the cadence.
  const strides: number[] = [];
  for (let i = 2; i < times.length; i++) strides.push(times[i] - times[i - 2]);
  const stepIntervals: number[] = [];
  const stepIntervalSigns: (1 | -1)[] = [];
  let cadenceSpm = 0;
  if (strides.length) {
    const medStride = median(strides);
    const keptStrides = strides.filter((v) => v >= 0.6 * medStride && v <= 1.4 * medStride);
    if (keptStrides.length) {
      cadenceSpm = 120 / (keptStrides.reduce((a, b) => a + b, 0) / keptStrides.length);
    }
    for (let i = 1; i < times.length; i++) {
      const dt = times[i] - times[i - 1];
      if (dt > 0 && dt <= 0.9 * medStride) {
        stepIntervals.push(dt);
        stepIntervalSigns.push(signs[i - 1]);
      }
    }
  } else if (times.length === 2 && times[1] > times[0]) {
    cadenceSpm = 60 / (times[1] - times[0]);
    stepIntervals.push(times[1] - times[0]);
    stepIntervalSigns.push(signs[0]);
  }
  // Does the signal actually repeat at the stride the steps imply? Checked at
  // that specific lag (not the best lag anywhere), so noise rarely passes.
  const strideCorrelation = cadenceSpm > 0 ? period.at(120 / cadenceSpm) : 0;

  // No stride-periodic motion → jitter or shuffling, not stepping. The extrema
  // detector is self-scaling, so without this gate heavy landmark jitter on a
  // standing subject would still "count" steps (and at high confidence).
  if (indices.length < 2 || period.score < MIN_PERIODICITY || strideCorrelation < MIN_STRIDE_CORRELATION) {
    return { ...diag, status: 'no-rhythm', strideCorrelation };
  }

  return {
    ...diag,
    indices,
    signs,
    times,
    cadenceSpm,
    stepIntervals,
    stepIntervalSigns,
    strideCorrelation,
  };
}
