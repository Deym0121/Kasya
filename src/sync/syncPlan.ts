import { GaitReportRecord } from '../storage/reportRecord';

/**
 * Pure sync bookkeeping (unit-tested; no IO). The synced map records which
 * local reports already have a cloud row: localId → remote uuid. Reports that
 * fall off the local 20-scan cap deliberately KEEP their cloud rows — the cloud
 * is the long history; only explicit user deletes remove remote rows.
 */

export type SyncedMap = Record<string, string>;

/** Local reports with no cloud row yet, oldest first (stable chronology). */
export function pendingReports(reports: GaitReportRecord[], map: SyncedMap): GaitReportRecord[] {
  return reports.filter((r) => !map[r.id]).reverse();
}

/** Record a pushed report; never mutates the input map. */
export function markSynced(map: SyncedMap, localId: string, remoteId: string): SyncedMap {
  return { ...map, [localId]: remoteId };
}
