import { describe, it, expect } from 'vitest';
import { parseRaceDate, statusOf, dateBadge, monthKey, monthLabel } from '../logic';
import type { RaceEvent } from '../types';

const ev = (over: Partial<RaceEvent> = {}): RaceEvent => ({
  id: 'test-run-2026',
  name: 'Test Run',
  country: 'PH',
  city: 'Manila',
  dateStart: '2026-11-08',
  distances: ['21K', '42K'],
  major: false,
  sourceUrl: 'https://example.org/race',
  ...over,
});

describe('parseRaceDate', () => {
  it('parses to LOCAL midnight (not UTC)', () => {
    const d = parseRaceDate('2026-11-08');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(10);
    expect(d.getDate()).toBe(8);
    expect(d.getHours()).toBe(0);
  });
});

describe('statusOf', () => {
  const today = new Date(2026, 10, 1); // 2026-11-01 local
  it('is done when the race date is before today', () => {
    expect(statusOf(ev({ dateStart: '2026-10-31' }), today)).toBe('done');
  });
  it('is NOT done on race day itself', () => {
    expect(statusOf(ev({ dateStart: '2026-11-01', regUrl: 'https://x.ph/reg' }), today)).toBe('open');
  });
  it('is open for a future race with a registration link', () => {
    expect(statusOf(ev({ regUrl: 'https://x.ph/reg' }), today)).toBe('open');
  });
  it('is announced for a future race without a registration link', () => {
    expect(statusOf(ev(), today)).toBe('announced');
  });
});

describe('dateBadge / month helpers', () => {
  it('formats the badge without Intl', () => {
    expect(dateBadge(ev())).toEqual({ day: '8', monWeek: 'SUN · NOV' });
  });
  it('builds month keys and labels', () => {
    expect(monthKey(ev())).toBe('2026-11');
    expect(monthLabel('2026-11')).toBe('NOV 2026');
  });
});
