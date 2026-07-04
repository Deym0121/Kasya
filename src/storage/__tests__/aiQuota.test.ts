import { describe, it, expect } from 'vitest';
import { usageForToday, aiRemaining, dayKey, DAILY_AI_LIMIT } from '../aiQuota';

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

  it('computes remaining against the daily limit and never goes negative', () => {
    expect(aiRemaining({ date: 'x', count: 2 })).toBe(DAILY_AI_LIMIT - 2);
    expect(aiRemaining({ date: 'x', count: DAILY_AI_LIMIT + 5 })).toBe(0);
  });
});
