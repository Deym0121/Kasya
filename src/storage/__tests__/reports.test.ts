import { describe, it, expect, beforeEach, vi } from 'vitest';

// In-memory AsyncStorage so the reports IO layer is testable in node.
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
    multiRemove: async (ks: string[]) => {
      ks.forEach((k) => store.delete(k));
    },
  },
}));

import { listReports, saveReport, getLatestReport, deleteReport, clearReports } from '../reports';
import { GaitReportRecord } from '../reportRecord';
import { GaitResult } from '../../gait/types';

const result: GaitResult = {
  cadence: { value: 160, unit: 'spm', confidence: 'high' },
  stepCount: 20,
  durationSec: 10,
  captureQuality: { visibilityScore: 0.9, gaitCyclesDetected: 5, ok: true, issues: [] },
};

function makeReport(id: string): GaitReportRecord {
  return { id, createdAt: new Date().toISOString(), scanType: 'running', result, cadenceTip: 'tip' };
}

beforeEach(() => {
  store.clear();
});

describe('reports storage', () => {
  it('lists saved reports newest first', async () => {
    await saveReport(makeReport('a'));
    await saveReport(makeReport('b'));
    const all = await listReports();
    expect(all.map((r) => r.id)).toEqual(['b', 'a']);
    expect((await getLatestReport())?.id).toBe('b');
  });

  it('caps stored history at 20', async () => {
    for (let i = 0; i < 25; i++) await saveReport(makeReport(`r${i}`));
    const all = await listReports();
    expect(all.length).toBe(20);
    expect(all[0].id).toBe('r24'); // newest kept
  });

  it('deleteReport removes only the matching id', async () => {
    await saveReport(makeReport('a'));
    await saveReport(makeReport('b'));
    await deleteReport('a');
    expect((await listReports()).map((r) => r.id)).toEqual(['b']);
  });

  it('deleteReport with an unknown id is a no-op', async () => {
    await saveReport(makeReport('a'));
    await deleteReport('nope');
    expect((await listReports()).length).toBe(1);
  });

  it('clearReports empties the history', async () => {
    await saveReport(makeReport('a'));
    await clearReports();
    expect(await listReports()).toEqual([]);
    expect(await getLatestReport()).toBeNull();
  });

  it('tolerates corrupt stored JSON', async () => {
    store.set('kasya:reports:v1', '{not json');
    expect(await listReports()).toEqual([]);
  });

  it('drops malformed records but keeps the valid ones', async () => {
    const good = makeReport('good');
    store.set(
      'kasya:reports:v1',
      JSON.stringify([
        null, // partial write
        good,
        { id: 42, createdAt: good.createdAt, result }, // non-string id
        { id: 'no-date', result }, // missing createdAt
        { id: 'no-result', createdAt: good.createdAt }, // missing result entirely
        { id: 'no-cadence', createdAt: good.createdAt, result: { captureQuality: {} } }, // no cadence value
        { id: 'no-quality', createdAt: good.createdAt, result: { cadence: { value: 160 } } }, // no captureQuality
      ]),
    );
    const all = await listReports();
    expect(all.map((r) => r.id)).toEqual(['good']);
  });
});
