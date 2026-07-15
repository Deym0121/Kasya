import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Optional, honest fit inputs the buyer sets once — used to feed the AI shoe
 * recommender and to pre-fill the marketplace search (size / width / budget).
 * NOT a foot-type / pronation diagnosis: just preferences that make the picks
 * and the Shopee/TikTok search more useful. Every field is optional.
 */
export interface FitProfile {
  /** free-text shoe size, e.g. "US 9" */
  sizeLabel?: string;
  /** many affordable / China-brand shoes run narrow, so wide-fit is worth asking */
  width?: 'regular' | 'wide';
  /** cap the marketplace search at this PHP price */
  budgetMaxPhp?: number;
}

const KEY = 'kasya:fit:v1';

/** Keep only valid, cleaned fields — junk never persists or reaches the AI. */
export function normalizeFitProfile(raw: unknown): FitProfile {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const out: FitProfile = {};
  if (r.width === 'regular' || r.width === 'wide') out.width = r.width;
  if (typeof r.budgetMaxPhp === 'number' && Number.isFinite(r.budgetMaxPhp) && r.budgetMaxPhp > 0) {
    out.budgetMaxPhp = Math.round(r.budgetMaxPhp);
  }
  if (typeof r.sizeLabel === 'string' && r.sizeLabel.trim()) out.sizeLabel = r.sizeLabel.trim().slice(0, 24);
  return out;
}

export async function getFitProfile(): Promise<FitProfile> {
  const rawStr = await AsyncStorage.getItem(KEY);
  if (!rawStr) return {};
  try {
    return normalizeFitProfile(JSON.parse(rawStr));
  } catch {
    return {};
  }
}

export async function setFitProfile(profile: FitProfile): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(normalizeFitProfile(profile)));
}
