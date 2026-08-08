import { describe, it, expect, beforeEach, vi } from 'vitest';

// In-memory AsyncStorage so the settings IO layer is testable in node.
const store = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => store.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: async (k: string) => {
      store.delete(k);
    },
  },
}));

import { isRescanDue, dueBannerCopy, CADENCE_DAYS } from '../reminderDue';
import { getReminderSettings } from '../settings';

const NOW = new Date('2026-07-10T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

describe('isRescanDue', () => {
  it("never fires when reminders are 'off'", () => {
    expect(isRescanDue(daysAgo(100), 'off', NOW).due).toBe(false);
    expect(isRescanDue(null, 'off', NOW).due).toBe(false);
  });

  it('fires exactly at the cadence boundary', () => {
    expect(isRescanDue(daysAgo(6), 'weekly', NOW).due).toBe(false);
    expect(isRescanDue(daysAgo(7), 'weekly', NOW).due).toBe(true);
    expect(isRescanDue(daysAgo(13), 'biweekly', NOW).due).toBe(false);
    expect(isRescanDue(daysAgo(14), 'biweekly', NOW).due).toBe(true);
    expect(isRescanDue(daysAgo(30), 'monthly', NOW).due).toBe(true);
  });

  it('reports days since the last scan', () => {
    expect(isRescanDue(daysAgo(9), 'weekly', NOW).daysSince).toBe(9);
  });

  it('nudges the first scan when reminders are on but nothing is recorded', () => {
    const r = isRescanDue(null, 'weekly', NOW);
    expect(r.due).toBe(true);
    expect(r.daysSince).toBeNull();
  });

  it('treats an unparseable date as not due', () => {
    expect(isRescanDue('not-a-date', 'weekly', NOW).due).toBe(false);
  });

  it('exports sane cadence day counts', () => {
    expect(CADENCE_DAYS.weekly).toBe(7);
    expect(CADENCE_DAYS.biweekly).toBe(14);
    expect(CADENCE_DAYS.monthly).toBe(30);
  });
});

describe('getReminderSettings', () => {
  beforeEach(() => {
    store.clear();
  });

  it('keeps a valid stored cadence', async () => {
    store.set('kasya:settings:v1', JSON.stringify({ cadence: 'weekly', notificationId: 'n1' }));
    const s = await getReminderSettings();
    expect(s.cadence).toBe('weekly');
    expect(s.notificationId).toBe('n1');
  });

  it("falls back to 'off' for a cadence outside the union", async () => {
    store.set('kasya:settings:v1', JSON.stringify({ cadence: 'daily' }));
    expect((await getReminderSettings()).cadence).toBe('off');
  });

  it("falls back to 'off' for a non-string cadence", async () => {
    store.set('kasya:settings:v1', JSON.stringify({ cadence: 7 }));
    expect((await getReminderSettings()).cadence).toBe('off');
  });
});

describe('dueBannerCopy', () => {
  it('is hedged and clean in both branches', () => {
    for (const copy of [dueBannerCopy(null), dueBannerCopy(9)]) {
      expect(copy.toLowerCase()).toMatch(/about/);
      expect(copy.toLowerCase()).not.toMatch(/injur|diagnos|pronation|abnormal|medical|disease/);
      expect(copy.toLowerCase()).not.toMatch(/\bshould\b|\bmust\b|\brisk\b|\bproblem\b|\bfault\b|imbalance|\bcorrect\b/);
    }
    expect(dueBannerCopy(9)).toContain('9 days');
  });
});
