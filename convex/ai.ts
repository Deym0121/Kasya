import { internalMutation } from './_generated/server';
import { v } from 'convex/values';

/** Server-side daily quota for the AI coach — mirrors the client's 50/day. */
export const DAILY_LIMIT = 50;

/**
 * Count one coach reply for the user; returns whether it was allowed.
 * Called from the /api/coach HTTP action for signed-in users.
 */
export const bumpUsage = internalMutation({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const day = new Date().toISOString().slice(0, 10);
    const existing = await ctx.db
      .query('aiUsage')
      .withIndex('by_user_day', (q) => q.eq('userId', userId).eq('day', day))
      .unique();
    const count = existing?.count ?? 0;
    if (count >= DAILY_LIMIT) return { allowed: false, remaining: 0 };
    if (existing) await ctx.db.patch(existing._id, { count: count + 1 });
    else await ctx.db.insert('aiUsage', { userId, day, count: 1 });
    return { allowed: true, remaining: DAILY_LIMIT - count - 1 };
  },
});
