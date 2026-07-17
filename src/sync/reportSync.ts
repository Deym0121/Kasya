import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabase } from '../supabase/client';
import { listReports } from '../storage/reports';
import { toGaitReportRow } from '../storage/reportRecord';
import { pendingReports, markSynced, SyncedMap } from './syncPlan';

/**
 * Cloud sync for scan reports — push-only, offline-first, privacy-bounded.
 *
 * Every row is built EXCLUSIVELY by toGaitReportRow (unit-tested to strip the
 * landmark frames), so nothing biometric-adjacent can reach the server. Sync is
 * fire-and-forget: failures leave reports pending and the next call retries.
 * Signed-out / cloud-off runs are no-ops — the app stays fully local.
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

export interface SyncOutcome {
  pushed: number;
  skipped: 'cloud-off' | 'signed-out' | null;
}

/** Push any local reports that don't have a cloud row yet. Safe to call anytime. */
export async function syncReports(): Promise<SyncOutcome> {
  const sb = getSupabase();
  if (!sb) return { pushed: 0, skipped: 'cloud-off' };
  const { data } = await sb.auth.getSession();
  const uid = data.session?.user?.id;
  if (!uid) return { pushed: 0, skipped: 'signed-out' };

  const [reports, initialMap] = await Promise.all([listReports(), readMap()]);
  let map = initialMap;
  let pushed = 0;
  for (const report of pendingReports(reports, map)) {
    const row = { ...toGaitReportRow(report), user_id: uid, created_at: report.createdAt };
    const { data: inserted, error } = await sb.from('gait_reports').insert(row).select('id').single();
    if (error || !inserted?.id) break; // offline / RLS hiccup — retry on the next sync
    map = markSynced(map, report.id, inserted.id as string);
    pushed++;
  }
  if (pushed > 0) await writeMap(map);
  return { pushed, skipped: null };
}

/** Remove one report's cloud row after a local delete (no-op when never synced). */
export async function deleteRemoteReport(localId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const map = await readMap();
  const remoteId = map[localId];
  if (!remoteId) return;
  const { error } = await sb.from('gait_reports').delete().eq('id', remoteId);
  if (!error) {
    delete map[localId];
    await writeMap(map);
  }
}

/** Remove ALL of the user's cloud scan rows (History → Clear all). */
export async function clearRemoteReports(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { data } = await sb.auth.getSession();
  const uid = data.session?.user?.id;
  if (!uid) return;
  const { error } = await sb.from('gait_reports').delete().eq('user_id', uid);
  if (!error) await writeMap({});
}
