import { mutation, query } from './_generated/server';
import { getAuthUserId } from '@convex-dev/auth/server';

/** The signed-in user's identity for the app shell (null when signed out). */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return { id: userId, email: (user as { email?: string }).email ?? null };
  },
});

/**
 * Full in-app account deletion (App Review guideline 5.1.1(v)): removes the
 * user's reports, quota rows, entitlement links, every auth record (accounts,
 * sessions, refresh tokens, verification codes) and the user itself.
 */
export const deleteAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not signed in');

    const reports = await ctx.db
      .query('reports')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    const usage = await ctx.db
      .query('aiUsage')
      .withIndex('by_user_day', (q) => q.eq('userId', userId))
      .collect();
    const entitlements = await ctx.db
      .query('entitlements')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    await Promise.all([...reports, ...usage, ...entitlements].map((r) => ctx.db.delete(r._id)));

    const sessions = await ctx.db
      .query('authSessions')
      .withIndex('userId', (q) => q.eq('userId', userId))
      .collect();
    for (const session of sessions) {
      const tokens = await ctx.db
        .query('authRefreshTokens')
        .withIndex('sessionId', (q) => q.eq('sessionId', session._id))
        .collect();
      await Promise.all(tokens.map((t) => ctx.db.delete(t._id)));
      await ctx.db.delete(session._id);
    }

    const accounts = await ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (q) => q.eq('userId', userId))
      .collect();
    for (const account of accounts) {
      const codes = await ctx.db
        .query('authVerificationCodes')
        .withIndex('accountId', (q) => q.eq('accountId', account._id))
        .collect();
      await Promise.all(codes.map((c) => ctx.db.delete(c._id)));
      await ctx.db.delete(account._id);
    }

    // Sign-in throttle rows are keyed by the account email (authRateLimits
    // identifier) — the last place a deleted user's email could linger.
    const user = await ctx.db.get(userId);
    const email = (user as { email?: string } | null)?.email;
    if (email) {
      const limits = await ctx.db
        .query('authRateLimits')
        .withIndex('identifier', (q) => q.eq('identifier', email))
        .collect();
      await Promise.all(limits.map((l) => ctx.db.delete(l._id)));
    }

    await ctx.db.delete(userId);
  },
});
