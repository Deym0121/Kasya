// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../../../convex/schema';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

/**
 * The club backend end to end on convex-test's in-memory Convex: clubs,
 * month totals from steps.sync, joins/leaves, country + global rankings,
 * reports, photos. Time is pinned to 2026-10-17 (UTC).
 */

const modules = import.meta.glob(['../../../convex/*.ts', '../../../convex/_generated/*.js']);
const NOW = Date.UTC(2026, 9, 17, 4, 0, 0);
const MONTH = '2026-10';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

type T = ReturnType<typeof convexTest>;

async function user(t: T, name: string) {
  const id = await t.run((ctx) => ctx.db.insert('users', { name } as never));
  return { id: id as Id<'users'>, as: t.withIdentity({ subject: `${id}|session-${name}` }) };
}

const day = (d: number, steps: number, runKm = 0, paceSec = 360) => ({
  day: `2026-10-${String(d).padStart(2, '0')}`,
  steps,
  activeMin: Math.round(steps / 150),
  kcal: Math.round(steps * 0.04),
  ...(runKm > 0 ? { runM: runKm * 1000, runSec: runKm * paceSec } : {}),
});

async function newClub(as: ReturnType<T['withIdentity']>, name: string, extra: Record<string, unknown> = {}) {
  const res = await as.mutation(api.clubs.create, { name, country: 'PH', ...extra });
  if (!res.ok) throw new Error(res.message);
  return res;
}

async function ranking(as: ReturnType<T['withIdentity']>, metric: 'steps' | 'distance' | 'pace', country?: string) {
  const res = await as.query(api.clubs.rankings, { month: MONTH, metric, ...(country ? { country } : {}) });
  if (!res.ok) throw new Error(res.message);
  return res;
}

describe('clubs', () => {
  it('creates a club whose month totals follow its members’ synced days', async () => {
    const t = convexTest(schema, modules);
    const josh = await user(t, 'Josh Ladero');
    const club = await newClub(josh.as, 'BGC Run Club', { city: 'Taguig' });

    let board = await ranking(josh.as, 'steps', 'PH');
    expect(board.rows).toHaveLength(0);
    expect(board.mine[0]).toMatchObject({ name: 'BGC Run Club', rank: null, memberCount: 1 });

    const sync = await josh.as.mutation(api.steps.sync, { days: [day(15, 12000, 10), day(16, 9000, 12)] });
    expect(sync).toMatchObject({ ok: true, written: 2 });

    board = await ranking(josh.as, 'steps', 'PH');
    expect(board.rows).toHaveLength(1);
    expect(board.rows[0]).toMatchObject({ id: club.clubId, rank: 1, steps: 21000, runM: 22000, isMine: true, country: 'PH' });

    // a changed day moves the club by the difference only
    await josh.as.mutation(api.steps.sync, { days: [day(15, 12000, 10), day(16, 11000, 12)] });
    board = await ranking(josh.as, 'steps');
    expect(board.rows[0].steps).toBe(23000);

    const profile = await josh.as.query(api.clubs.profile, { clubId: club.clubId, month: MONTH });
    expect(profile.ok && profile.club).toMatchObject({
      isOwner: true,
      isMember: true,
      code: club.code,
      memberCount: 1,
      stats: { steps: 23000, runM: 22000 },
      rankCountry: { rank: 1 },
      rankGlobal: { rank: 1 },
    });
  });

  it('adds a joiner’s month and removes it again when they leave', async () => {
    const t = convexTest(schema, modules);
    const owner = await user(t, 'Ana');
    const joiner = await user(t, 'Ben');
    const club = await newClub(owner.as, 'Sunrise Striders');
    await owner.as.mutation(api.steps.sync, { days: [day(10, 8000)] });

    // Ben already shares steps through a private friends' group
    const g = await joiner.as.mutation(api.groups.create, { name: 'Office Squad' });
    expect(g.ok).toBe(true);
    await joiner.as.mutation(api.steps.sync, { days: [day(10, 5000, 6), day(11, 7000)] });

    const joined = await joiner.as.mutation(api.clubs.joinOpen, { clubId: club.clubId });
    expect(joined).toMatchObject({ ok: true, alreadyMember: false });
    let board = await ranking(owner.as, 'steps', 'PH');
    expect(board.rows[0]).toMatchObject({ steps: 20000, runM: 6000, memberCount: 2 });

    // Ben's new days reach the club too
    await joiner.as.mutation(api.steps.sync, { days: [day(10, 5000, 6), day(11, 7000), day(12, 3000)] });
    board = await ranking(owner.as, 'steps', 'PH');
    expect(board.rows[0].steps).toBe(23000);

    const left = await joiner.as.mutation(api.groups.leave, { groupId: club.clubId });
    expect(left.ok).toBe(true);
    board = await ranking(owner.as, 'steps', 'PH');
    expect(board.rows[0]).toMatchObject({ steps: 8000, runM: 0, memberCount: 1 });

    // Ben is still in his friends' group, so his own totals stay on the server
    const rows = await t.run((ctx) => ctx.db.query('memberMonths').collect());
    expect(rows.find((r) => r.userId === joiner.id)?.steps).toBe(15000);
  });

  it('counts step days uploaded before clubs existed', async () => {
    const t = convexTest(schema, modules);
    const josh = await user(t, 'Josh');
    // A friends'-group member from before clubs: day rows but no month rows.
    await josh.as.mutation(api.groups.create, { name: 'Friends' });
    await t.run(async (ctx) => {
      for (const d of [1, 2, 3]) {
        await ctx.db.insert('stepDays', { userId: josh.id, ...day(d, 10000), updatedAt: NOW });
      }
    });
    const club = await newClub(josh.as, 'Late Adopters');
    await josh.as.mutation(api.steps.sync, { days: [day(1, 10000), day(2, 10000), day(3, 10000), day(4, 4000)] });
    const board = await ranking(josh.as, 'steps', 'PH');
    expect(board.rows[0]).toMatchObject({ id: club.clubId, steps: 34000 });
  });

  it('ranks by country or worldwide, on steps, distance and pace', async () => {
    const t = convexTest(schema, modules);
    const a = await user(t, 'A');
    const b = await user(t, 'B');
    const c = await user(t, 'C');
    const ph1 = await newClub(a.as, 'Manila Milers');
    const ph2 = await newClub(b.as, 'Cebu Pacers');
    const us = await newClub(c.as, 'Brooklyn Track', { country: 'US' });
    // Manila: most steps, slow pace. Cebu: fewer steps, most km, fastest. Brooklyn: biggest worldwide.
    await a.as.mutation(api.steps.sync, { days: [day(5, 30000, 8, 420), day(6, 30000, 15, 420)] });
    await b.as.mutation(api.steps.sync, { days: [day(5, 20000, 15, 300), day(6, 20000, 15, 300)] });
    await c.as.mutation(api.steps.sync, { days: [day(5, 70000, 4, 330)] });

    const steps = await ranking(a.as, 'steps', 'PH');
    expect(steps.rows.map((r) => r.id)).toEqual([ph1.clubId, ph2.clubId]);
    const world = await ranking(a.as, 'steps');
    expect(world.rows.map((r) => r.id)).toEqual([us.clubId, ph1.clubId, ph2.clubId]);
    expect(world.mine[0]).toMatchObject({ id: ph1.clubId, rank: 2 });

    const distance = await ranking(a.as, 'distance', 'PH');
    expect(distance.rows.map((r) => r.id)).toEqual([ph2.clubId, ph1.clubId]);

    // pace: Brooklyn ran only 4 km (< 20 km) so it isn't ranked on pace
    const pace = await ranking(a.as, 'pace');
    expect(pace.rows.map((r) => r.id)).toEqual([ph2.clubId, ph1.clubId]);

    // US clubs don't show on the Philippine board, and my rank there is null for a US club
    const usBoard = await ranking(c.as, 'steps', 'PH');
    expect(usBoard.rows.every((r) => r.country === 'PH')).toBe(true);
    expect(usBoard.mine[0]).toMatchObject({ id: us.clubId, rank: null });
  });

  it('moves a club’s rows when its country changes', async () => {
    const t = convexTest(schema, modules);
    const a = await user(t, 'A');
    const club = await newClub(a.as, 'Movers');
    await a.as.mutation(api.steps.sync, { days: [day(5, 9000)] });
    expect((await ranking(a.as, 'steps', 'PH')).rows).toHaveLength(1);
    const res = await a.as.mutation(api.clubs.update, { clubId: club.clubId, country: 'SG' });
    expect(res.ok).toBe(true);
    expect((await ranking(a.as, 'steps', 'PH')).rows).toHaveLength(0);
    expect((await ranking(a.as, 'steps', 'SG')).rows).toHaveLength(1);
  });

  it('keeps invite-only clubs closed to page joins, open to codes', async () => {
    const t = convexTest(schema, modules);
    const owner = await user(t, 'Owner');
    const guest = await user(t, 'Guest');
    const club = await newClub(owner.as, 'Closed Circle', { open: false });
    const page = await guest.as.mutation(api.clubs.joinOpen, { clubId: club.clubId });
    expect(page).toMatchObject({ ok: false, reason: 'invalid' });
    const profile = await guest.as.query(api.clubs.profile, { clubId: club.clubId, month: MONTH });
    expect(profile.ok && profile.club.code).toBeNull();
    const byCode = await guest.as.mutation(api.groups.join, { code: club.code });
    expect(byCode).toMatchObject({ ok: true, alreadyMember: false });
    const after = await guest.as.query(api.clubs.profile, { clubId: club.clubId, month: MONTH });
    expect(after.ok && after.club).toMatchObject({ isMember: true, memberCount: 2, code: club.code });
  });

  it('refuses rude names but not Batangas', async () => {
    const t = convexTest(schema, modules);
    const a = await user(t, 'A');
    expect(await a.as.mutation(api.clubs.create, { name: 'Tangina Runners', country: 'PH' })).toMatchObject({ ok: false });
    expect(await a.as.mutation(api.clubs.create, { name: 'F*ck Hills', country: 'PH' })).toMatchObject({ ok: true });
    // ("F*ck" isn't caught by the first-line filter — reports exist for that.)
    expect(await a.as.mutation(api.clubs.create, { name: 'Batangas Runners', country: 'PH' })).toMatchObject({ ok: true });
  });

  it('limits clubs per runner', async () => {
    const t = convexTest(schema, modules);
    const a = await user(t, 'A');
    await newClub(a.as, 'One');
    await newClub(a.as, 'Two');
    expect(await a.as.mutation(api.clubs.create, { name: 'Three', country: 'PH' })).toMatchObject({
      ok: false,
      reason: 'too_many_groups',
    });
  });

  it('hides a club after three reports until an admin restores it', async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv('ADMIN_EMAILS', 'admin@kasya.app');
    const owner = await user(t, 'Owner');
    const club = await newClub(owner.as, 'Spammy Club');
    await owner.as.mutation(api.steps.sync, { days: [day(5, 9000)] });
    const reporters = await Promise.all(['R1', 'R2', 'R3'].map((n) => user(t, n)));

    expect(await owner.as.mutation(api.clubs.report, { clubId: club.clubId, reason: 'spam' })).toMatchObject({ ok: false });
    for (const r of reporters.slice(0, 2)) {
      expect(await r.as.mutation(api.clubs.report, { clubId: club.clubId, reason: 'spam' })).toMatchObject({ ok: true });
    }
    // the same runner twice counts once
    expect(await reporters[0].as.mutation(api.clubs.report, { clubId: club.clubId, reason: 'spam' })).toMatchObject({
      ok: true,
      already: true,
    });
    expect((await ranking(owner.as, 'steps', 'PH')).rows).toHaveLength(1);
    await reporters[2].as.mutation(api.clubs.report, { clubId: club.clubId, reason: 'inappropriate', note: 'bad photo' });
    expect((await ranking(owner.as, 'steps', 'PH')).rows).toHaveLength(0);

    // members still see their club; others don't
    expect(await reporters[0].as.query(api.clubs.profile, { clubId: club.clubId, month: MONTH })).toMatchObject({ ok: false });
    const mine = await owner.as.query(api.clubs.profile, { clubId: club.clubId, month: MONTH });
    expect(mine.ok && mine.club.hidden).toBe(true);
    expect(await reporters[0].as.mutation(api.clubs.joinOpen, { clubId: club.clubId })).toMatchObject({ ok: false });

    const adminId = await t.run((ctx) => ctx.db.insert('users', { name: 'Admin', email: 'admin@kasya.app' } as never));
    const admin = t.withIdentity({ subject: `${adminId}|s` });
    const queue = await admin.query(api.clubs.adminReported, {});
    expect(queue.ok && queue.clubs[0]).toMatchObject({ id: club.clubId, hidden: true });
    expect(queue.ok && queue.clubs[0].reports).toHaveLength(3);
    expect(await reporters[0].as.query(api.clubs.adminReported, {})).toMatchObject({ ok: false });

    await admin.mutation(api.clubs.adminReview, { clubId: club.clubId, hidden: false });
    expect((await ranking(owner.as, 'steps', 'PH')).rows).toHaveLength(1);
    vi.unstubAllEnvs();
  });

  it('deletes a club’s rankings rows with the club', async () => {
    const t = convexTest(schema, modules);
    const a = await user(t, 'A');
    const club = await newClub(a.as, 'Short Lived');
    await a.as.mutation(api.steps.sync, { days: [day(5, 9000)] });
    expect(await a.as.mutation(api.groups.remove, { groupId: club.clubId })).toMatchObject({ ok: true });
    const rows = await t.run((ctx) => ctx.db.query('clubMonths').collect());
    expect(rows).toHaveLength(0);
    expect((await ranking(a.as, 'steps')).rows).toHaveLength(0);
  });

  it('drops implausible run days', async () => {
    const t = convexTest(schema, modules);
    const a = await user(t, 'A');
    await newClub(a.as, 'Speedsters');
    // 10 km in 10 minutes isn't a run
    await a.as.mutation(api.steps.sync, { days: [{ ...day(5, 9000), runM: 10_000, runSec: 600 }] });
    const board = await ranking(a.as, 'steps');
    expect(board.rows[0]).toMatchObject({ steps: 9000, runM: 0 });
  });

  it('sets and replaces a club photo (owner only, images only)', async () => {
    const t = convexTest(schema, modules);
    const owner = await user(t, 'Owner');
    const other = await user(t, 'Other');
    const club = await newClub(owner.as, 'Photo Club');
    const png = await t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })));
    const txt = await t.run((ctx) => ctx.storage.store(new Blob(['hello'], { type: 'text/plain' })));

    expect(await other.as.mutation(api.clubs.setPhoto, { clubId: club.clubId, storageId: png })).toMatchObject({
      ok: false,
      reason: 'not_owner',
    });
    expect(await owner.as.mutation(api.clubs.setPhoto, { clubId: club.clubId, storageId: txt })).toMatchObject({ ok: false });
    // convex-test keeps no content type on stored files (a real upload carries
    // the POST's Content-Type), so an untyped file is refused here — attach the
    // photo directly to exercise the rest.
    expect(await owner.as.mutation(api.clubs.setPhoto, { clubId: club.clubId, storageId: png })).toMatchObject({ ok: false });
    // ...and a refused upload is deleted, not left behind
    expect(await t.run((ctx) => ctx.db.system.get(png))).toBeNull();
    const photo = await t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array([255, 216, 255])], { type: 'image/jpeg' })));
    await t.run((ctx) => ctx.db.patch(club.clubId, { photoId: photo }));
    const profile = await owner.as.query(api.clubs.profile, { clubId: club.clubId, month: MONTH });
    expect(profile.ok && profile.club.photoUrl).toBeTruthy();

    // another owner can't take over this photo by its id
    const second = await newClub(other.as, 'Copycats');
    expect(await other.as.mutation(api.clubs.setPhoto, { clubId: second.clubId, storageId: photo })).toMatchObject({ ok: false });
    expect(await t.run((ctx) => ctx.db.system.get(photo))).not.toBeNull();

    expect(await owner.as.mutation(api.clubs.clearPhoto, { clubId: club.clubId })).toMatchObject({ ok: true });
    const cleared = await owner.as.query(api.clubs.profile, { clubId: club.clubId, month: MONTH });
    expect(cleared.ok && cleared.club.photoUrl).toBeNull();
    expect(await t.run((ctx) => ctx.db.system.get(photo))).toBeNull();
  });

  it('shows run distance on the member leaderboard and club fields on my groups', async () => {
    const t = convexTest(schema, modules);
    const a = await user(t, 'A');
    const club = await newClub(a.as, 'Track Rats', { emblem: 'fire|#FFA24C' });
    await a.as.mutation(api.steps.sync, { days: [day(12, 9000, 5)] });
    const lb = await a.as.query(api.groups.leaderboard, { groupId: club.clubId, fromDay: '2026-10-12', toDay: '2026-10-18' });
    expect(lb.ok && lb.group).toMatchObject({ kind: 'club', country: 'PH', emblem: 'fire|#FFA24C' });
    expect(lb.ok && lb.members[0]).toMatchObject({ steps: 9000, runM: 5000, runSec: 1800 });
    const mine = await a.as.query(api.groups.mine, { fromDay: '2026-10-12', toDay: '2026-10-18' });
    expect(mine.signedIn && mine.groups[0]).toMatchObject({ kind: 'club', myRank: 1 });
  });

  it('takes a deleted account out of its clubs', async () => {
    const t = convexTest(schema, modules);
    const owner = await user(t, 'Owner');
    const member = await user(t, 'Member');
    const club = await newClub(owner.as, 'Keepers');
    await owner.as.mutation(api.steps.sync, { days: [day(5, 9000)] });
    await member.as.mutation(api.clubs.joinOpen, { clubId: club.clubId });
    await member.as.mutation(api.steps.sync, { days: [day(5, 4000, 5)] });
    expect((await ranking(owner.as, 'steps')).rows[0]).toMatchObject({ steps: 13000, memberCount: 2 });
    await member.as.mutation(api.users.deleteAccount, {});
    expect((await ranking(owner.as, 'steps')).rows[0]).toMatchObject({ steps: 9000, runM: 0, memberCount: 1 });
    const left = await t.run((ctx) => ctx.db.query('memberMonths').collect());
    expect(left.every((r) => r.userId !== member.id)).toBe(true);
  });

  it('finds listed clubs by name', async () => {
    const t = convexTest(schema, modules);
    const a = await user(t, 'A');
    const b = await user(t, 'B');
    await newClub(a.as, 'Quezon City Runners');
    await newClub(b.as, 'QC Night Owls', { country: 'PH' });
    await b.as.mutation(api.groups.create, { name: 'Quezon Friends' }); // private: never listed
    const res = await a.as.query(api.clubs.search, { text: 'Quezon' });
    expect(res.rows.map((r) => r.name)).toEqual(['Quezon City Runners']);
    expect(res.rows[0]).toMatchObject({ isMine: true, open: true, kind: 'club' });
  });
});
