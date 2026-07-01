import { GaitResult, PoseFrame } from '../gait/types';
import { cadenceTip } from '../gait/insights';
import { buildDetail, GaitGraphData } from '../gait/detailed';
import { FormMetrics, GaitFeedback } from '../gait/form';

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
  /** downsampled landmark motion for the slow-mo replay (NOT video) */
  frames?: PoseFrame[];
}

export function buildGaitReport(
  result: GaitResult,
  scanType: string,
  id: string,
  createdAt: string,
  frames?: PoseFrame[],
): GaitReportRecord {
  const record: GaitReportRecord = {
    id,
    createdAt,
    scanType,
    result,
    cadenceTip: cadenceTip(result.cadence),
  };
  if (frames && frames.length) Object.assign(record, buildDetail(result, frames));
  return record;
}
