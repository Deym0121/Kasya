/**
 * Pure re-scan-due logic for the in-app reminder banner. Works everywhere (web,
 * Expo Go, dev builds) with zero permissions — native local notifications are a
 * separate, optional layer (src/notifications/reminders.ts).
 */

export type ReminderCadence = 'off' | 'weekly' | 'biweekly' | 'monthly';

export const CADENCE_DAYS: Record<Exclude<ReminderCadence, 'off'>, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Is the user due for a re-scan? 'off' never fires. No last scan but reminders
 * on → due (nudge the first scan). An unparseable date is treated as not due.
 */
export function isRescanDue(
  lastScanISO: string | null,
  cadence: ReminderCadence,
  now: Date,
): { due: boolean; daysSince: number | null } {
  if (cadence === 'off') return { due: false, daysSince: null };
  if (!lastScanISO) return { due: true, daysSince: null };
  const last = new Date(lastScanISO).getTime();
  if (!Number.isFinite(last)) return { due: false, daysSince: null };
  const daysSince = Math.floor((now.getTime() - last) / DAY_MS);
  return { due: daysSince >= CADENCE_DAYS[cadence], daysSince };
}

/** Hedged banner copy. daysSince null = no scan yet. */
export function dueBannerCopy(daysSince: number | null): string {
  if (daysSince == null) return 'Ready when you are — a quick scan takes about 30 seconds.';
  return `It's been about ${daysSince} days since your last scan — a quick re-scan keeps your trend fresh.`;
}
