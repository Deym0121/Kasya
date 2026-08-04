import { query } from './_generated/server';
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
