import { describe, it, expect } from 'vitest';
import {
  LEVEL_STEP_UNIT,
  MAX_LEVEL,
  formatCount,
  formatRange,
  levelForSteps,
  levelTitle,
  monthRange,
  rankBadge,
  stepsForLevel,
  weekRange,
} from '../levels';

describe('stepsForLevel', () => {
  it('follows 25,000·(n−1)²', () => {
    expect(stepsForLevel(1)).toBe(0);
    expect(stepsForLevel(2)).toBe(25_000);
    expect(stepsForLevel(3)).toBe(100_000);
    expect(stepsForLevel(4)).toBe(225_000);
    expect(stepsForLevel(10)).toBe(LEVEL_STEP_UNIT * 81);
  });

  it('clamps out-of-range levels', () => {
    expect(stepsForLevel(0)).toBe(0);
    expect(stepsForLevel(-5)).toBe(0);
    expect(stepsForLevel(500)).toBe(stepsForLevel(MAX_LEVEL));
    expect(stepsForLevel(NaN)).toBe(0);
  });
});

describe('levelForSteps', () => {
  it('starts everyone at level 1', () => {
    expect(levelForSteps(0)).toEqual({ level: 1, current: 0, next: 25_000, progress: 0, toNext: 25_000 });
  });

  it('treats bad input as zero', () => {
    for (const bad of [-100, NaN, Infinity, -Infinity]) expect(levelForSteps(bad).level).toBe(1);
  });

  it('levels up exactly on the threshold', () => {
    expect(levelForSteps(24_999).level).toBe(1);
    expect(levelForSteps(25_000).level).toBe(2);
    expect(levelForSteps(99_999).level).toBe(2);
    expect(levelForSteps(100_000).level).toBe(3);
    expect(levelForSteps(225_000).level).toBe(4);
  });

  it('reports progress through the current level', () => {
    const mid = levelForSteps(62_500); // halfway between 25k and 100k
    expect(mid.level).toBe(2);
    expect(mid.current).toBe(25_000);
    expect(mid.next).toBe(100_000);
    expect(mid.progress).toBeCloseTo(0.5, 6);
    expect(mid.toNext).toBe(37_500);
  });

  it('caps at level 99 with full progress', () => {
    const top = levelForSteps(stepsForLevel(MAX_LEVEL) + 10_000_000);
    expect(top.level).toBe(MAX_LEVEL);
    expect(top.progress).toBe(1);
    expect(top.toNext).toBe(0);
    expect(top.next).toBe(top.current);
    expect(levelForSteps(stepsForLevel(MAX_LEVEL) - 1).level).toBe(MAX_LEVEL - 1);
  });

  it('is monotonic', () => {
    let prev = 1;
    for (let s = 0; s <= 5_000_000; s += 12_345) {
      const { level, progress } = levelForSteps(s);
      expect(level).toBeGreaterThanOrEqual(prev);
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThanOrEqual(1);
      prev = level;
    }
  });
});

describe('levelTitle', () => {
  it('names each band', () => {
    expect(levelTitle(1)).toBe('Rookie');
    expect(levelTitle(3)).toBe('Walker');
    expect(levelTitle(5)).toBe('Strider');
    expect(levelTitle(8)).toBe('Pacer');
    expect(levelTitle(12)).toBe('Road Runner');
    expect(levelTitle(17)).toBe('Marathoner');
    expect(levelTitle(99)).toBe('Legend');
  });
});

describe('rankBadge', () => {
  it('gives medals to the top three only', () => {
    expect(rankBadge(1)).toBe('gold');
    expect(rankBadge(2)).toBe('silver');
    expect(rankBadge(3)).toBe('bronze');
    expect(rankBadge(4)).toBeNull();
    expect(rankBadge(0)).toBeNull();
    expect(rankBadge(-1)).toBeNull();
    expect(rankBadge(1.5)).toBeNull();
  });
});

describe('weekRange', () => {
  it('runs Monday → Sunday in local days', () => {
    // Sat 17 Oct 2026
    expect(weekRange(new Date(2026, 9, 17, 15, 30))).toEqual({ fromDay: '2026-10-12', toDay: '2026-10-18' });
  });

  it('treats Sunday as the last day of the week', () => {
    expect(weekRange(new Date(2026, 9, 18, 23, 59))).toEqual({ fromDay: '2026-10-12', toDay: '2026-10-18' });
  });

  it('starts a new week on Monday just after midnight', () => {
    expect(weekRange(new Date(2026, 9, 19, 0, 1))).toEqual({ fromDay: '2026-10-19', toDay: '2026-10-25' });
  });

  it('crosses month and year boundaries', () => {
    // Thu 1 Jan 2026 → Mon 29 Dec 2025 … Sun 4 Jan 2026
    expect(weekRange(new Date(2026, 0, 1, 9))).toEqual({ fromDay: '2025-12-29', toDay: '2026-01-04' });
  });
});

describe('monthRange', () => {
  it('covers the 1st through the last day', () => {
    expect(monthRange(new Date(2026, 9, 17))).toEqual({ fromDay: '2026-10-01', toDay: '2026-10-31' });
    expect(monthRange(new Date(2026, 8, 30))).toEqual({ fromDay: '2026-09-01', toDay: '2026-09-30' });
  });

  it('handles February in leap and common years', () => {
    expect(monthRange(new Date(2028, 1, 10))).toEqual({ fromDay: '2028-02-01', toDay: '2028-02-29' });
    expect(monthRange(new Date(2027, 1, 10))).toEqual({ fromDay: '2027-02-01', toDay: '2027-02-28' });
  });
});

describe('formatting', () => {
  it('groups thousands without Intl', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1000)).toBe('1,000');
    expect(formatCount(1234567.4)).toBe('1,234,567');
    expect(formatCount(-12000)).toBe('-12,000');
    expect(formatCount(NaN)).toBe('0');
  });

  it('labels a day range', () => {
    expect(formatRange({ fromDay: '2026-10-12', toDay: '2026-10-18' })).toBe('Oct 12 – Oct 18');
  });
});
