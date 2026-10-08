import { PoseFrame, GaitResult, CaptureQuality, MetricEstimate, Confidence, LANDMARK, KEY_LANDMARKS } from './types';
import { detectSteps, StepDetection, HIGH_CONFIDENCE_PERIODICITY } from './steps';

export { MIN_SWING_AMPLITUDE, MIN_RELATIVE_SWING, MIN_PERIODICITY } from './steps';

/** Output of cadence computation (cadence plus the raw counts it derives from). */
export interface CadenceResult {
  cadence: MetricEstimate;
  stepCount: number;
  durationSec: number;
}

function cadenceFromDetection(det: StepDetection): CadenceResult {
  const stepCount = det.indices.length;
  if (stepCount < 2 || det.cadenceSpm <= 0) {
    return { cadence: { value: 0, unit: 'spm', confidence: 'low' }, stepCount, durationSec: det.durationSec };
  }
  // High confidence needs plenty of steps AND a signal that clearly repeats at
  // exactly the stride those steps imply (split / merged steps break that).
  const confidence: Confidence =
    stepCount >= 8 && det.strideCorrelation >= HIGH_CONFIDENCE_PERIODICITY
      ? 'high'
      : stepCount >= 3
        ? 'medium'
        : 'low';
  return { cadence: { value: det.cadenceSpm, unit: 'spm', confidence }, stepCount, durationSec: det.durationSec };
}

/**
 * Cadence (steps/min) from a side-on landmark time-series.
 *
 * Steps are the alternating extremes of the ankles' fore–aft separation (see
 * steps.ts). Cadence comes from the time between steps while actually stepping
 * — so a pause or a turn doesn't drag it down — and requires a genuinely
 * periodic stride, so landmark jitter on a standing subject can't fabricate
 * one. This is the one strongly-validated, regulation-safe metric (re-plan).
 */
export function computeCadence(frames: PoseFrame[]): CadenceResult {
  return cadenceFromDetection(detectSteps(frames));
}

const ANKLE_LANDMARKS: number[] = [LANDMARK.LEFT_ANKLE, LANDMARK.RIGHT_ANKLE];

function qualityFromDetection(frames: PoseFrame[], det: StepDetection, stepCount: number): CaptureQuality {
  if (frames.length === 0) {
    return { visibilityScore: 0, gaitCyclesDetected: 0, ok: false, issues: ['No frames captured.'] };
  }

  let totalFraction = 0;
  let ankleFraction = 0;
  for (const frame of frames) {
    let visible = 0;
    for (const idx of KEY_LANDMARKS) {
      const lm = frame.landmarks[idx];
      if (lm && (lm.visibility ?? 0) >= 0.5) visible++;
    }
    totalFraction += visible / KEY_LANDMARKS.length;
    let anklesVisible = 0;
    for (const idx of ANKLE_LANDMARKS) {
      const lm = frame.landmarks[idx];
      if (lm && (lm.visibility ?? 0) >= 0.5) anklesVisible++;
    }
    ankleFraction += anklesVisible / ANKLE_LANDMARKS.length;
  }
  const visibilityScore = totalFraction / frames.length;
  const ankleVisibility = ankleFraction / frames.length;
  const gaitCyclesDetected = Math.floor(stepCount / 2);

  const issues: string[] = [];
  if (visibilityScore < 0.6) {
    issues.push('Body not clearly visible — improve lighting and keep your full body in frame.');
  }
  // Cadence comes from the ankles alone, so they must be visible specifically —
  // the six-landmark average can pass while both ankles are hidden.
  if (visibilityScore >= 0.6 && ankleVisibility < 0.6) {
    issues.push('We couldn’t see your ankles clearly — keep your lower legs in frame with good lighting.');
  }
  if (det.status === 'still') {
    issues.push('We couldn’t see enough leg movement — try a side-on view with your whole body in frame.');
  } else if (det.status === 'no-rhythm') {
    // Movement, but no repeating stride — jitter, shuffling or standing in place.
    issues.push(
      'We couldn’t find a steady stepping rhythm — keep walking (or running) side-on for the whole capture.',
    );
  }
  if (gaitCyclesDetected < 2) {
    issues.push('Not enough walking captured — record several strides by walking back and forth across the frame, or on a treadmill.');
  }

  return { visibilityScore, gaitCyclesDetected, ok: issues.length === 0, issues };
}

/**
 * Assess whether a capture is good enough to surface metrics. Flags poor
 * landmark visibility, too little or non-rhythmic leg movement, and too-few
 * gait cycles rather than emitting a confident-looking but unreliable number.
 */
export function assessCaptureQuality(frames: PoseFrame[], stepCount: number): CaptureQuality {
  return qualityFromDetection(frames, detectSteps(frames), stepCount);
}

/** Full deterministic gait pass: cadence + capture quality, with trust gating. */
export function analyzeGait(frames: PoseFrame[]): GaitResult {
  const det = detectSteps(frames);
  const { cadence, stepCount, durationSec } = cadenceFromDetection(det);
  const captureQuality = qualityFromDetection(frames, det, stepCount);
  // A poor capture can't yield a trustworthy number, whatever the math says.
  const gatedCadence: MetricEstimate = captureQuality.ok ? cadence : { ...cadence, confidence: 'low' };
  return { cadence: gatedCadence, stepCount, durationSec, captureQuality };
}

/**
 * The rectified ankle-separation signal plus detected step indices and per-frame
 * times (seconds). Used to draw the gait graph and to derive step rhythm. The
 * step markers are the very steps the cadence was computed from.
 */
export function gaitSignal(frames: PoseFrame[]): {
  signal: number[];
  stepIndices: number[];
  times: number[];
} {
  if (frames.length < 2) return { signal: [], stepIndices: [], times: [] };
  const det = detectSteps(frames);
  return { signal: det.signal, stepIndices: det.indices, times: det.frameTimes };
}
