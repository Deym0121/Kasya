import { describe, it, expect } from 'vitest';
import seed from '../../data/raceSeed.json';
import { validateRaceSeed } from '../../../scripts/check-races-seed.mjs';

describe('bundled race seed', () => {
  it('passes the seed validator', () => {
    expect(validateRaceSeed(seed)).toEqual([]);
  });
  it('has at least one PH event and one major', () => {
    const events = (seed as { events: { country: string; major: boolean }[] }).events;
    expect(events.some((e) => e.country === 'PH')).toBe(true);
    expect(events.some((e) => e.major)).toBe(true);
  });
});
