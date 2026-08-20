import type { RaceEvent } from './types';

/**
 * Date/status helpers. NO Intl / toLocale* — Hermes ships without full Intl
 * and this app has already been bitten by Hermes runtime gaps. Static names.
 */
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** YYYY-MM-DD → LOCAL midnight. new Date(string) would be UTC — wrong in UTC+8. */
export function parseRaceDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export type RaceStatus = 'open' | 'announced' | 'done';

/** Done strictly AFTER race day; future = open when a registration link exists. */
export function statusOf(e: RaceEvent, today: Date): RaceStatus {
  const race = parseRaceDate(e.dateStart);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (race < startOfToday) return 'done';
  return e.regUrl ? 'open' : 'announced';
}

export function dateBadge(e: RaceEvent): { day: string; monWeek: string } {
  const d = parseRaceDate(e.dateStart);
  return { day: String(d.getDate()), monWeek: `${WEEKDAYS[d.getDay()]} · ${MONTHS[d.getMonth()]}` };
}

export function monthKey(e: RaceEvent): string {
  return e.dateStart.slice(0, 7);
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[(m || 1) - 1]} ${y}`;
}
