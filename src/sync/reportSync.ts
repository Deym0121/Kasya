import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../../convex/_generated/api';
import { getConvex } from '../convex/client';
import { currentUserId } from '../convex/auth';
import { listReports } from '../storage/reports';
import { toGaitReportRow, GaitReportRow } from '../storage/reportRecord';
import { GaitReportRecord } from '../storage/reportRecord';
import { pendingReports, markSynced, SyncedMap } from './syncPlan';

/**
 * Cloud sync for scan reports — push-only, offline-first, privacy-bounded.
 *
 * Every payload is built EXCLUSIVELY from toGaitReportRow (unit-tested to
 * strip the landmark frames), so nothing biometric-adjacent can reach the
 * server. Sync is fire-and-forget: failures leave reports pending and the
 * next call retries. Signed-out / cloud-off runs are no-ops — the app stays
 * fully local.
 */

const SYNCED_KEY = 'kasya:synced:v1';

async function readMap(): Promise<SyncedMap> {
  try {
    const raw = await AsyncStorage.getItem(SYNCED_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeMap(map: SyncedMap): Promise<void> {
  await AsyncStorage.setItem(SYNCED_KEY, JSON.stringify(map));
}

/** The snake_case row (kept for its tested frame-stripping) as Convex args. */
function toConvexArgs(report: GaitReportRecord, row: GaitReportRow) {
  return {
    localId: report.id,
    createdAt: report.createdAt,
    scanType: row.scan_type,
    cadence: row.cadence,
    overstrideEstimate: row.overstride_estimate,
    kneeFlexionRange: row.knee_flexion_range,
    metrics: row.metrics,
    captureQuality: row.capture_quality,
    symmetryScore: row.symmetry_score,
    kneeValgusScore: row.knee_valgus_score,
    hipDropScore: row.hip_drop_score,
    summary: row.summary,
    recommendationSummary: row.recommendation_summary,
  };
}

export interface SyncOutcome {
  pushed: number;
  skipped: 'cloud-off' | 'signed-out' | null;
}

// Serialize concurrent calls — sign-in and Home-focus can fire together, and two
// parallel syncs would each push the same pending reports (duplicate cloud rows).
let inFlight: Promise<SyncOutcome> | null = null;

/** Push any local reports that don't have a cloud row yet. Safe to call anytime. */
export function syncReports(): Promise<SyncOutcome> {
  if (inFlight) return inFlight;
  inFlight = doSyncReports().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function doSyncReports(): Promise<SyncOutcome> {
  const convex = getConvex();
  if (!convex) return { pushed: 0, skipped: 'cloud-off' };
  const uid = await currentUserId();
  if (!uid) return { pushed: 0, skipped: 'signed-out' };

  const [reports, initialMap] = await Promise.all([listReports(), readMap()]);
  let map = initialMap;
  let pushed = 0;
  for (const report of pendingReports(reports, map)) {
    try {
      const remoteId = await convex.mutation(api.reports.push, toConvexArgs(report, toGaitReportRow(report)));
      map = markSynced(map, report.id, String(remoteId));
      pushed++;
    } catch {
      break; // offline / auth hiccup — retry on the next sync
    }
  }
  if (pushed > 0) await writeMap(map);
  return { pushed, skipped: null };
}

/** Remove one report's cloud row after a local delete (no-op when never synced). */
export async function deleteRemoteReport(localId: string): Promise<void> {
  const convex = getConvex();
  if (!convex) return;
  const map = await readMap();
  if (!map[localId]) return;
  try {
    await convex.mutation(api.reports.remove, { localId });
    delete map[localId];
    await writeMap(map);
  } catch {
    // offline — the row stays; a future explicit delete can retry
  }
}

/**
 * Forget which reports were synced — used after account deletion so a future
 * account gets a fresh push of everything still on the device.
 */
export async function clearSyncedMap(): Promise<void> {
  await writeMap({});
}

/** Remove ALL of the user's cloud scan rows (History → Clear all). */
export async function clearRemoteReports(): Promise<void> {
  const convex = getConvex();
  if (!convex) return;
  if (!(await currentUserId())) return;
  try {
    await convex.mutation(api.reports.clear, {});
    await writeMap({});
  } catch {
    // offline — retry next time the user clears
  }
}
