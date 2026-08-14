import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Guards the black-screen fix (App Review 2.1(a), build #8): if the Convex
 * client constructor throws (e.g. a broken URL runtime), getConvex must
 * degrade to local-only — never let the throw reach the first render.
 */
vi.mock('convex/react', () => ({
  ConvexReactClient: class {
    constructor() {
      throw new Error('URL.protocol is not implemented'); // Hermes-style failure
    }
  },
}));

describe('getConvex fail-open', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns null (and turns cloud off) when the client constructor throws', async () => {
    vi.stubEnv('EXPO_PUBLIC_CONVEX_URL', 'https://example.convex.cloud');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mod = await import('../client');
    expect(mod.getConvex()).toBeNull();
    expect(mod.getConvex()).toBeNull(); // failure is remembered, never rethrown
    expect(mod.isCloudEnabled()).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('stays fully local when no URL is configured', async () => {
    vi.stubEnv('EXPO_PUBLIC_CONVEX_URL', '');
    const mod = await import('../client');
    expect(mod.getConvex()).toBeNull();
    expect(mod.isCloudEnabled()).toBe(false);
  });
});
