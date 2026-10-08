import { internalMutation, query } from './_generated/server';
import type { QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';

/**
 * Server-truth premium entitlements. Rows are written ONLY by the RevenueCat
 * webhook (see http.ts). "Active" is computed at read time from expiresAt so
 * a stale flag can never keep premium alive past expiry.
 */

function isActive(row: { expiresAt: number | null }): boolean {
  return row.expiresAt === null || row.expiresAt > Date.now();
}

/**
 * Premium status for one user, by server truth — shared by `mine` (AI coach
 * gate in http.ts) and race submissions (raceSubmissions.submitRace).
 */
export async function proStatusFor(
  ctx: Pick<QueryCtx, 'db'>,
  userId: Id<'users'>,
): Promise<{ active: boolean; linked: boolean }> {
  const rows = await ctx.db
    .query('entitlements')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .collect();
  return { active: rows.some(isActive), linked: rows.length > 0 };
}

/** The signed-in user's premium status, by server truth. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { active: false, linked: false };
    return proStatusFor(ctx, userId);
  },
});

/** Upsert from a verified RevenueCat webhook event (internal only). */
export const upsertFromWebhook = internalMutation({
  args: {
    rcAppUserId: v.string(),
    productId: v.union(v.string(), v.null()),
    expiresAt: v.union(v.float64(), v.null()),
    environment: v.union(v.string(), v.null()),
    lastEventType: v.string(),
  },
  handler: async (ctx, args) => {
    // When the app calls Purchases.logIn(<convex user id>), RC's app_user_id
    // IS the users-table id — link it so `mine` can find the row.
    let userId = undefined;
    const maybeUser = ctx.db.normalizeId('users', args.rcAppUserId);
    if (maybeUser) {
      const user = await ctx.db.get(maybeUser);
      if (user) userId = maybeUser;
    }
    const existing = await ctx.db
      .query('entitlements')
      .withIndex('by_rc', (q) => q.eq('rcAppUserId', args.rcAppUserId))
      .unique();
    const row = { ...args, userId, updatedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, row);
      return existing._id;
    }
    return await ctx.db.insert('entitlements', row);
  },
});
