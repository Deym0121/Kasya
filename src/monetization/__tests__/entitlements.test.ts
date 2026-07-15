import { describe, it, expect, beforeEach, vi } from 'vitest';

const store = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => store.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      store.set(k, v);
    },
    multiRemove: async (ks: string[]) => ks.forEach((k) => store.delete(k)),
  },
}));
// The RN Platform import must not explode in node — pretend we're on web (demo path).
vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));

import { planFromCustomerInfo, rcApiKey, getPlan } from '../entitlements';

beforeEach(() => store.clear());

describe('planFromCustomerInfo', () => {
  it('is premium when the premium entitlement is active', () => {
    expect(planFromCustomerInfo({ entitlements: { active: { premium: { isActive: true } } } })).toBe('premium');
  });

  it('counts ANY active entitlement (forgiving of dashboard naming)', () => {
    expect(planFromCustomerInfo({ entitlements: { active: { pro: {} } } })).toBe('premium');
  });

  it('is free with no active entitlements or junk input', () => {
    expect(planFromCustomerInfo({ entitlements: { active: {} } })).toBe('free');
    expect(planFromCustomerInfo(null)).toBe('free');
    expect(planFromCustomerInfo('junk')).toBe('free');
    expect(planFromCustomerInfo({})).toBe('free');
  });
});

describe('rcApiKey', () => {
  const env = { EXPO_PUBLIC_REVENUECAT_IOS_KEY: 'appl_x', EXPO_PUBLIC_REVENUECAT_ANDROID_KEY: 'goog_y' };

  it('never configures billing on web', () => {
    expect(rcApiKey('web', env)).toBeNull();
    expect(rcApiKey('web', { EXPO_PUBLIC_REVENUECAT_KEY: 'test_z' })).toBeNull();
  });

  it('picks the right store key per platform', () => {
    expect(rcApiKey('ios', env)).toBe('appl_x');
    expect(rcApiKey('android', env)).toBe('goog_y');
  });

  it('falls back to the single (Test Store) key on both platforms', () => {
    const single = { EXPO_PUBLIC_REVENUECAT_KEY: 'test_ccNM' };
    expect(rcApiKey('ios', single)).toBe('test_ccNM');
    expect(rcApiKey('android', single)).toBe('test_ccNM');
    // per-platform keys still win when both are present
    expect(rcApiKey('ios', { ...single, ...env })).toBe('appl_x');
  });

  it('returns null when the key is missing or blank', () => {
    expect(rcApiKey('ios', {})).toBeNull();
    expect(rcApiKey('android', { EXPO_PUBLIC_REVENUECAT_ANDROID_KEY: '  ' })).toBeNull();
  });
});

describe('planFromCustomerInfo — Kasya Pro entitlement', () => {
  it('recognizes the "Kasya Pro" entitlement by its exact dashboard identifier', () => {
    expect(planFromCustomerInfo({ entitlements: { active: { 'Kasya Pro': { isActive: true } } } })).toBe('premium');
  });
});

describe('getPlan (demo fallback path)', () => {
  it('reads the local session plan when billing is not live', async () => {
    store.set('kasya:user:v1', JSON.stringify({ email: 'a@b.c', name: 'A', plan: 'premium' }));
    expect(await getPlan()).toBe('premium');
  });

  it('defaults to free with no session', async () => {
    expect(await getPlan()).toBe('free');
  });
});
