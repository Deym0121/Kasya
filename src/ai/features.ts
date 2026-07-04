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

/**
 * The fuller de-identified feature set the AI COACH sees — the whole scan's
 * numbers so it can guide on any of them. Still numbers only: never name/email/id,
 * never landmarks or imagery. `focus` lets the user steer coaching to one metric.
 */
export interface CoachFeatures extends GaitFeatures {
  bouncePct?: number;
  overstrideScore?: number;
  rhythmPct?: number;
  symmetryPct?: number;
  kneeFlexionDeg?: number;
  stancePct?: number;
  stepTimeSec?: number;
  hipDropPct?: number;
  baseWidthPct?: number;
  swayPct?: number;
  rearSymmetryPct?: number;
  focus?: string;
}

export function buildCoachFeatures(report: GaitReportRecord, focus?: string): CoachFeatures {
  const base = buildGaitFeatures(report);
  const m = report.metrics;
  const s = report.steps;
  const fr = report.frontal;
  return {
    ...base,
    bouncePct: m?.verticalOscillationPct,
    overstrideScore: m?.overstrideScore,
    rhythmPct: m?.rhythmRegularityPct,
    symmetryPct: m?.symmetryPct,
    kneeFlexionDeg: m?.kneeFlexionRangeDeg,
    stancePct: s?.stanceRatioPct,
    stepTimeSec: s?.meanStepTimeSec != null ? Math.round(s.meanStepTimeSec * 100) / 100 : undefined,
    hipDropPct: fr?.metrics.hipDropPct,
    baseWidthPct: fr?.metrics.stepWidthPct,
    swayPct: fr?.metrics.lateralSwayPct,
    rearSymmetryPct: fr?.metrics.symmetryPct,
    focus: focus || undefined,
  };
}
