import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getFunctionName } from 'convex/server';

/**
 * The app-side submissions seam must NEVER throw into a screen: no Convex
 * (web demo), functions not deployed yet, or a hung connection all resolve to
 * calm states. Convex is faked by function name ("module:function").
 */

type Handler = (args: unknown) => Promise<unknown>;
let client: { query: Handler; mutation: Handler } | null = null;
let handlers: Record<string, Handler> = {};
let plan: 'free' | 'premium' = 'free';

vi.mock('../../convex/client', () => ({ getConvex: () => client }));
vi.mock('../../monetization/entitlements', () => ({ getPlan: async () => plan }));

function fakeConvex() {
  const call = (ref: unknown, args: unknown) => {
    const name = getFunctionName(ref as never);
    const h = handlers[name];
    return h ? h(args) : Promise.reject(new Error(`Could not find public function for '${name}'`));
  };
  return { query: call, mutation: call } as never;
}

import {
  loadMySubmissions,
  submitEntryRoute,
  submitRace,
  reportRace,
  amIAdmin,
  listPendingSubmissions,
  approveSubmission,
  canReportRaces,
} from '../submissionsApi';

const input = {
  name: 'Manila Marathon',
  dateStart: '2027-02-14',
  city: 'Manila',
  country: 'PH' as const,
  distances: ['42K' as const],
  officialUrl: 'https://manilamarathon.ph',
};

beforeEach(() => {
  client = null;
  handlers = {};
  plan = 'free';
});

afterEach(() => {
  vi.useRealTimers();
});

describe('without Convex (web demo)', () => {
  it('reports no_cloud and never throws', async () => {
    expect(await loadMySubmissions()).toEqual({ availability: 'no_cloud', submissions: [] });
    expect(await submitEntryRoute()).toBe('RaceSubmit');
    expect((await submitRace(input)).ok).toBe(false);
    expect((await reportRace('manila-marathon-2027', 'Wrong date')).ok).toBe(false);
    expect(await amIAdmin()).toBe(false);
    expect(await listPendingSubmissions()).toBeNull();
    expect((await approveSubmission('x')).ok).toBe(false);
    expect(await canReportRaces()).toBe(false);
  });
});

describe('with Convex', () => {
  beforeEach(() => {
    client = fakeConvex();
  });

  it('signed out → explains sign-in instead of the paywall', async () => {
    handlers['users:me'] = async () => null;
    expect(await loadMySubmissions()).toEqual({ availability: 'signed_out', submissions: [] });
    expect(await submitEntryRoute()).toBe('RaceSubmit');
  });

  it('free runners go to the paywall, Pro runners to the form', async () => {
    handlers['users:me'] = async () => ({ id: 'u1', email: 'a@b.co' });
    handlers['raceSubmissions:amIAdmin'] = async () => false;
    expect(await submitEntryRoute()).toBe('Paywall');
    plan = 'premium';
    expect(await submitEntryRoute()).toBe('RaceSubmit');
  });

  it('never sends a free runner to the paywall before submissions are deployed', async () => {
    handlers['users:me'] = async () => ({ id: 'u1', email: 'a@b.co' });
    expect(await submitEntryRoute()).toBe('RaceSubmit');
    expect(await canReportRaces()).toBe(false);
    handlers['raceSubmissions:amIAdmin'] = async () => false;
    expect(await canReportRaces()).toBe(true);
  });

  it('functions not deployed yet → calm "unavailable", not a crash', async () => {
    handlers['users:me'] = async () => ({ id: 'u1', email: 'a@b.co' });
    expect(await loadMySubmissions()).toEqual({ availability: 'unavailable', submissions: [] });
    const res = await submitRace(input);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.message).toMatch(/aren’t available right now/);
    expect(await amIAdmin()).toBe(false);
    expect(await listPendingSubmissions()).toBeNull();
  });

  it('a hung connection times out to "unavailable"', async () => {
    vi.useFakeTimers();
    handlers['users:me'] = () => new Promise(() => {});
    const pending = loadMySubmissions();
    await vi.advanceTimersByTimeAsync(9000);
    expect(await pending).toEqual({ availability: 'unavailable', submissions: [] });
  });

  it('passes server results through', async () => {
    handlers['users:me'] = async () => ({ id: 'u1', email: 'a@b.co' });
    handlers['raceSubmissions:mySubmissions'] = async () => [{ id: 's1', status: 'pending' }];
    expect(await loadMySubmissions()).toEqual({ availability: 'ready', submissions: [{ id: 's1', status: 'pending' }] });

    handlers['raceSubmissions:submitRace'] = async () => ({ ok: false, code: 'not_pro', message: 'Pro only' });
    expect(await submitRace(input)).toMatchObject({ ok: false, notPro: true, message: 'Pro only' });

    handlers['raceSubmissions:submitRace'] = async (args) => {
      expect(args).toEqual(input);
      return { ok: true, id: 's2' };
    };
    expect(await submitRace(input)).toEqual({ ok: true });

    handlers['raceSubmissions:amIAdmin'] = async () => true;
    expect(await amIAdmin()).toBe(true);
  });
});
