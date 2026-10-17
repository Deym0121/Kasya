import AsyncStorage from '@react-native-async-storage/async-storage';
import { clampGoals, DEFAULT_GOALS, type Goals } from './daily';

/** The user's daily goals (steps, active minutes, active calories, optional age), on this device. */
const KEY = 'kasya:goals:v1';

let cached: Goals | null = null;
const listeners = new Set<(g: Goals) => void>();

export async function getGoals(): Promise<Goals> {
  if (cached) return cached;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cached = raw ? clampGoals(JSON.parse(raw)) : DEFAULT_GOALS;
  } catch {
    cached = DEFAULT_GOALS;
  }
  return cached;
}

export async function setGoals(next: Partial<Goals>): Promise<Goals> {
  const g = clampGoals({ ...(await getGoals()), ...next });
  cached = g;
  listeners.forEach((l) => l(g));
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(g));
  } catch {}
  return g;
}

export function onGoals(listener: (g: Goals) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
