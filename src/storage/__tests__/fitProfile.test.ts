import { describe, it, expect, beforeEach, vi } from 'vitest';

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

import { getFitProfile, setFitProfile, normalizeFitProfile } from '../fitProfile';

beforeEach(() => store.clear());

describe('normalizeFitProfile', () => {
  it('keeps only valid, cleaned fields', () => {
    expect(normalizeFitProfile({ width: 'wide', budgetMaxPhp: 2000, sizeLabel: ' US 9 ' })).toEqual({
      width: 'wide',
      budgetMaxPhp: 2000,
      sizeLabel: 'US 9',
    });
  });

  it('drops an unknown width, a non-positive budget and a blank size', () => {
    expect(normalizeFitProfile({ width: 'extra-wide', budgetMaxPhp: -5, sizeLabel: '   ' })).toEqual({});
  });

  it('rounds a fractional budget and ignores junk input', () => {
    expect(normalizeFitProfile({ budgetMaxPhp: 1999.7 })).toEqual({ budgetMaxPhp: 2000 });
    expect(normalizeFitProfile(null)).toEqual({});
    expect(normalizeFitProfile('nope')).toEqual({});
  });
});

describe('fit profile storage', () => {
  it('defaults to an empty profile', async () => {
    expect(await getFitProfile()).toEqual({});
  });

  it('round-trips a saved profile', async () => {
    await setFitProfile({ width: 'wide', budgetMaxPhp: 1500, sizeLabel: 'US 8.5' });
    expect(await getFitProfile()).toEqual({ width: 'wide', budgetMaxPhp: 1500, sizeLabel: 'US 8.5' });
  });

  it('normalizes on save so junk never persists', async () => {
    await setFitProfile({ width: 'wide', budgetMaxPhp: 0 } as any);
    expect(await getFitProfile()).toEqual({ width: 'wide' });
  });

  it('tolerates corrupt stored JSON', async () => {
    store.set('kasya:fit:v1', '{broken');
    expect(await getFitProfile()).toEqual({});
  });
});
