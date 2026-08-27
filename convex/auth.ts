import { convexAuth, createAccount, retrieveAccount } from '@convex-dev/auth/server';
import { Password } from '@convex-dev/auth/providers/Password';
import { ConvexCredentials } from '@convex-dev/auth/providers/ConvexCredentials';
import Google from '@auth/core/providers/google';
import { jwtVerify, createRemoteJWKSet } from 'jose';

/**
 * Convex Auth providers:
 *
 *  - Password (email + password) — live since v1.0.
 *  - Google (Auth.js OAuth, RN code-exchange flow) — INERT until the
 *    AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET env vars are set on the deployment
 *    (npx convex env set ...) and the app ships with EXPO_PUBLIC_GOOGLE_SIGNIN=1.
 *  - apple-native — verifies the identityToken from the native Sign in with
 *    Apple sheet (expo-apple-authentication) against Apple's JWKS. No server
 *    secret needed: signature + issuer + audience (the app's bundle id) prove
 *    it. INERT until the app ships EXPO_PUBLIC_APPLE_SIGNIN=1.
 *
 * App Review 4.8: on iOS, Google must never ship without Apple — the client
 * enforces that coupling; both providers being registered here is harmless.
 */

const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
const APPLE_ISSUER = 'https://appleid.apple.com';
const IOS_BUNDLE_ID = 'com.kasya.app';

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  callbacks: {
    // Convex Auth only allows SITE_URL redirects by default — the native app's
    // deep link must be whitelisted or the RN Google flow can't return.
    async redirect({ redirectTo }) {
      if (redirectTo.startsWith('kasya://')) return redirectTo;
      const site = process.env.SITE_URL ?? process.env.CONVEX_SITE_URL ?? '';
      if (site && redirectTo.startsWith(site)) return redirectTo;
      throw new Error(`Invalid redirectTo: ${redirectTo}`);
    },
  },
  providers: [
    Password,
    Google,
    ConvexCredentials({
      id: 'apple-native',
      authorize: async (credentials, ctx) => {
        const identityToken = credentials.identityToken;
        if (typeof identityToken !== 'string' || !identityToken) return null;
        // Throws on bad signature / wrong issuer / wrong audience / expired.
        const { payload } = await jwtVerify(identityToken, APPLE_JWKS, {
          issuer: APPLE_ISSUER,
          audience: IOS_BUNDLE_ID,
        });
        const appleUserId = payload.sub;
        if (!appleUserId) return null;
        // Apple only sends the user's name on the FIRST authorization —
        // the client forwards it then; later sign-ins just match the account.
        const email = typeof payload.email === 'string' ? payload.email : undefined;
        const name = typeof credentials.name === 'string' && credentials.name ? credentials.name : undefined;
        try {
          const existing = await retrieveAccount(ctx, {
            provider: 'apple-native',
            account: { id: appleUserId },
          });
          return { userId: existing.user._id };
        } catch {
          const created = await createAccount(ctx, {
            provider: 'apple-native',
            account: { id: appleUserId },
            profile: { ...(email ? { email } : {}), ...(name ? { name } : {}) },
          });
          return { userId: created.user._id };
        }
      },
    }),
  ],
});
