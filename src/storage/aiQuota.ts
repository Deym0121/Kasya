import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Daily quota for the live AI coach — 50 chats/day, Premium only. Tracked
 * on-device (mock-auth reality). NOTE: real enforcement needs server-side auth
 * (Supabase) since a determined user could clear local storage; this delivers
 * the product rule for the demo and as the client half of the eventual check.
 */
export const DAILY_AI_LIMIT = 50;
const KEY = 'stridefit:aiquota:v1';

export interface AiUsage {
  /** YYYY-MM-DD the count applies to */
  date: string;
  count: number;
}

/** Local day key — the quota rolls over at local midnight. */
export function dayKey(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Pure: today's usage from what's stored — resets to 0 on a new day. */
export function usageForToday(stored: AiUsage | null, todayKey: string): AiUsage {
  // Only roll over when the day genuinely advanced — a clock set back must not
  // grant a fresh allowance. ISO yyyy-mm-dd compares safely as strings.
  if (!stored || todayKey > stored.date) return { date: todayKey, count: 0 };
  return { date: stored.date, count: stored.count };
}

export function aiRemaining(u: AiUsage): number {
  return Math.max(0, DAILY_AI_LIMIT - u.count);
}

export async function getAiUsage(now = new Date()): Promise<AiUsage> {
  const raw = await AsyncStorage.getItem(KEY);
  let stored: AiUsage | null = null;
  try {
    stored = raw ? (JSON.parse(raw) as AiUsage) : null;
  } catch {
    stored = null;
  }
  return usageForToday(stored, dayKey(now));
}

export async function bumpAiUsage(now = new Date()): Promise<AiUsage> {
  const cur = await getAiUsage(now);
  const next: AiUsage = { date: cur.date, count: cur.count + 1 };
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

/** Wipe the stored record — used when a different account signs in. */
export async function resetAiUsage(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
