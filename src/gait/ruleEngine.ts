import {
  PoseFrame,
  GaitResult,
  CaptureQuality,
  MetricEstimate,
  Confidence,
  LANDMARK,
  KEY_LANDMARKS,
} from './types';
import { median, findPeaks } from './signal';

/** Output of cadence computation (cadence plus the raw counts it derives from). */
export interface CadenceResult {
  cadence: MetricEstimate;
  stepCount: number;
  durationSec: number;
}

/** Minimum frames before we attempt any measurement. */
const MIN_FRAMES = 10;
/** Below this signal range (normalized units) the subject is treated as still. */
const STILLNESS_EPSILON = 1e-4;

const ZERO_CADENCE: MetricEstimate = { value: 0, unit: 'spm', confidence: 'low' };

/** Anterior-posterior (horizontal) separation of the two ankles for one frame. */
function ankleApDifference(frame: PoseFrame): number {
  const l = frame.landmarks[LANDMARK.LEFT_ANKLE];
  const r = frame.landmarks[LANDMARK.RIGHT_ANKLE];
  if (!l || !r) return 0;
  return l.x - r.x;
}

function minMax(values: number[]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

/**
 * Cadence (steps/min) from a side-on landmark time-series.
 *
 * Steps are counted as peaks in |ankleApDifference - baseline|: the ankles split
 * maximally once per step, so each extremum of the antiphase ankle signal is one
 * step. This is the one strongly-validated, regulation-safe metric (re-plan).
 */
export function computeCadence(frames: PoseFrame[]): CadenceResult {
  if (frames.length < MIN_FRAMES) {
    return { cadence: ZERO_CADENCE, stepCount: 0, durationSec: 0 };
  }

  const durationSec = (frames[frames.length - 1].t - frames[0].t) / 1000;
  if (durationSec <= 0) {
    return { cadence: ZERO_CADENCE, stepCount: 0, durationSec: 0 };
  }

  const diff = frames.map(ankleApDifference);
  const baseline = median(diff);
  const rectified = diff.map((v) => Math.abs(v - baseline));
  const { min, max } = minMax(rectified);
  const range = max - min;

  // No meaningful side-to-side ankle motion → not walking → no steps.
  if (range < STILLNESS_EPSILON) {
    return { cadence: ZERO_CADENCE, stepCount: 0, durationSec };
  }

  const fps = (frames.length - 1) / durationSec;
  const minHeight = min + 0.5 * range;
  // Refractory of 0.2s caps detection at ~300 spm and rejects jitter doubles.
  const minDistance = Math.max(1, Math.round(0.2 * fps));

  const peaks = findPeaks(rectified, { minHeight, minDistance });
  const stepCount = peaks.length;
  const value = (stepCount / durationSec) * 60;
  const confidence: Confidence = stepCount >= 8 ? 'high' : stepCount >= 3 ? 'medium' : 'low';

  return { cadence: { value, unit: 'spm', confidence }, stepCount, durationSec };
}

/**
 * Assess whether a capture is good enough to surface metrics. Flags poor
 * landmark visibility and too-few gait cycles rather than emitting a
 * confident-looking but unreliable number.
 */
export function assessCaptureQuality(frames: PoseFrame[], stepCount: number): CaptureQuality {
  if (frames.length === 0) {
    return { visibilityScore: 0, gaitCyclesDetected: 0, ok: false, issues: ['No frames captured.'] };
  }

  let totalFraction = 0;
  for (const frame of frames) {
    let visible = 0;
    for (const idx of KEY_LANDMARKS) {
      const lm = frame.landmarks[idx];
      if (lm && (lm.visibility ?? 0) >= 0.5) visible++;
    }
    totalFraction += visible / KEY_LANDMARKS.length;
  }
  const visibilityScore = totalFraction / frames.length;
  const gaitCyclesDetected = Math.floor(stepCount / 2);

  const issues: string[] = [];
  if (visibilityScore < 0.6) {
    issues.push('Body not clearly visible — improve lighting and keep your full body in frame.');
  }
  if (gaitCyclesDetected < 2) {
    issues.push('Not enough walking captured — record several strides.');
  }

  return { visibilityScore, gaitCyclesDetected, ok: issues.length === 0, issues };
}

/** Full deterministic gait pass: cadence + capture quality, with trust gating. */
export function analyzeGait(frames: PoseFrame[]): GaitResult {
  const { cadence, stepCount, durationSec } = computeCadence(frames);
  const captureQuality = assessCaptureQuality(frames, stepCount);
  // A poor capture can't yield a trustworthy number, whatever the math says.
  const gatedCadence: MetricEstimate = captureQuality.ok ? cadence : { ...cadence, confidence: 'low' };
  return { cadence: gatedCadence, stepCount, durationSec, captureQuality };
}
