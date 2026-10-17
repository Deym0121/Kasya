import { v } from 'convex/values';
import { internalMutation, mutation } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { getAuthUserId } from '@convex-dev/auth/server';
import { GROUP_LIMITS as L, addDaysToKey, cleanStepDay, utcDayKey } from '../src/groups/rules';
import type { StepDay } from '../src/groups/types';

/**
 * Daily activity totals for group leaderboards.
 *
 * Privacy (Apple 5.1.3): only DAILY TOTALS (steps, active minutes, active
 * kcal) — no samples, routes or health records. They're accepted only while
 * the caller is in at least one group, read only by fellow members
 * (groups.leaderboard), never used for ads, and deleted when the user leaves
 * their last group (purgeIfGroupless) or deletes the account (users.ts).
 *
 * Expected failures are RETURNED, not thrown (production redacts throws).
 */

/**
 * Accepted day window, by the server's UTC day: [today − 62, today + 1]
 * (the +1 covers time zones ahead of UTC). Rows older than today − 70 are
 * pruned. Because the accept window is narrower than the keep window, a
 * pruned day can never be re-sent — so lifetimeSteps never double-counts it.
 */
const ACCEPT_BACK_DAYS = L.maxDaysPerSync;
const ACCEPT_AHEAD_DAYS = 1;
const PRUNE_BATCH = 100;

export type SyncResult =
  | { ok: true; written: number; skipped: number }
  | { ok: false; reason: 'signed_out' | 'too_many' | 'no_groups'; message: string };

export const sync = mutation({
  args: {
    days: v.array(
      v.object({
        day: v.string(),
        steps: v.number(),
        activeMin: v.number(),
        kcal: v.number(),
      }),
    ),
  },
  handler: async (ctx, { days }): Promise<SyncResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { ok: false, reason: 'signed_out', message: 'Sign in to share steps with a group.' };
    if (days.length > L.maxDaysPerSync) {
      return { ok: false, reason: 'too_many', message: `Send at most ${L.maxDaysPerSync} days at a time.` };
    }
    // Step totals live on the server only while the user is in a group.
    const inGroup = await ctx.db
      .query('groupMembers')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .first();
    if (!inGroup) return { ok: false, reason: 'no_groups', message: 'Join a group to share your steps.' };

    const now = Date.now();
    const today = utcDayKey(now);
    const oldest = addDaysToKey(today, -ACCEPT_BACK_DAYS);
    const newest = addDaysToKey(today, ACCEPT_AHEAD_DAYS);

    const byDay = new Map<string, StepDay>();
    let skipped = 0;
    for (const raw of days) {
      const d = cleanStepDay(raw);
      if (!d || d.day < oldest || d.day > newest) {
        skipped++;
        continue;
      }
      byDay.set(d.day, d); // duplicate days: the last one wins
    }

    let delta = 0;
    let written = 0;
    for (const d of byDay.values()) {
      const existing = await ctx.db
        .query('stepDays')
        .withIndex('by_user_day', (q) => q.eq('userId', userId).eq('day', d.day))
        .first();
      if (existing) {
        if (existing.steps === d.steps && existing.activeMin === d.activeMin && existing.kcal === d.kcal) continue;
        delta += d.steps - existing.steps;
        await ctx.db.patch(existing._id, { steps: d.steps, activeMin: d.activeMin, kcal: d.kcal, updatedAt: now });
      } else {
        delta += d.steps;
        await ctx.db.insert('stepDays', { userId, ...d, updatedAt: now });
      }
      written++;
    }

    const stats = await ctx.db
      .query('userStats')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .first();
    if (!stats) {
      await ctx.db.insert('userStats', { userId, lifetimeSteps: Math.max(0, delta), updatedAt: now });
    } else if (delta !== 0) {
      await ctx.db.patch(stats._id, { lifetimeSteps: Math.max(0, stats.lifetimeSteps + delta), updatedAt: now });
    }

    // Data minimization: leaderboards need at most a month of days.
    const cutoff = addDaysToKey(today, -L.keepDays);
    const stale = await ctx.db
      .query('stepDays')
      .withIndex('by_user_day', (q) => q.eq('userId', userId).lt('day', cutoff))
      .take(PRUNE_BATCH);
    await Promise.all(stale.map((r) => ctx.db.delete(r._id)));

    return { ok: true, written, skipped };
  },
});

/** Every stepDays row + the userStats row for one user. Returns rows deleted. */
export async function deleteStepDataFor(ctx: MutationCtx, userId: Id<'users'>): Promise<number> {
  const days = await ctx.db
    .query('stepDays')
    .withIndex('by_user_day', (q) => q.eq('userId', userId))
    .collect();
  const stats = await ctx.db
    .query('userStats')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect();
  await Promise.all([...days, ...stats].map((r) => ctx.db.delete(r._id)));
  return days.length + stats.length;
}

/** Drop the user's step data if they're no longer in any group. */
export async function purgeIfGroupless(ctx: MutationCtx, userId: Id<'users'>): Promise<boolean> {
  const still = await ctx.db
    .query('groupMembers')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .first();
  if (still) return false;
  await deleteStepDataFor(ctx, userId);
  return true;
}

/** Scheduled by groups.remove for each former member (re-checks at run time). */
export const purgeGroupless = internalMutation({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }): Promise<boolean> => purgeIfGroupless(ctx, userId),
});

/** The caller deletes every step total + their lifetime stats (e.g. after leaving their last group). */
export const deleteMine = mutation({
  args: {},
  handler: async (ctx): Promise<{ ok: boolean; deleted: number }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { ok: false, deleted: 0 };
    return { ok: true, deleted: await deleteStepDataFor(ctx, userId) };
  },
});
