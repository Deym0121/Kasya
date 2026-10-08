import { describe, it, expect, beforeEach, vi } from 'vitest';

// In-memory AsyncStorage that survives "app kills" (vi.resetModules) — so the
// session's crash recovery is tested against what actually reached storage.
const store = new Map<string, string>();
let failNextMultiSet = 0;
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => store.get(k) ?? null,
    setItem: async (k: string, v: string) => void store.set(k, v),
    multiSet: async (pairs: [string, string][]) => {
      if (failNextMultiSet > 0) {
        failNextMultiSet -= 1;
        throw new Error('disk full');
      }
      pairs.forEach(([k, v]) => store.set(k, v));
    },
    multiGet: async (ks: string[]) => ks.map((k) => [k, store.get(k) ?? null]),
    getAllKeys: async () => [...store.keys()],
    multiRemove: async (ks: string[]) => ks.forEach((k) => store.delete(k)),
    removeItem: async (k: string) => void store.delete(k),
  },
}));
vi.mock('react-native', () => ({ AppState: { addEventListener: () => ({ remove() {} }) } }));

import { simulateFixes } from '../sim';

const T0 = Date.UTC(2026, 9, 8, 22, 0, 0);
const fixes = simulateFixes({ startT: T0, durationSec: 700, speedMps: 3, noiseM: 3 });

/** A fresh process: new module instances, same storage. */
async function freshSession() {
  vi.resetModules();
  return (await import('../session')).session;
}

beforeEach(() => {
  store.clear();
  failNextMultiSet = 0;
});

describe('recording session persistence', () => {
  it('restores a killed recording exactly, across sealed chunks and a pause', async () => {
    const s = await freshSession();
    await s.begin('run', { autoPause: true, now: T0 });
    s.ingest(fixes.slice(0, 300));
    s.pause(fixes[300].t);
    s.ingest(fixes.slice(300, 340)); // ignored while paused — and not logged
    s.resume(fixes[340].t);
    s.ingest(fixes.slice(340));
    await s.flush();
    const live = { d: s.recorder!.distanceM, mt: s.recorder!.movingSec, n: s.recorder!.points.length };

    const after = await freshSession(); // the OS killed Kasya
    expect(await after.restore()).toBe(true);
    expect(after.recorder!.distanceM).toBe(live.d);
    expect(after.recorder!.movingSec).toBe(live.mt);
    expect(after.recorder!.points.length).toBe(live.n);
    // fixes during the pause were never written
    const logged = [...store.entries()].filter(([k]) => k.startsWith('kasya:rec:chunk')).reduce((n, [, v]) => n + JSON.parse(v).length, 0);
    expect(logged).toBe(fixes.length - 40 + 2);
  });

  it('a run saved (finish) right before a kill never comes back as a recording', async () => {
    const s = await freshSession();
    await s.begin('run', { autoPause: true, now: T0 });
    s.ingest(fixes.slice(0, 200));
    s.finish();
    await s.flush(); // killed before clear()
    const after = await freshSession();
    expect(await after.restore()).toBe(false);
    expect([...store.keys()].some((k) => k.startsWith('kasya:rec'))).toBe(false);
  });

  it('restore() during clear() does not resurrect the run', async () => {
    const s = await freshSession();
    await s.begin('run', { autoPause: true, now: T0 });
    s.ingest(fixes.slice(0, 200));
    await s.flush();
    const clearing = s.clear();
    const restored = await s.restore(); // e.g. a queued background location event
    await clearing;
    expect(restored).toBe(false);
    expect(s.recorder).toBeNull();
    expect([...store.keys()].some((k) => k.startsWith('kasya:rec'))).toBe(false);
  });

  it('retries a failed write (sealed chunks included) instead of losing it', async () => {
    const s = await freshSession();
    await s.begin('run', { autoPause: true, now: T0 });
    s.ingest(fixes.slice(0, 160)); // seals chunk 0 inside this batch
    failNextMultiSet = 1;
    await s.flush(); // fails
    s.ingest(fixes.slice(160, 400));
    await s.flush(); // succeeds, carrying the earlier seal
    const live = s.recorder!.distanceM;
    const after = await freshSession();
    expect(await after.restore()).toBe(true);
    expect(after.recorder!.distanceM).toBe(live);
  });
});
