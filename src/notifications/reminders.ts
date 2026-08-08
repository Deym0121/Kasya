import { Platform } from 'react-native';
import { ReminderCadence, CADENCE_DAYS } from '../storage/reminderDue';
import { getReminderSettings, setReminderSettings } from '../storage/settings';

/**
 * Optional native local notifications for re-scan reminders. This is the ONLY
 * file that touches expo-notifications, and it loads the module lazily behind a
 * platform guard so the web bundle never pulls it in (web is unsupported —
 * the in-app due banner covers web instead).
 *
 * Permission is requested ONLY from the Profile toggle, never on app start.
 */

const DAY_SECONDS = 24 * 60 * 60;

async function loadNotifications() {
  if (Platform.OS === 'web') return null;
  try {
    return await import('expo-notifications');
  } catch {
    return null;
  }
}

/** Ask (politely, once triggered by the user) for notification permission. */
export async function ensureNotificationPermission(): Promise<boolean> {
  const Notifications = await loadNotifications();
  if (!Notifications) return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const asked = await Notifications.requestPermissionsAsync();
    return asked.granted;
  } catch {
    return false;
  }
}

/**
 * Schedule (or reschedule) the repeating re-scan reminder. Returns the new
 * notification id, or null when unavailable (web / denied / 'off').
 */
export async function scheduleRescanReminder(
  cadence: ReminderCadence,
  previousId?: string | null,
): Promise<string | null> {
  const Notifications = await loadNotifications();
  if (!Notifications || cadence === 'off') return null;
  try {
    if (previousId) await Notifications.cancelScheduledNotificationAsync(previousId).catch(() => {});
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Stride check-in',
        body: 'Take a quick scan to see how your cadence is trending.',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: CADENCE_DAYS[cadence] * DAY_SECONDS,
        repeats: true,
      },
    });
  } catch {
    return null;
  }
}

/**
 * Re-anchor the repeating reminder after a saved scan, so the next nudge counts
 * from the scan rather than from whenever the toggle was tapped. No-op on web,
 * when the cadence is off, or when permission is missing.
 */
export async function rescheduleAfterScan(): Promise<void> {
  const Notifications = await loadNotifications();
  if (!Notifications) return;
  const settings = await getReminderSettings();
  if (settings.cadence === 'off') return;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (!current.granted) return;
  } catch {
    return;
  }
  // scheduleRescanReminder cancels the previous id, then anchors a fresh one to now.
  const notificationId = await scheduleRescanReminder(settings.cadence, settings.notificationId);
  await setReminderSettings({ ...settings, notificationId });
}

/** Cancel the scheduled reminder, if any. */
export async function cancelRescanReminder(id: string | null | undefined): Promise<void> {
  if (!id) return;
  const Notifications = await loadNotifications();
  if (!Notifications) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // already gone — fine
  }
}
