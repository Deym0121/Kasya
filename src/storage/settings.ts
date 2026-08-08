import AsyncStorage from '@react-native-async-storage/async-storage';
import { ReminderCadence } from './reminderDue';

/** Local app settings (reminder preference). Follows the session.ts pattern. */
export interface ReminderSettings {
  cadence: ReminderCadence;
  /** the scheduled native notification's id, when one exists */
  notificationId?: string | null;
}

const KEY = 'stridefit:settings:v1';

const DEFAULTS: ReminderSettings = { cadence: 'off', notificationId: null };

const VALID_CADENCES: ReminderCadence[] = ['off', 'weekly', 'biweekly', 'monthly'];

export async function getReminderSettings(): Promise<ReminderSettings> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return { ...DEFAULTS };
  try {
    const parsed = JSON.parse(raw);
    const merged = { ...DEFAULTS, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
    // Schema drift guard: an unknown cadence value falls back to 'off'.
    if (!VALID_CADENCES.includes(merged.cadence)) merged.cadence = 'off';
    return merged;
  } catch {
    return { ...DEFAULTS };
  }
}

export async function setReminderSettings(settings: ReminderSettings): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(settings));
}
