import { describe, it, expect } from 'vitest';
import { pendingReports, markSynced, SyncedMap } from '../syncPlan';

const r = (id: string) => ({ id }) as any;

describe('pendingReports', () => {
  it('returns only reports that have no remote row yet (oldest first)', () => {
    const map: SyncedMap = { a: 'uuid-a' };
    expect(pendingReports([r('a'), r('b'), r('c')], map).map((x) => x.id)).toEqual(['c', 'b']);
  });

  it('pushes oldest first so cloud rows land in chronological order', () => {
    // local list is newest-first (storage order) — pending must be reversed
    const out = pendingReports([r('new'), r('mid'), r('old')], {});
    expect(out.map((x) => x.id)).toEqual(['old', 'mid', 'new']);
  });

  it('is empty when everything is synced', () => {
    expect(pendingReports([r('a')], { a: 'u' })).toEqual([]);
  });
});

describe('markSynced', () => {
  it('adds the mapping without mutating the original map', () => {
    const map: SyncedMap = { a: 'ua' };
    const next = markSynced(map, 'b', 'ub');
    expect(next).toEqual({ a: 'ua', b: 'ub' });
    expect(map).toEqual({ a: 'ua' }); // untouched
  });
});
