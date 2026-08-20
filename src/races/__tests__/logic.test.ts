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

import { applyFilter, splitViews, groupByMonth } from '../logic';

describe('applyFilter', () => {
  const events = [
    ev({ id: 'a', country: 'PH' }),
    ev({ id: 'b', country: 'SG' }),
    ev({ id: 'c', country: 'US', major: true }),
  ];
  it('passes everything through for all', () => {
    expect(applyFilter(events, 'all').map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });
  it('filters by country code', () => {
    expect(applyFilter(events, 'SG').map((e) => e.id)).toEqual(['b']);
  });
  it('majors is a virtual filter across countries', () => {
    expect(applyFilter(events, 'majors').map((e) => e.id)).toEqual(['c']);
  });
});

describe('splitViews', () => {
  const today = new Date(2026, 10, 1); // 2026-11-01
  const events = [
    ev({ id: 'past-old', dateStart: '2026-06-01' }), // >90d — dropped from results
    ev({ id: 'past-new', dateStart: '2026-10-20' }),
    ev({ id: 'past-mid', dateStart: '2026-09-15' }),
    ev({ id: 'up-far', dateStart: '2027-02-01' }),
    ev({ id: 'up-near', dateStart: '2026-11-20' }),
  ];
  it('splits and sorts: upcoming soonest-first, results newest-first, 90-day window', () => {
    const { upcoming, results } = splitViews(events, today);
    expect(upcoming.map((e) => e.id)).toEqual(['up-near', 'up-far']);
    expect(results.map((e) => e.id)).toEqual(['past-new', 'past-mid']);
  });
});

describe('groupByMonth', () => {
  it('groups in input order', () => {
    const groups = groupByMonth([
      ev({ id: 'n1', dateStart: '2026-11-20' }),
      ev({ id: 'n2', dateStart: '2026-11-29' }),
      ev({ id: 'f1', dateStart: '2027-02-01' }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['2026-11', '2027-02']);
    expect(groups[0].events.map((e) => e.id)).toEqual(['n1', 'n2']);
  });
});
