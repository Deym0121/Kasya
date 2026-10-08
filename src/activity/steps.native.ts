import { Platform } from 'react-native';
import { Pedometer } from 'expo-sensors';

/**
 * Phone pedometer (expo-sensors). iOS's motion coprocessor keeps a 7-day step
 * history, so a recording can ask "how many steps between start and now" at
 * any time — even after being suspended. Android has no history API: there we
 * count live while the app is open (Health Connect fills that gap later).
 */
export async function stepsPermission(): Promise<boolean> {
  try {
    if (!(await Pedometer.isAvailableAsync())) return false;
    const cur = await Pedometer.getPermissionsAsync();
    if (cur.granted) return true;
    if (!cur.canAskAgain) return false;
    return (await Pedometer.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

export async function phoneStepsBetween(start: Date, end: Date): Promise<number | null> {
  if (Platform.OS !== 'ios') return null;
  try {
    // Never let a passive read (e.g. the Activity tab's step card) trigger the
    // Motion prompt out of context — only read once the user has granted it.
    if (!(await Pedometer.getPermissionsAsync()).granted) return null;
    const r = await Pedometer.getStepCountAsync(start, end);
    return r.steps;
  } catch {
    return null;
  }
}

/** Live step counter since subscription (Android fallback). Returns unsubscribe. */
export function watchPhoneSteps(onSteps: (stepsSinceStart: number) => void): () => void {
  try {
    const sub = Pedometer.watchStepCount((r) => onSteps(r.steps));
    return () => sub.remove();
  } catch {
    return () => {};
  }
}

export const hasStepHistory = Platform.OS === 'ios';
