import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { HOME_COUNTRY } from '../src/clubs/countries';
import {
  ZERO_TOTALS,
  addMonths,
  addTotals,
  clubPaceKey,
  isZeroTotals,
  utcMonthKey,
  type MonthTotals,
} from '../src/clubs/rules';

/**
 * Club month totals (clubMonths) and the per-user month totals they're built
 * from (memberMonths). Invariant, per club C and month M:
 *
 *   clubMonths(C, M) = Σ memberMonths(U, M) over every U who was a member of C
 *                      for month M (joined in or before M, UTC)
 *
 * kept by three moves: steps.sync applies each month's change to every club
 * the user is in; a join adds the user's current months; a leave removes the
 * user's current months (earlier months keep what they had — last month's
 * standings don't change because someone left).
 */

type Ctx = QueryCtx | MutationCtx;

/** Months kept in memberMonths (older ones are pruned by steps.sync). */
export const MEMBER_MONTHS_KEPT = 3;

export function isClub(g: Doc<'groups'> | null | undefined): g is Doc<'groups'> {
  return !!g && g.kind === 'club';
}

export function totalsOf(r: { steps: number; activeMin: number; runM: number; runSec: number }): MonthTotals {
  return { steps: r.steps, activeMin: r.activeMin, runM: r.runM, runSec: r.runSec };
}

const negate = (t: MonthTotals): MonthTotals => ({ steps: -t.steps, activeMin: -t.activeMin, runM: -t.runM, runSec: -t.runSec });

export async function memberMonthOf(ctx: Ctx, userId: Id<'users'>, month: string): Promise<Doc<'memberMonths'> | null> {
  return ctx.db
    .query('memberMonths')
    .withIndex('by_user_month', (q) => q.eq('userId', userId).eq('month', month))
    .first();
}

async function memberMonthsFrom(ctx: Ctx, userId: Id<'users'>, fromMonth: string): Promise<Doc<'memberMonths'>[]> {
  return ctx.db
    .query('memberMonths')
    .withIndex('by_user_month', (q) => q.eq('userId', userId).gte('month', fromMonth))
    .collect();
}

export async function clubMonthOf(ctx: Ctx, clubId: Id<'groups'>, month: string): Promise<Doc<'clubMonths'> | null> {
  return ctx.db
    .query('clubMonths')
    .withIndex('by_club_month', (q) => q.eq('clubId', clubId).eq('month', month))
    .first();
}

/** Add `delta` (may be negative) to a club's month; totals never go below zero. */
export async function bumpClubMonth(
  ctx: MutationCtx,
  club: Doc<'groups'>,
  month: string,
  delta: MonthTotals,
  now: number,
): Promise<void> {
  if (isZeroTotals(delta)) return;
  const row = await clubMonthOf(ctx, club._id, month);
  const next = addTotals(row ? totalsOf(row) : ZERO_TOTALS, delta);
  const fields = { ...next, pace: clubPaceKey(next.runM, next.runSec), updatedAt: now };
  if (row) {
    await ctx.db.patch(row._id, fields);
  } else {
    await ctx.db.insert('clubMonths', {
      clubId: club._id,
      month,
      country: club.country ?? HOME_COUNTRY,
      listed: !club.hidden,
      ...fields,
    });
  }
}

/** A new club member: their months from the join month on start counting. */
export async function addMemberToClub(
  ctx: MutationCtx,
  club: Doc<'groups'>,
  userId: Id<'users'>,
  joinedAt: number,
): Promise<void> {
  const now = Date.now();
  for (const mm of await memberMonthsFrom(ctx, userId, utcMonthKey(joinedAt))) {
    await bumpClubMonth(ctx, club, mm.month, totalsOf(mm), now);
  }
}

/** A leaving member: remove their current months (earlier months keep what they had). */
export async function removeMemberFromClub(
  ctx: MutationCtx,
  club: Doc<'groups'>,
  member: Doc<'groupMembers'>,
): Promise<void> {
  const now = Date.now();
  const joined = utcMonthKey(member.joinedAt);
  const current = utcMonthKey(now);
  const from = joined > current ? joined : current;
  for (const mm of await memberMonthsFrom(ctx, member.userId, from)) {
    await bumpClubMonth(ctx, club, mm.month, negate(totalsOf(mm)), now);
  }
}

/**
 * steps.sync: one of the user's months changed by `clubDelta` — apply it to
 * every club they were in for that month.
 */
export async function applyToClubs(
  ctx: MutationCtx,
  userId: Id<'users'>,
  month: string,
  clubDelta: MonthTotals,
  now: number,
): Promise<void> {
  if (isZeroTotals(clubDelta)) return;
  const memberships = await ctx.db
    .query('groupMembers')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect();
  for (const m of memberships) {
    if (utcMonthKey(m.joinedAt) > month) continue;
    const club = await ctx.db.get(m.groupId);
    if (isClub(club)) await bumpClubMonth(ctx, club, month, clubDelta, now);
  }
}

/** Upsert a memberMonths row. */
export async function writeMemberMonth(
  ctx: MutationCtx,
  userId: Id<'users'>,
  month: string,
  totals: MonthTotals,
  existing: Doc<'memberMonths'> | null,
  now: number,
): Promise<void> {
  if (existing) await ctx.db.patch(existing._id, { ...totals, updatedAt: now });
  else await ctx.db.insert('memberMonths', { userId, month, ...totals, updatedAt: now });
}

/** Drop memberMonths older than the kept window. */
export async function pruneMemberMonths(ctx: MutationCtx, userId: Id<'users'>, now: number): Promise<void> {
  const cutoff = addMonths(utcMonthKey(now), -MEMBER_MONTHS_KEPT);
  const old = await ctx.db
    .query('memberMonths')
    .withIndex('by_user_month', (q) => q.eq('userId', userId).lt('month', cutoff))
    .take(50);
  await Promise.all(old.map((r) => ctx.db.delete(r._id)));
}

/** Every memberMonths row of a user (account deletion / leaving the last group). */
export async function deleteMemberMonths(ctx: MutationCtx, userId: Id<'users'>): Promise<number> {
  const rows = await ctx.db
    .query('memberMonths')
    .withIndex('by_user_month', (q) => q.eq('userId', userId))
    .collect();
  await Promise.all(rows.map((r) => ctx.db.delete(r._id)));
  return rows.length;
}

/** Rewrite the denormalized `listed` / `country` on every month row of a club. */
export async function syncClubMonthsMeta(ctx: MutationCtx, club: Doc<'groups'>): Promise<void> {
  const rows = await ctx.db
    .query('clubMonths')
    .withIndex('by_club_month', (q) => q.eq('clubId', club._id))
    .collect();
  const listed = !club.hidden;
  const country = club.country ?? HOME_COUNTRY;
  await Promise.all(
    rows
      .filter((r) => r.listed !== listed || r.country !== country)
      .map((r) => ctx.db.patch(r._id, { listed, country })),
  );
}

/** A deleted club: its month rows, reports and photo go with it. */
export async function deleteClubData(ctx: MutationCtx, club: Doc<'groups'>): Promise<void> {
  const months = await ctx.db
    .query('clubMonths')
    .withIndex('by_club_month', (q) => q.eq('clubId', club._id))
    .collect();
  const reports = await ctx.db
    .query('clubReports')
    .withIndex('by_club_user', (q) => q.eq('clubId', club._id))
    .collect();
  await Promise.all([...months, ...reports].map((r) => ctx.db.delete(r._id)));
  if (club.photoId) await ctx.storage.delete(club.photoId).catch(() => {});
}
