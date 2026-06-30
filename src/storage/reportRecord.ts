import { GaitResult } from '../gait/types';
import { cadenceTip } from '../gait/insights';

/**
 * A gait scan as persisted on-device (and later synced to Supabase as a row).
 * Privacy-first: this holds only derived metrics — never video or frames.
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
}

export function buildGaitReport(
  result: GaitResult,
  scanType: string,
  id: string,
  createdAt: string,
): GaitReportRecord {
  return { id, createdAt, scanType, result, cadenceTip: cadenceTip(result.cadence) };
}
