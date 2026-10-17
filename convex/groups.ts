import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { getAuthUserId } from '@convex-dev/auth/server';
import {
  GROUP_LIMITS as L,
  cleanGroupName,
  isValidRange,
  makeInviteCode,
  normalizeInviteCode,
  publicDisplayName,
  rankMembers,
} from '../src/groups/rules';
import { purgeIfGroupless } from './steps';
import { CLUB_LIMITS, cleanClubName } from '../src/clubs/rules';
import { addMemberToClub, deleteClubData, isClub, removeMemberFromClub } from './clubStats';

/**
 * Step groups + leaderboards.
 *
 *   create ─▶ group + owner membership (invite code)
 *   join   ─▶ membership by code (wrong codes are rate-limited per user)
 *   leave / removeMember / remove ─▶ ownership passes to the earliest-joined
 *            member; an empty group is deleted; a user left in no group has
 *            their step totals purged (steps.purgeIfGroupless)
 *   mine / leaderboard ─▶ ranked weekly/monthly totals, members only
 *
 * Day ranges come from the client as LOCAL day keys (the server can't know
 * the runner's time zone). Expected failures are RETURNED as
 * { ok: false, reason, message } — production deployments redact throws, and
 * a returned failure still commits the join rate-limit counter.
 */

type Ctx = QueryCtx | MutationCtx;
const HOUR_MS = 3_600_000;
/** mine(): stop ranking past this many distinct members (keeps the query cheap) */
const MAX_RANKED_USERS = 800;

export type GroupFailReason =
  | 'signed_out'
  | 'invalid'
  | 'too_many_groups'
  | 'group_full'
  | 'not_found'
  | 'rate_limited'
  | 'not_member'
  | 'not_owner'
  | 'busy';

export type GroupFail = { ok: false; reason: GroupFailReason; message: string };

export function fail(reason: GroupFailReason, message: string): GroupFail {
  return { ok: false, reason, message };
}

/** rateLimits key for wrong invite codes (also cleared by account deletion). */
export function joinRateKey(userId: Id<'users'>): string {
  return `groupjoin:${userId}`;
}

export async function membershipsOf(ctx: Ctx, userId: Id<'users'>): Promise<Doc<'groupMembers'>[]> {
  return ctx.db
    .query('groupMembers')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect();
}

/** Members of a group, earliest-joined first. */
export async function membersOf(ctx: Ctx, groupId: Id<'groups'>): Promise<Doc<'groupMembers'>[]> {
  const rows = await ctx.db
    .query('groupMembers')
    .withIndex('by_group', (q) => q.eq('groupId', groupId))
    .collect();
  return rows.sort((a, b) => a.joinedAt - b.joinedAt || a._creationTime - b._creationTime);
}

export async function membershipOf(
  ctx: Ctx,
  groupId: Id<'groups'>,
  userId: Id<'users'>,
): Promise<Doc<'groupMembers'> | null> {
  return ctx.db
    .query('groupMembers')
    .withIndex('by_group_user', (q) => q.eq('groupId', groupId).eq('userId', userId))
    .first();
}

export async function displayNameFor(ctx: Ctx, userId: Id<'users'>): Promise<string> {
  const user = await ctx.db.get(userId);
  return publicDisplayName((user as { name?: unknown } | null)?.name, userId);
}

function secureRandom(): number {
  try {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] / 4_294_967_296;
  } catch {
    return Math.random();
  }
}

export async function uniqueInviteCode(ctx: MutationCtx): Promise<string | null> {
  for (let i = 0; i < 12; i++) {
    const code = makeInviteCode(secureRandom);
    const taken = await ctx.db
      .query('groups')
      .withIndex('by_code', (q) => q.eq('code', code))
      .first();
    if (!taken) return code;
  }
  return null;
}

/**
 * Remove one membership. If it was the owner's, ownership passes to the
 * earliest-joined remaining member — or the group is deleted when empty.
 * Shared with account deletion (users.ts).
 */
export async function detachMember(ctx: MutationCtx, member: Doc<'groupMembers'>): Promise<void> {
  const group = await ctx.db.get(member.groupId);
  if (isClub(group)) {
    await removeMemberFromClub(ctx, group, member);
    await ctx.db.patch(group._id, { memberCount: Math.max(0, (group.memberCount ?? 1) - 1) });
  }
  await ctx.db.delete(member._id);
  if (!group || group.ownerId !== member.userId) return;
  const rest = await membersOf(ctx, member.groupId);
  if (rest.length === 0) {
    if (isClub(group)) await deleteClubData(ctx, group);
    await ctx.db.delete(group._id);
    return;
  }
  const heir = rest[0];
  await ctx.db.patch(heir._id, { role: 'owner' });
  await ctx.db.patch(group._id, { ownerId: heir.userId });
}

/** How many of these memberships are running clubs. */
export async function clubCount(ctx: Ctx, memberships: Doc<'groupMembers'>[]): Promise<number> {
  let n = 0;
  for (const m of memberships) if (isClub(await ctx.db.get(m.groupId))) n++;
  return n;
}

/**
 * Add a member to a group or club after the caller's checks (code / open
 * club): membership limits, club capacity, then the row — a club also starts
 * counting the newcomer's month totals.
 */
export async function addMembership(
  ctx: MutationCtx,
  group: Doc<'groups'>,
  userId: Id<'users'>,
): Promise<{ ok: true; groupId: Id<'groups'>; alreadyMember: boolean } | GroupFail> {
  if (await membershipOf(ctx, group._id, userId)) return { ok: true, groupId: group._id, alreadyMember: true };
  const mine = await membershipsOf(ctx, userId);
  const club = isClub(group);
  const noun = club ? 'clubs and groups' : 'groups';
  if (mine.length >= L.maxGroupsPerUser) {
    return fail('too_many_groups', `You’re in ${L.maxGroupsPerUser} ${noun} already — leave one to join another.`);
  }
  if (club && (await clubCount(ctx, mine)) >= CLUB_LIMITS.maxClubsPerUser) {
    return fail('too_many_groups', `You’re in ${CLUB_LIMITS.maxClubsPerUser} clubs already — leave one to join another.`);
  }
  const cap = club ? CLUB_LIMITS.maxMembersPerClub : L.maxMembersPerGroup;
  const members = await ctx.db
    .query('groupMembers')
    .withIndex('by_group', (q) => q.eq('groupId', group._id))
    .take(cap);
  if (members.length >= cap) {
    return fail('group_full', `“${group.name}” is full (${cap} members).`);
  }
  const now = Date.now();
  await ctx.db.insert('groupMembers', {
    groupId: group._id,
    userId,
    displayName: await displayNameFor(ctx, userId),
    joinedAt: now,
    role: 'member',
  });
  if (club) {
    await ctx.db.patch(group._id, { memberCount: members.length + 1 });
    await addMemberToClub(ctx, group, userId, now);
  }
  return { ok: true, groupId: group._id, alreadyMember: false };
}

interface Totals {
  steps: number;
  activeMin: number;
  kcal: number;
  runM: number;
  runSec: number;
  daysWithData: number;
}

/** One user's totals over [fromDay, toDay] (≤ 62 rows by the range rule). */
async function totalsFor(ctx: Ctx, userId: Id<'users'>, fromDay: string, toDay: string): Promise<Totals> {
  const rows = await ctx.db
    .query('stepDays')
    .withIndex('by_user_day', (q) => q.eq('userId', userId).gte('day', fromDay).lte('day', toDay))
    .collect();
  const t: Totals = { steps: 0, activeMin: 0, kcal: 0, runM: 0, runSec: 0, daysWithData: 0 };
  for (const r of rows) {
    t.steps += r.steps;
    t.activeMin += r.activeMin;
    t.kcal += r.kcal;
    t.runM += r.runM ?? 0;
    t.runSec += r.runSec ?? 0;
    if (r.steps > 0) t.daysWithData++;
  }
  return t;
}

async function lifetimeFor(ctx: Ctx, userId: Id<'users'>): Promise<number> {
  const stats = await ctx.db
    .query('userStats')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .first();
  return stats?.lifetimeSteps ?? 0;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export type CreateGroupResult = { ok: true; groupId: Id<'groups'>; code: string } | GroupFail;

export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }): Promise<CreateGroupResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return fail('signed_out', 'Sign in to create a group.');
    const clean = cleanGroupName(name);
    if (!clean.ok) return fail('invalid', clean.message);
    const mine = await membershipsOf(ctx, userId);
    if (mine.length >= L.maxGroupsPerUser) {
      return fail('too_many_groups', `You’re in ${L.maxGroupsPerUser} groups already — leave one to start another.`);
    }
    const code = await uniqueInviteCode(ctx);
    if (!code) return fail('busy', 'Couldn’t create the group just now — try again.');
    const now = Date.now();
    const groupId = await ctx.db.insert('groups', { name: clean.name, ownerId: userId, code, createdAt: now });
    await ctx.db.insert('groupMembers', {
      groupId,
      userId,
      displayName: await displayNameFor(ctx, userId),
      joinedAt: now,
      role: 'owner',
    });
    return { ok: true, groupId, code };
  },
});

export type JoinGroupResult = { ok: true; groupId: Id<'groups'>; alreadyMember: boolean } | GroupFail;

export const join = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }): Promise<JoinGroupResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return fail('signed_out', 'Sign in to join a group.');
    const now = Date.now();
    const windowStart = Math.floor(now / HOUR_MS);
    const key = joinRateKey(userId);
    const limit = await ctx.db
      .query('rateLimits')
      .withIndex('by_key', (q) => q.eq('key', key))
      .first();
    if (limit && limit.windowStart === windowStart && limit.count >= L.joinFailuresPerHour) {
      return fail('rate_limited', 'Too many wrong codes — wait a little and try again.');
    }
    const normalized = normalizeInviteCode(code);
    if (!normalized) return fail('invalid', 'Invite codes are 6 letters and numbers, like K7M2QX.');

    const group = await ctx.db
      .query('groups')
      .withIndex('by_code', (q) => q.eq('code', normalized))
      .first();
    if (!group) {
      // Count the miss — committed because we return instead of throwing.
      if (!limit) await ctx.db.insert('rateLimits', { key, windowStart, count: 1 });
      else if (limit.windowStart !== windowStart) await ctx.db.patch(limit._id, { windowStart, count: 1 });
      else await ctx.db.patch(limit._id, { count: limit.count + 1 });
      return fail('not_found', 'We couldn’t find a group with that code — double-check it with your friend.');
    }

    return addMembership(ctx, group, userId);
  },
});

export type LeaveGroupResult = { ok: true; remainingGroups: number } | GroupFail;

/** Leave a group (idempotent). An owner hands the group to the earliest-joined member. */
export const leave = mutation({
  args: { groupId: v.id('groups') },
  handler: async (ctx, { groupId }): Promise<LeaveGroupResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return fail('signed_out', 'Sign in to manage your groups.');
    const member = await membershipOf(ctx, groupId, userId);
    if (member) await detachMember(ctx, member);
    const remainingGroups = (await membershipsOf(ctx, userId)).length;
    if (remainingGroups === 0) await purgeIfGroupless(ctx, userId);
    return { ok: true, remainingGroups };
  },
});

export type OwnerActionResult = { ok: true } | GroupFail;

async function ownedGroup(
  ctx: MutationCtx,
  groupId: Id<'groups'>,
): Promise<{ userId: Id<'users'>; group: Doc<'groups'> } | GroupFail> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return fail('signed_out', 'Sign in to manage your groups.');
  const group = await ctx.db.get(groupId);
  if (!group) return fail('not_found', 'That group no longer exists.');
  if (group.ownerId !== userId) return fail('not_owner', 'Only the group owner can do that.');
  return { userId, group };
}

/** Owner only: remove another member. */
export const removeMember = mutation({
  args: { groupId: v.id('groups'), userId: v.id('users') },
  handler: async (ctx, args): Promise<OwnerActionResult> => {
    const owned = await ownedGroup(ctx, args.groupId);
    if ('ok' in owned) return owned;
    if (args.userId === owned.userId) return fail('invalid', 'Use “Leave group” to leave your own group.');
    const target = await membershipOf(ctx, args.groupId, args.userId);
    if (target) {
      await detachMember(ctx, target);
      await purgeIfGroupless(ctx, args.userId);
    }
    return { ok: true };
  },
});

/** Owner only: delete the group and every membership. */
export const remove = mutation({
  args: { groupId: v.id('groups') },
  handler: async (ctx, { groupId }): Promise<OwnerActionResult> => {
    const owned = await ownedGroup(ctx, groupId);
    if ('ok' in owned) return owned;
    const members = await membersOf(ctx, groupId);
    await Promise.all(members.map((m) => ctx.db.delete(m._id)));
    if (isClub(owned.group)) await deleteClubData(ctx, owned.group);
    await ctx.db.delete(groupId);
    // Former members left in no group lose their step totals — one small
    // mutation each, re-checked at run time (they may have joined elsewhere).
    for (const m of members) {
      await ctx.scheduler.runAfter(0, internal.steps.purgeGroupless, { userId: m.userId });
    }
    return { ok: true };
  },
});

/** Owner only. */
export const rename = mutation({
  args: { groupId: v.id('groups'), name: v.string() },
  handler: async (ctx, { groupId, name }): Promise<OwnerActionResult> => {
    const owned = await ownedGroup(ctx, groupId);
    if ('ok' in owned) return owned;
    if (isClub(owned.group)) {
      const club = cleanClubName(name);
      if (!club.ok) return fail('invalid', club.message);
      await ctx.db.patch(groupId, { name: club.value });
      return { ok: true };
    }
    const clean = cleanGroupName(name);
    if (!clean.ok) return fail('invalid', clean.message);
    await ctx.db.patch(groupId, { name: clean.name });
    return { ok: true };
  },
});

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** How many groups the caller is in; null when signed out. (syncStepDays gate) */
export const myGroupCount = query({
  args: {},
  handler: async (ctx): Promise<number | null> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return (await membershipsOf(ctx, userId)).length;
  },
});

export interface ClubFace {
  kind: 'group' | 'club';
  country: string | null;
  city: string | null;
  emblem: string | null;
  photoUrl: string | null;
}

/** The public face of a club (nulls for a private group). */
export async function clubFace(ctx: Ctx, g: Doc<'groups'>): Promise<ClubFace> {
  if (!isClub(g)) return { kind: 'group', country: null, city: null, emblem: null, photoUrl: null };
  return {
    kind: 'club',
    country: g.country ?? null,
    city: g.city || null,
    emblem: g.emblem ?? null,
    photoUrl: g.photoId ? await ctx.storage.getUrl(g.photoId) : null,
  };
}

export interface MyGroupRow extends ClubFace {
  id: Id<'groups'>;
  name: string;
  code: string;
  role: 'owner' | 'member';
  memberCount: number;
  /** my rank in [fromDay, toDay]; null without a valid range */
  myRank: number | null;
  joinedAt: number;
}

export type MyGroupsResult =
  | { signedIn: false; groups: []; lifetimeSteps: 0 }
  | { signedIn: true; groups: MyGroupRow[]; lifetimeSteps: number };

/**
 * The caller's groups (most recently joined first) with member counts and
 * their rank for the client's "this week" window, plus their lifetime steps
 * (level). Groups hold ≤ 100 members, so ranking inline stays cheap.
 */
export const mine = query({
  args: { fromDay: v.optional(v.string()), toDay: v.optional(v.string()) },
  handler: async (ctx, { fromDay, toDay }): Promise<MyGroupsResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { signedIn: false, groups: [], lifetimeSteps: 0 };
    const memberships = (await membershipsOf(ctx, userId)).sort((a, b) => b.joinedAt - a.joinedAt);
    const ranged = fromDay !== undefined && toDay !== undefined && isValidRange(fromDay, toDay);
    const cache = new Map<Id<'users'>, Totals>();
    const out: MyGroupRow[] = [];
    for (const m of memberships) {
      const group = await ctx.db.get(m.groupId);
      if (!group) continue;
      const members = await membersOf(ctx, m.groupId);
      let myRank: number | null = null;
      if (ranged && cache.size + members.length <= MAX_RANKED_USERS) {
        const rows = [];
        for (const mem of members) {
          let t = cache.get(mem.userId);
          if (!t) {
            t = await totalsFor(ctx, mem.userId, fromDay!, toDay!);
            cache.set(mem.userId, t);
          }
          rows.push({ userId: mem.userId as string, steps: t.steps, activeMin: t.activeMin, joinedAt: mem.joinedAt });
        }
        myRank = rankMembers(rows).find((r) => r.userId === userId)?.rank ?? null;
      }
      out.push({
        id: group._id,
        name: group.name,
        code: group.code,
        role: group.ownerId === userId ? 'owner' : 'member',
        memberCount: members.length,
        myRank,
        joinedAt: m.joinedAt,
        ...(await clubFace(ctx, group)),
      });
    }
    return { signedIn: true, groups: out, lifetimeSteps: await lifetimeFor(ctx, userId) };
  },
});

export interface LeaderboardMemberRow {
  userId: Id<'users'>;
  displayName: string;
  role: 'owner' | 'member';
  joinedAt: number;
  rank: number;
  steps: number;
  activeMin: number;
  kcal: number;
  runM: number;
  runSec: number;
  daysWithData: number;
  lifetimeSteps: number;
  isMe: boolean;
}

export type LeaderboardResult =
  | {
      ok: true;
      group: ClubFace & {
        id: Id<'groups'>;
        name: string;
        code: string;
        memberCount: number;
        isOwner: boolean;
        createdAt: number;
      };
      members: LeaderboardMemberRow[];
    }
  | GroupFail;

/** Members only: everyone ranked by total steps in [fromDay, toDay] (local day keys, inclusive). */
export const leaderboard = query({
  args: { groupId: v.id('groups'), fromDay: v.string(), toDay: v.string() },
  handler: async (ctx, { groupId, fromDay, toDay }): Promise<LeaderboardResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return fail('signed_out', 'Sign in to see this group.');
    const group = await ctx.db.get(groupId);
    if (!group || !(await membershipOf(ctx, groupId, userId))) {
      return fail('not_member', 'You’re not in this group anymore.');
    }
    if (!isValidRange(fromDay, toDay)) return fail('invalid', 'That date range isn’t supported.');

    const members = await membersOf(ctx, groupId);
    const rows = [];
    for (const m of members) {
      const t = await totalsFor(ctx, m.userId, fromDay, toDay);
      rows.push({
        userId: m.userId,
        displayName: m.displayName,
        role: group.ownerId === m.userId ? ('owner' as const) : ('member' as const),
        joinedAt: m.joinedAt,
        ...t,
        lifetimeSteps: await lifetimeFor(ctx, m.userId),
        isMe: m.userId === userId,
      });
    }
    return {
      ok: true,
      group: {
        id: group._id,
        name: group.name,
        code: group.code,
        memberCount: members.length,
        isOwner: group.ownerId === userId,
        createdAt: group.createdAt,
        ...(await clubFace(ctx, group)),
      },
      members: rankMembers(rows),
    };
  },
});
