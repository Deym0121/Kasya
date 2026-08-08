import AsyncStorage from '@react-native-async-storage/async-storage';
import { GaitReportRecord } from './reportRecord';

/**
 * On-device persistence of gait reports. Only the derived structured result is
 * stored — never video or frames. (Cloud sync to Supabase comes in Phase 2.)
 */
const KEY = 'stridefit:reports:v1';

/**
 * A stored record is only usable if it has the fields every screen dereferences
 * (id, createdAt, result.cadence.value, result.captureQuality). Anything else —
 * a partial write, schema drift, a stray null — is silently dropped rather than
 * crashing Home/History at render.
 */
function isUsableRecord(r: unknown): r is GaitReportRecord {
  if (!r || typeof r !== 'object') return false;
  const rec = r as Partial<GaitReportRecord>;
  return (
    typeof rec.id === 'string' &&
    typeof rec.createdAt === 'string' &&
    typeof rec.result?.cadence?.value === 'number' &&
    !!rec.result?.captureQuality &&
    typeof rec.result.captureQuality === 'object'
  );
}

export async function listReports(): Promise<GaitReportRecord[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isUsableRecord) : [];
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

export async function deleteReport(id: string): Promise<void> {
  const all = await listReports();
  await AsyncStorage.setItem(KEY, JSON.stringify(all.filter((r) => r.id !== id)));
}

export async function clearReports(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
