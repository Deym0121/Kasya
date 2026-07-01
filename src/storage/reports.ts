import AsyncStorage from '@react-native-async-storage/async-storage';
import { GaitReportRecord } from './reportRecord';

/**
 * On-device persistence of gait reports. Only the derived structured result is
 * stored — never video or frames. (Cloud sync to Supabase comes in Phase 2.)
 */
const KEY = 'stridefit:reports:v1';

export async function listReports(): Promise<GaitReportRecord[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as GaitReportRecord[]) : [];
  } catch {
    return [];
  }
}

export async function saveReport(record: GaitReportRecord): Promise<void> {
  const all = await listReports();
  all.unshift(record); // newest first
  await AsyncStorage.setItem(KEY, JSON.stringify(all.slice(0, 20))); // cap stored history
}

export async function getLatestReport(): Promise<GaitReportRecord | null> {
  const all = await listReports();
  return all[0] ?? null;
}
