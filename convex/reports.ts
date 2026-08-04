import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';

/**
 * Scan-report sync — push-only from devices, whitelisted columns only
 * (the client builds args exclusively via toGaitReportRow). Auth required;
 * every row is owned by the calling user.
 */

const reportFields = {
  localId: v.string(),
  createdAt: v.string(),
  scanType: v.string(),
  cadence: v.union(v.float64(), v.null()),
  overstrideEstimate: v.union(v.float64(), v.null()),
  kneeFlexionRange: v.union(v.float64(), v.null()),
  metrics: v.union(v.any(), v.null()),
  captureQuality: v.union(v.any(), v.null()),
  symmetryScore: v.union(v.float64(), v.null()),
  kneeValgusScore: v.union(v.float64(), v.null()),
  hipDropScore: v.union(v.float64(), v.null()),
  summary: v.union(v.string(), v.null()),
  recommendationSummary: v.union(v.string(), v.null()),
};

/** Upsert one report by its on-device id. Returns the cloud row id. */
export const push = mutation({
  args: reportFields,
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not signed in');
    const existing = await ctx.db
      .query('reports')
      .withIndex('by_user_local', (q) => q.eq('userId', userId).eq('localId', args.localId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, userId });
      return existing._id;
    }
    return await ctx.db.insert('reports', { ...args, userId });
  },
});

/** Delete one report's cloud row after an explicit local delete. */
export const remove = mutation({
  args: { localId: v.string() },
  handler: async (ctx, { localId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not signed in');
    const existing = await ctx.db
      .query('reports')
      .withIndex('by_user_local', (q) => q.eq('userId', userId).eq('localId', localId))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});

/** Delete ALL of the caller's cloud scan rows (History → Clear all). */
export const clear = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not signed in');
    const rows = await ctx.db
      .query('reports')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    await Promise.all(rows.map((r) => ctx.db.delete(r._id)));
  },
});

/** The caller's cloud history, newest first (future multi-device restore). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query('reports')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  },
});
