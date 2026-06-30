import { GaitReportRecord } from '../storage/reportRecord';

/** De-identified numeric features sent to the LLM. Never name / email / id. */
export interface GaitFeatures {
  goal: string;
  cadenceSpm: number;
  cadenceConfidence: string;
  stepCount: number;
  durationSec: number;
  captureOk: boolean;
  visibilityPct: number;
  gaitCycles: number;
}

export function buildGaitFeatures(report: GaitReportRecord): GaitFeatures {
  const r = report.result;
  return {
    goal: report.scanType,
    cadenceSpm: Math.round(r.cadence.value),
    cadenceConfidence: r.cadence.confidence,
    stepCount: r.stepCount,
    durationSec: Math.round(r.durationSec),
    captureOk: r.captureQuality.ok,
    visibilityPct: Math.round(r.captureQuality.visibilityScore * 100),
    gaitCycles: r.captureQuality.gaitCyclesDetected,
  };
}
