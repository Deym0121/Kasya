import { internalAction, internalMutation } from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { SignJWT, importPKCS8 } from 'jose';

/**
 * Sign in with Apple token lifecycle. Apple requires apps that offer Sign in
 * with Apple to revoke the user's tokens when their account is deleted
 * (App Review 5.1.1(v) companion rule, June 2022).
 *
 *  - At sign-in the client forwards Apple's one-time authorizationCode; we
 *    exchange it for a refresh token and keep it per user (appleAuth table).
 *  - users.deleteAccount schedules `revoke`, which calls /auth/revoke.
 *
 * Both Apple endpoints need a client secret: an ES256 JWT signed with a
 * "Sign in with Apple" key from developer.apple.com. Until APPLE_TEAM_ID /
 * APPLE_SIWA_KEY_ID / APPLE_SIWA_PRIVATE_KEY are set on the deployment these
 * actions no-op — sign-in and account deletion never block on Apple.
 */

const BUNDLE_ID = 'com.kasya.app';
const APPLE_ORIGIN = 'https://appleid.apple.com';

async function clientSecret(): Promise<string | null> {
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_SIWA_KEY_ID;
  const pem = process.env.APPLE_SIWA_PRIVATE_KEY;
  if (!teamId || !keyId || !pem) return null;
  // env vars often carry literal "\n" instead of newlines — normalize.
  const key = await importPKCS8(pem.replace(/\\n/g, '\n'), 'ES256');
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setSubject(BUNDLE_ID)
    .setAudience(APPLE_ORIGIN)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(key);
}

function form(fields: Record<string, string>): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  };
}

/** Trade the sign-in authorizationCode for the refresh token revocation needs. */
export const exchangeAndStore = internalAction({
  args: { userId: v.id('users'), authorizationCode: v.string() },
  handler: async (ctx, { userId, authorizationCode }) => {
    const secret = await clientSecret();
    if (!secret) return; // SIWA key not configured yet — nothing to store
    const res = await fetch(`${APPLE_ORIGIN}/auth/token`, form({
      client_id: BUNDLE_ID,
      client_secret: secret,
      code: authorizationCode,
      grant_type: 'authorization_code',
    }));
    if (!res.ok) {
      console.warn('Apple token exchange failed', res.status, await res.text());
      return;
    }
    const tokens = (await res.json()) as { refresh_token?: unknown };
    if (typeof tokens.refresh_token === 'string' && tokens.refresh_token) {
      await ctx.runMutation(internal.apple.saveToken, { userId, refreshToken: tokens.refresh_token });
    }
  },
});

export const saveToken = internalMutation({
  args: { userId: v.id('users'), refreshToken: v.string() },
  handler: async (ctx, { userId, refreshToken }) => {
    // The exchange runs async — the account may already be gone (sign-in
    // followed by an immediate delete); don't resurrect an orphan row.
    if (!(await ctx.db.get(userId))) return;
    const existing = await ctx.db
      .query('appleAuth')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .first();
    if (existing) await ctx.db.patch(existing._id, { refreshToken, updatedAt: Date.now() });
    else await ctx.db.insert('appleAuth', { userId, refreshToken, updatedAt: Date.now() });
  },
});

/** Best-effort revocation — deleteAccount already removed the stored row. */
export const revoke = internalAction({
  args: { refreshToken: v.string() },
  handler: async (_ctx, { refreshToken }) => {
    const secret = await clientSecret();
    if (!secret) return;
    const res = await fetch(`${APPLE_ORIGIN}/auth/revoke`, form({
      client_id: BUNDLE_ID,
      client_secret: secret,
      token: refreshToken,
      token_type_hint: 'refresh_token',
    }));
    if (!res.ok) console.warn('Apple token revocation failed', res.status, await res.text());
  },
});
