import { describe, it, expect } from 'vitest';
import { savingsPct, trialDays, trialDisclosure } from '../pricing';
import { freeScansLeft } from '../limits';

describe('pricing', () => {
  it('derives the yearly saving from real prices', () => {
    expect(savingsPct(249, 1490)).toBe(50); // PH: ₱249/mo vs ₱1,490/yr
    expect(savingsPct(7.99, 49.99)).toBe(48);
    expect(savingsPct(9.99, 79.99)).toBe(33);
    expect(savingsPct(null, 49.99)).toBeNull();
    expect(savingsPct(10, 125)).toBeNull(); // yearly dearer than 12× monthly → no badge
  });

  it('reads a free trial from the intro offer', () => {
    expect(trialDays({ price: 0, periodUnit: 'DAY', periodNumberOfUnits: 7, cycles: 1 })).toBe(7);
    expect(trialDays({ price: 0, periodUnit: 'WEEK', periodNumberOfUnits: 1, cycles: 1 })).toBe(7);
    expect(trialDays({ price: 0.99, periodUnit: 'WEEK', periodNumberOfUnits: 1, cycles: 1 })).toBeNull(); // paid intro, not free
    expect(trialDays(null)).toBeNull();
    expect(trialDisclosure(7, '₱1,490.00', 'year')).toContain('then ₱1,490.00 per year');
  });
});

describe('free scan allowance', () => {
  const now = new Date('2026-10-08T12:00:00Z');
  const at = (daysAgo: number, simulated = false) => ({
    createdAt: new Date(now.getTime() - daysAgo * 86400_000).toISOString(),
    simulated,
  });

  it('counts real scans in the last 7 days only', () => {
    expect(freeScansLeft([], now).left).toBe(3);
    expect(freeScansLeft([at(1), at(8), at(2, true)], now).left).toBe(2);
  });

  it('says when the next free scan unlocks', () => {
    const r = freeScansLeft([at(1), at(3), at(6)], now);
    expect(r.left).toBe(0);
    expect(r.nextFreeAt!.toISOString()).toBe(new Date(now.getTime() + 1 * 86400_000).toISOString());
  });
});
