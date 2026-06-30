import { MetricEstimate } from './types';

/**
 * A friendly, hedged, cadence-based coaching tip. Cadence is the one strongly
 * validated, actionable lever (re-plan), so every result is paired with one of
 * these. Wellness-only language: suggestions, never prescriptions or diagnoses.
 */
export function cadenceTip(cadence: MetricEstimate): string {
  if (cadence.confidence === 'low') {
    return "We couldn't read your cadence reliably this time. Record again with your full body in frame, good lighting, and a few steps captured.";
  }

  const spm = Math.round(cadence.value);
  if (spm < 165) {
    return `Your cadence is about ${spm} steps/min. Many runners feel smoother with quicker, lighter steps — try nudging it up a little.`;
  }
  return `Your cadence of ${spm} steps/min is in a brisk range — nice. Keep your steps light and quick.`;
}
