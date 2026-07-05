import { GaitResult, PoseFrame } from '../gait/types';
import { cadenceTip } from '../gait/insights';
import { buildDetail, buildFrontalDetail, GaitGraphData } from '../gait/detailed';
import { FormMetrics, GaitFeedback } from '../gait/form';
import { StepAnalysis } from '../gait/stepAnalysis';
import { FrontalAnalysis } from '../gait/frontal';

/**
 * A gait scan as persisted on-device (and later synced to Supabase as a row).
 * Privacy-first: holds only derived metrics + a downsampled skeleton for replay
 * — never video or frames.
 *
 * Kept free of any React Native import so it can be unit-tested in node.
 */
export interface GaitReportRecord {
  id: string;
  /** ISO-8601 timestamp */
  createdAt: string;
  scanType: string;
  result: GaitResult;
  /** the hedged, cadence-based coaching tip shown with the result */
  cadenceTip: string;
  // Present when the scan captured real (or synthetic) motion:
  metrics?: FormMetrics;
  feedback?: GaitFeedback;
  graph?: GaitGraphData;
  steps?: StepAnalysis;
  /** per-step "what's happening" walkthrough */
  walkthrough?: string[];
  /** downsampled landmark motion for the slow-mo replay (NOT video) */
  frames?: PoseFrame[];
  /** the optional rear-view (frontal-plane) pass, when a second angle was captured */
  frontal?: FrontalAnalysis;
  /** downsampled rear-view landmark motion for its replay (NOT video) */
  frontalFrames?: PoseFrame[];
}

/**
 * The exact, allowed column set for the (future) Supabase `gait_reports` row.
 * Anything not in this list — crucially `frames`/`frontalFrames` (landmark motion
 * tracks) — must never reach the server.
 */
export const GAIT_REPORT_ROW_KEYS = [
  'scan_type',
  'cadence',
  'overstride_estimate',
  'knee_flexion_range',
  'metrics',
  'capture_quality',
  'symmetry_score',
  'knee_valgus_score',
  'hip_drop_score',
  'summary',
  'recommendation_summary',
] as const;

export interface GaitReportRow {
  scan_type: string;
  cadence: number | null;
  overstride_estimate: number | null;
  knee_flexion_range: number | null;
  metrics: Record<string, unknown> | null;
  capture_quality: Record<string, unknown> | null;
  symmetry_score: number | null;
  knee_valgus_score: number | null;
  hip_drop_score: number | null;
  summary: string | null;
  recommendation_summary: string | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Derive the privacy-safe, numeric-only row for cloud sync from an on-device
 * report. This is the ONLY thing that should ever be inserted into Supabase —
 * built by explicit whitelist so raw landmark `frames`/`frontalFrames` (and the
 * replay graph) can never leak. Keep it in lockstep with 0001_init.sql.
 */
export function toGaitReportRow(record: GaitReportRecord): GaitReportRow {
  const c = record.result.cadence;
  const m = record.metrics;
  const f = record.frontal?.metrics;
  return {
    scan_type: record.scanType,
    cadence: num(c?.value) == null ? null : Math.round(c.value),
    overstride_estimate: num(m?.overstrideScore),
    knee_flexion_range: num(m?.kneeFlexionRangeDeg),
    metrics: {
      cadence: { value: num(c?.value) == null ? null : Math.round(c.value), confidence: c?.confidence ?? null },
      ...(m ?? {}),
    },
    capture_quality: record.result.captureQuality ? { ...record.result.captureQuality } : null,
    symmetry_score: num(m?.symmetryPct) ?? num(f?.symmetryPct),
    knee_valgus_score: null, // deliberately not computed (not defensible from 2D)
    hip_drop_score: num(f?.hipDropPct),
    summary: record.cadenceTip ?? null,
    recommendation_summary: record.walkthrough?.length ? record.walkthrough.join(' ') : null,
  };
}

export function buildGaitReport(
  result: GaitResult,
  scanType: string,
  id: string,
  createdAt: string,
  frames?: PoseFrame[],
  frontalFrames?: PoseFrame[],
): GaitReportRecord {
  const record: GaitReportRecord = {
    id,
    createdAt,
    scanType,
    result,
    cadenceTip: cadenceTip(result.cadence),
  };
  if (frames && frames.length) Object.assign(record, buildDetail(result, frames));
  if (frontalFrames && frontalFrames.length) Object.assign(record, buildFrontalDetail(frontalFrames));
  return record;
}
