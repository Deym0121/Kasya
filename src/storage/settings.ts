import AsyncStorage from '@react-native-async-storage/async-storage';
import { ReminderCadence } from './reminderDue';

/** Local app settings (reminder preference). Follows the session.ts pattern. */
export interface ReminderSettings {
  cadence: ReminderCadence;
  /** the scheduled native notification's id, when one exists */
  notificationId?: string | null;
}

const KEY = 'kasya:settings:v1';

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

/** AI coach reply language. Taglish by default — Kasya ships for the PH market. */
export type CoachLang = 'taglish' | 'english';

const COACH_LANG_KEY = 'kasya:coachLang:v1';

export async function getCoachLang(): Promise<CoachLang> {
  const raw = await AsyncStorage.getItem(COACH_LANG_KEY);
  return raw === 'english' ? 'english' : 'taglish';
}

export async function setCoachLang(lang: CoachLang): Promise<void> {
  await AsyncStorage.setItem(COACH_LANG_KEY, lang);
}
