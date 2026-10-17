import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getFunctionName } from 'convex/server';

/**
 * The Groups seam must never throw into a screen, and — the privacy promise —
 * step totals must never leave the phone for a guest or a user in zero groups.
 * Convex is faked by function name ("module:function").
 */

type Handler = (args: any) => Promise<unknown>;
let client: { query: Handler; mutation: Handler } | null = null;
let handlers: Record<string, Handler> = {};
let calls: { name: string; args: any }[] = [];

vi.mock('../../convex/client', () => ({ getConvex: () => client }));

function fakeConvex() {
  const call = (ref: unknown, args: unknown) => {
    const name = getFunctionName(ref as never);
    calls.push({ name, args });
    const h = handlers[name];
    return h ? h(args) : Promise.reject(new Error(`Could not find public function for '${name}'`));
  };
  return { query: call, mutation: call } as never;
}

import {
  __resetGroupSyncForTests,
  createGroup,
  joinGroup,
  leaveGroup,
  loadLeaderboard,
  loadMyGroups,
  resyncStepDays,
  syncStepDays,
} from '../api';

const week = { fromDay: '2026-10-12', toDay: '2026-10-18' };
const days = [
  { day: '2026-10-16', steps: 8000, activeMin: 40, kcal: 300 },
  { day: '2026-10-17', steps: 4200.4, activeMin: 21, kcal: 150 },
];
const uploads = () => calls.filter((c) => c.name === 'steps:sync');

beforeEach(() => {
  client = null;
  handlers = {};
  calls = [];
  __resetGroupSyncForTests();
});

describe('syncStepDays privacy gate', () => {
  it('is a no-op without Convex', async () => {
    expect(await syncStepDays(days)).toBe('no_cloud');
    expect(calls).toHaveLength(0);
  });

  it('uploads nothing for guests / signed-out users', async () => {
    client = fakeConvex();
    handlers['groups:myGroupCount'] = async () => null;
    handlers['steps:sync'] = async () => ({ ok: true, written: 2, skipped: 0 });
    expect(await syncStepDays(days)).toBe('signed_out');
    expect(uploads()).toHaveLength(0);
  });

  it('uploads nothing while the user is in zero groups', async () => {
    client = fakeConvex();
    handlers['groups:myGroupCount'] = async () => 0;
    handlers['steps:sync'] = async () => ({ ok: true, written: 2, skipped: 0 });
    expect(await syncStepDays(days)).toBe('no_groups');
    expect(uploads()).toHaveLength(0);
  });

  it('uploads cleaned daily totals once the user is in a group', async () => {
    client = fakeConvex();
    handlers['groups:myGroupCount'] = async () => 2;
    handlers['steps:sync'] = async () => ({ ok: true, written: 2, skipped: 0 });
    expect(await syncStepDays(days)).toBe('uploaded');
    expect(uploads()).toHaveLength(1);
    expect(uploads()[0].args).toEqual({
      days: [
        { day: '2026-10-16', steps: 8000, activeMin: 40, kcal: 300 },
        { day: '2026-10-17', steps: 4200, activeMin: 21, kcal: 150 },
      ],
    });
  });

  it('skips an identical payload right after a successful upload', async () => {
    client = fakeConvex();
    handlers['groups:myGroupCount'] = async () => 1;
    handlers['steps:sync'] = async () => ({ ok: true, written: 2, skipped: 0 });
    await syncStepDays(days);
    expect(await syncStepDays(days)).toBe('unchanged');
    expect(uploads()).toHaveLength(1);
    // a changed day goes up again
    expect(await syncStepDays([{ ...days[0], steps: 9000 }])).toBe('uploaded');
    expect(uploads()).toHaveLength(2);
  });

  it('sends at most the most recent 62 days', async () => {
    client = fakeConvex();
    handlers['groups:myGroupCount'] = async () => 1;
    handlers['steps:sync'] = async () => ({ ok: true, written: 62, skipped: 0 });
    const many = Array.from({ length: 80 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 7, 1 + i));
      return { day: d.toISOString().slice(0, 10), steps: 1000, activeMin: 5, kcal: 50 };
    });
    await syncStepDays(many);
    expect(uploads()[0].args.days).toHaveLength(62);
    expect(uploads()[0].args.days[61].day).toBe(many[79].day);
  });

  it('returns nothing to do for empty or invalid input', async () => {
    client = fakeConvex();
    expect(await syncStepDays([])).toBe('nothing');
    expect(await syncStepDays([{ day: 'x', steps: 1, activeMin: 1, kcal: 1 }])).toBe('nothing');
    expect(calls).toHaveLength(0);
  });

  it('never throws when the backend is missing or offline', async () => {
    client = fakeConvex(); // no handlers: "Could not find public function"
    expect(await syncStepDays(days)).toBe('failed');
  });

  it('respects a server-side refusal', async () => {
    client = fakeConvex();
    handlers['groups:myGroupCount'] = async () => 1;
    handlers['steps:sync'] = async () => ({ ok: false, reason: 'no_groups', message: 'x' });
    expect(await syncStepDays(days)).toBe('no_groups');
  });

  it('re-sends the remembered days after joining a group', async () => {
    client = fakeConvex();
    let count = 0;
    handlers['groups:myGroupCount'] = async () => count;
    handlers['steps:sync'] = async () => ({ ok: true, written: 2, skipped: 0 });
    handlers['groups:join'] = async () => {
      count = 1;
      return { ok: true, groupId: 'g1', alreadyMember: false };
    };
    expect(await syncStepDays(days)).toBe('no_groups');
    expect(await joinGroup('K7M2QX')).toEqual({ ok: true, groupId: 'g1', alreadyMember: false });
    // the join already pushed them; a non-forced resync (screen load) dedupes
    expect(await resyncStepDays({ force: false })).toBe('unchanged');
    expect(uploads()).toHaveLength(1);
  });

  it('resync is a no-op before the dashboard has handed over any days', async () => {
    client = fakeConvex();
    expect(await resyncStepDays()).toBe('nothing');
    expect(calls).toHaveLength(0);
  });
});

describe('leaving', () => {
  it('deletes uploaded step data when the last group is left', async () => {
    client = fakeConvex();
    handlers['groups:leave'] = async () => ({ ok: true, remainingGroups: 0 });
    handlers['steps:deleteMine'] = async () => ({ ok: true, deleted: 5 });
    expect((await leaveGroup('g1')).ok).toBe(true);
    expect(calls.map((c) => c.name)).toEqual(['groups:leave', 'steps:deleteMine']);
  });

  it('keeps step data while other groups remain', async () => {
    client = fakeConvex();
    handlers['groups:leave'] = async () => ({ ok: true, remainingGroups: 1 });
    expect((await leaveGroup('g1')).ok).toBe(true);
    expect(calls.map((c) => c.name)).toEqual(['groups:leave']);
  });

  it('a successful upload is not deduped against after leaving everything', async () => {
    client = fakeConvex();
    let count = 1;
    handlers['groups:myGroupCount'] = async () => count;
    handlers['steps:sync'] = async () => ({ ok: true, written: 2, skipped: 0 });
    handlers['groups:leave'] = async () => {
      count = 0;
      return { ok: true, remainingGroups: 0 };
    };
    handlers['steps:deleteMine'] = async () => ({ ok: true, deleted: 2 });
    handlers['groups:join'] = async () => {
      count = 1;
      return { ok: true, groupId: 'g2', alreadyMember: false };
    };
    await syncStepDays(days);
    await leaveGroup('g1');
    await joinGroup('ABCDEF');
    await resyncStepDays({ force: false });
    expect(uploads()).toHaveLength(2); // re-uploaded after rejoining
  });
});

describe('fail-soft reads and writes', () => {
  it('reports no_cloud without Convex', async () => {
    expect(await loadMyGroups(week)).toEqual({ availability: 'no_cloud', groups: [], lifetimeSteps: 0 });
    expect((await loadLeaderboard('g1', week)).status).toBe('no_cloud');
    expect((await createGroup('Crew')).ok).toBe(false);
  });

  it('tells guests to sign in', async () => {
    client = fakeConvex();
    handlers['users:me'] = async () => null;
    handlers['groups:mine'] = async () => ({ signedIn: false, groups: [], lifetimeSteps: 0 });
    expect((await loadMyGroups(week)).availability).toBe('signed_out');
  });

  it('says unavailable when the functions are not deployed yet', async () => {
    client = fakeConvex();
    handlers['users:me'] = async () => ({ id: 'u1', email: null });
    expect((await loadMyGroups(week)).availability).toBe('unavailable');
    expect((await loadLeaderboard('g1', week)).status).toBe('unavailable');
    expect(await createGroup('Crew')).toEqual({
      ok: false,
      message: 'That didn’t go through — check your connection and try again.',
    });
  });

  it('passes the local week to mine()', async () => {
    client = fakeConvex();
    handlers['users:me'] = async () => ({ id: 'u1', email: null });
    handlers['groups:mine'] = async () => ({
      signedIn: true,
      groups: [{ id: 'g1', name: 'Crew', code: 'K7M2QX', role: 'owner', memberCount: 3, myRank: 1, joinedAt: 1 }],
      lifetimeSteps: 123_000,
    });
    const res = await loadMyGroups(week);
    expect(res.availability).toBe('ready');
    expect(res.lifetimeSteps).toBe(123_000);
    expect(res.groups[0].myRank).toBe(1);
    expect(calls.find((c) => c.name === 'groups:mine')?.args).toEqual(week);
  });

  it('maps a server refusal to its message', async () => {
    client = fakeConvex();
    handlers['groups:join'] = async () => ({ ok: false, reason: 'rate_limited', message: 'Too many wrong codes.' });
    handlers['groups:leaderboard'] = async () => ({ ok: false, reason: 'not_member', message: 'Not in it.' });
    expect(await joinGroup('ZZZZZZ')).toEqual({ ok: false, message: 'Too many wrong codes.' });
    expect(await loadLeaderboard('g1', week)).toEqual({ status: 'not_member', message: 'Not in it.' });
  });
});
