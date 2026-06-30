import { describe, it, expect } from 'vitest';
import { median, findPeaks } from '../signal';

describe('median', () => {
  it('returns the middle value of an odd-length set', () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it('averages the two middle values of an even-length set', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('findPeaks', () => {
  it('finds each local maximum at or above minHeight', () => {
    expect(findPeaks([0, 1, 0, 1, 0, 1, 0], { minHeight: 0.5 })).toEqual([1, 3, 5]);
  });

  it('ignores local maxima below minHeight', () => {
    expect(findPeaks([0, 0.2, 0, 1, 0], { minHeight: 0.5 })).toEqual([3]);
  });

  it('merges peaks closer than minDistance, keeping the taller', () => {
    // local maxima at indices 1 (=5) and 3 (=6), only 2 apart
    expect(findPeaks([0, 5, 0, 6, 0], { minDistance: 3 })).toEqual([3]);
  });
});
