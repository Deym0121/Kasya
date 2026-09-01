import { api } from '../../convex/_generated/api';
import { getConvex, isCloudEnabled } from './client';
import { getAuthActions } from './authBridge';

/**
 * Email+password auth on Convex Auth — thin, null-safe wrappers with the same
 * shape the screens used in the Supabase era. When cloud isn't configured
 * every call reports ok:false and the UI keeps the honest local demo path.
 */

export interface AuthResult {
  ok: boolean;
  /** account created but email confirmation is required before signing in */
  needsConfirmation?: boolean;
  error?: string;
}

export { isCloudEnabled };

const CLOUD_OFF = 'Cloud accounts are not configured on this build.';
const NOT_READY = 'Cloud session is still starting — try again in a moment.';

function readableError(e: unknown, flow: 'signUp' | 'signIn'): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/invalidaccountid|invalid credentials|invalidsecret/i.test(raw)) return 'Invalid login credentials.';
  if (/invalid password/i.test(raw)) return 'Password needs at least 8 characters.';
  if (/already exists|account already/i.test(raw)) return 'An account with this email already exists — log in instead.';
  // Production deployments redact server errors; keep the message honest but generic.
  return flow === 'signUp' ? 'Could not create the account — try again.' : 'Sign-in failed — try again.';
}

export async function signUpWithEmail(email: string, password: string): Promise<AuthResult> {
  if (!isCloudEnabled()) return { ok: false, error: CLOUD_OFF };
  const actions = getAuthActions();
  if (!actions) return { ok: false, error: NOT_READY };
  try {
    await actions.signIn('password', { email, password, flow: 'signUp' });
    return { ok: true }; // Convex Auth signs straight in — no email-confirmation step (staged for later)
  } catch (e) {
    return { ok: false, error: readableError(e, 'signUp') };
  }
}

export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  if (!isCloudEnabled()) return { ok: false, error: CLOUD_OFF };
  const actions = getAuthActions();
  if (!actions) return { ok: false, error: NOT_READY };
  try {
    await actions.signIn('password', { email, password, flow: 'signIn' });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: readableError(e, 'signIn') };
  }
}

export type OAuthProvider = 'google' | 'apple';

/**
 * Social sign-in. Backends are live (convex/auth.ts: Google OAuth +
 * apple-native token verification); the BUTTONS are gated behind
 * EXPO_PUBLIC_GOOGLE_SIGNIN / EXPO_PUBLIC_APPLE_SIGNIN so nothing changes for
 * shipped builds until the flags flip (see SOCIAL_AUTH_SETUP.md).
 *
 *  - apple: native Sign in with Apple sheet → identityToken → the
 *    'apple-native' Convex provider verifies it against Apple's JWKS.
 *  - google (native): Convex Auth's RN flow — signIn returns the OAuth URL,
 *    we open it in the auth session browser, the deep-link back carries a
 *    one-time code, and a second signIn call exchanges it.
 *  - google (web): plain browser redirect.
 *
 * Returns the signed-in email when the provider shares it (first Apple
 * sign-in only) so callers can mirror the local session.
 */
export async function signInWithProvider(provider: OAuthProvider): Promise<AuthResult & { email?: string; name?: string }> {
  if (!isCloudEnabled()) return { ok: false, error: CLOUD_OFF };
  const actions = getAuthActions();
  if (!actions) return { ok: false, error: NOT_READY };

  if (provider === 'apple') {
    let Apple: any;
    try {
      Apple = require('expo-apple-authentication');
      if (!(await Apple.isAvailableAsync())) throw new Error('unavailable');
    } catch {
      return { ok: false, error: 'Sign in with Apple isn’t available on this device.' };
    }
    // Three failure stages with three DIFFERENT messages, so a report like
    // "it shows an error" pinpoints the layer (Apple sheet vs token vs server).
    let cred: any;
    try {
      cred = await Apple.signInAsync({
        requestedScopes: [Apple.AppleAuthenticationScope.FULL_NAME, Apple.AppleAuthenticationScope.EMAIL],
      });
    } catch (e: any) {
      const code = String(e?.code ?? '');
      if (/CANCEL/i.test(code)) return { ok: false, error: '' }; // user closed the sheet — not an error
      // The Apple sheet itself failed (device-side). The usual cause is not
      // being signed into iCloud, or an Apple ID without two-factor auth.
      const detail = [code, e?.message].filter(Boolean).join(' — ').slice(0, 160);
      return {
        ok: false,
        error: `Apple couldn’t complete sign-in${detail ? ` (${detail})` : ''}. Make sure you’re signed into iCloud in Settings, then try again.`,
      };
    }
    if (!cred?.identityToken) return { ok: false, error: 'Apple sign-in didn’t complete — try again.' };
    const name = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(' ') || undefined;
    try {
      await actions.signIn('apple-native', {
        identityToken: cred.identityToken,
        // One-time code the server trades for the refresh token that account
        // deletion must revoke (Apple requirement — convex/apple.ts).
        ...(cred.authorizationCode ? { authorizationCode: cred.authorizationCode } : {}),
        ...(name ? { name } : {}),
      });
    } catch (e) {
      const raw = (e instanceof Error ? e.message : String(e)).slice(0, 120);
      return {
        ok: false,
        error: `We couldn’t verify the Apple sign-in with our server${raw ? ` (${raw})` : ''} — try again in a moment, or use email and password.`,
      };
    }
    return { ok: true, email: cred.email ?? undefined, name };
  }

  try {
    const { Platform } = require('react-native');
    if (Platform.OS === 'web') {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const { redirect } = await actions.signIn('google', origin ? { redirectTo: origin } : {});
      if (redirect && typeof window !== 'undefined') window.location.href = redirect.toString();
      return { ok: true };
    }
    const WebBrowser = require('expo-web-browser');
    const redirectTo = 'kasya://auth';
    const { redirect } = await actions.signIn('google', { redirectTo });
    if (!redirect) return { ok: false, error: 'Google sign-in couldn’t start — try again in a moment.' };
    const result = await WebBrowser.openAuthSessionAsync(redirect.toString(), redirectTo);
    if (result.type !== 'success' || !result.url) return { ok: false, error: '' }; // cancelled — not an error
    const code = new URL(result.url).searchParams.get('code');
    if (!code) return { ok: false, error: 'Google sign-in didn’t complete — try again.' };
    await actions.signIn('google', { code });
    return { ok: true };
  } catch {
    return { ok: false, error: 'Google sign-in failed — try again, or use email and password.' };
  }
}

/** Sign out of the cloud session; never throws (local sign-out must always work). */
export async function signOutCloud(): Promise<void> {
  try {
    await getAuthActions()?.signOut();
  } catch {
    // offline sign-out is fine — the local session is cleared regardless
  }
}

/**
 * Permanently delete the signed-in user's account and every cloud row
 * (App Review 5.1.1(v)). Clears the local token afterwards.
 */
export async function deleteCloudAccount(): Promise<AuthResult> {
  const convex = getConvex();
  if (!convex) return { ok: true }; // nothing in the cloud to delete
  try {
    await convex.mutation(api.users.deleteAccount, {});
  } catch (e) {
    return { ok: false, error: 'Could not delete the account — check your connection and try again.' };
  }
  await signOutCloud(); // the server session is gone; this clears the stored tokens
  return { ok: true };
}

/** The signed-in user's id, or null (signed out / cloud off). */
export async function currentUserId(): Promise<string | null> {
  const convex = getConvex();
  if (!convex) return null;
  try {
    const me = await convex.query(api.users.me, {});
    return me?.id ?? null;
  } catch {
    return null;
  }
}

/** The signed-in user's email, or null. */
export async function currentUserEmail(): Promise<string | null> {
  const convex = getConvex();
  if (!convex) return null;
  try {
    const me = await convex.query(api.users.me, {});
    return me?.email ?? null;
  } catch {
    return null;
  }
}
