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
  /** true when the scan came from the simulated (no-camera) path */
  simulated?: boolean;
}

export function buildGaitReport(
  result: GaitResult,
  scanType: string,
  id: string,
  createdAt: string,
  frames?: PoseFrame[],
  frontalFrames?: PoseFrame[],
  simulated?: boolean,
): GaitReportRecord {
  const record: GaitReportRecord = {
    id,
    createdAt,
    scanType,
    result,
    // The scan goal doubles as the cadence-coaching context (walking vs running bands).
    cadenceTip: cadenceTip(result.cadence, scanType),
  };
  if (simulated) record.simulated = true;
  if (frames && frames.length) Object.assign(record, buildDetail(result, frames, scanType));
  if (frontalFrames && frontalFrames.length) Object.assign(record, buildFrontalDetail(frontalFrames));
  return record;
}
