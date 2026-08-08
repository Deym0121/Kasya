import { describe, it, expect, beforeEach, vi } from 'vitest';

// In-memory AsyncStorage so the quota IO layer is testable in node.
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

import { usageForToday, aiRemaining, dayKey, DAILY_AI_LIMIT, bumpAiUsage, getAiUsage, resetAiUsage } from '../aiQuota';

beforeEach(() => {
  store.clear();
});

describe('aiQuota', () => {
  it('formats a local day key as YYYY-MM-DD', () => {
    expect(dayKey(new Date(2026, 6, 4))).toBe('2026-07-04'); // month is 0-indexed
  });

  it('starts at zero when nothing is stored', () => {
    expect(usageForToday(null, '2026-07-04')).toEqual({ date: '2026-07-04', count: 0 });
  });

  it('keeps the count within the same day', () => {
    expect(usageForToday({ date: '2026-07-04', count: 12 }, '2026-07-04')).toEqual({ date: '2026-07-04', count: 12 });
  });

  it('resets the count on a new day', () => {
    expect(usageForToday({ date: '2026-07-03', count: 50 }, '2026-07-04')).toEqual({ date: '2026-07-04', count: 0 });
  });

  it('does not reset when the stored date is in the future (clock set back)', () => {
    // Setting the device clock back must not grant a fresh daily allowance.
    expect(usageForToday({ date: '2026-07-05', count: 50 }, '2026-07-04')).toEqual({ date: '2026-07-05', count: 50 });
  });

  it('computes remaining against the daily limit and never goes negative', () => {
    expect(aiRemaining({ date: 'x', count: 2 })).toBe(DAILY_AI_LIMIT - 2);
    expect(aiRemaining({ date: 'x', count: DAILY_AI_LIMIT + 5 })).toBe(0);
  });

  it('resetAiUsage clears the stored record so the next read starts fresh', async () => {
    await bumpAiUsage(new Date(2026, 6, 4));
    await bumpAiUsage(new Date(2026, 6, 4));
    expect((await getAiUsage(new Date(2026, 6, 4))).count).toBe(2);
    await resetAiUsage();
    expect((await getAiUsage(new Date(2026, 6, 4))).count).toBe(0);
  });
});
