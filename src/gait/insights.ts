import { MetricEstimate } from './types';

/**
 * Scan goals (see src/goals.ts) whose cadence norms are walking-shaped —
 * typically about 90–130 steps/min — rather than running-shaped.
 */
const WALKING_GOALS = ['walking', 'daily_comfort', 'recovery'];

/** Whether a scan goal should be coached against walking cadence bands. */
export function isWalkingGoal(goal?: string): boolean {
  return goal != null && WALKING_GOALS.includes(goal);
}

/**
 * A friendly, hedged, cadence-based coaching tip. Cadence is the one strongly
 * validated, actionable lever (re-plan), so every result is paired with one of
 * these. Wellness-only language: suggestions, never prescriptions or diagnoses.
 * Goal-aware: walkers are read against walking bands, not running ones.
 */
export function cadenceTip(cadence: MetricEstimate, goal?: string): string {
  if (cadence.confidence === 'low') {
    return "We couldn't read your cadence reliably this time. Record again with your full body in frame, good lighting, and a few steps captured.";
  }

  const spm = Math.round(cadence.value);
  if (isWalkingGoal(goal)) {
    if (spm < 95) {
      return `Your cadence is about ${spm} steps/min. Many walkers feel smoother with slightly quicker, lighter steps — a gentle nudge upward can be worth a try.`;
    }
    if (spm <= 130) {
      return `Your cadence of about ${spm} steps/min sits in the typical walking range (roughly 90–130) — a comfortable step rate. Keep it easy.`;
    }
    return `Your cadence of about ${spm} steps/min is a brisk pace for walking — nice. Keep your steps light and easy.`;
  }

  if (spm < 165) {
    return `Your cadence is about ${spm} steps/min. Many runners feel smoother with quicker, lighter steps — try nudging it up a little.`;
  }
  return `Your cadence of about ${spm} steps/min is in a brisk range — nice. Keep your steps light and quick.`;
}

export interface CadenceVerdict {
  /** literally inside the typical band named in `line` */
  inRange: boolean;
  /** one hedged sentence answering "is my number OK?" */
  line: string;
}

/**
 * A one-line, goal-aware verdict for the cadence hero — answers "is my number
 * OK?" against the same bands cadenceTip / buildFeedback already coach with:
 * roughly 90–130 steps/min for walking-shaped goals, roughly 160–180 for
 * running. Sitting above the band reads as brisk — a neutral-to-nice
 * observation, never a concern — mirroring the existing coaching copy.
 */
export function cadenceVerdict(cadenceSpm: number, goal?: string): CadenceVerdict {
  const walking = isWalkingGoal(goal);
  const lo = walking ? 90 : 160;
  const hi = walking ? 130 : 180;
  const range = `Typical ${walking ? 'walking' : 'running'} range is about ${lo}–${hi} steps per minute`;
  const spm = Math.round(cadenceSpm);
  if (spm < lo) return { inRange: false, line: `${range} — yours sits a bit below it.` };
  if (spm > hi) {
    return {
      inRange: false,
      line: `${range} — yours sits a bit above it, a ${walking ? 'brisk walking pace' : 'quick step rate'}.`,
    };
  }
  return { inRange: true, line: `${range} — yours sits inside it.` };
}
