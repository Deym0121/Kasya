import { getSupabase, isCloudEnabled } from './client';

/**
 * Real email+password auth on Supabase — thin, null-safe wrappers. When cloud
 * isn't configured every call reports ok:false and the UI keeps the honest
 * local demo path. Errors come back as plain strings for direct display.
 */

export interface AuthResult {
  ok: boolean;
  /** account created but email confirmation is required before signing in */
  needsConfirmation?: boolean;
  error?: string;
}

export { isCloudEnabled };

export async function signUpWithEmail(email: string, password: string): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'Cloud accounts are not configured on this build.' };
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) return { ok: false, error: error.message };
  // With email confirmation ON, Supabase returns a user but no session yet.
  if (!data.session) return { ok: true, needsConfirmation: true };
  return { ok: true };
}

export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'Cloud accounts are not configured on this build.' };
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type OAuthProvider = 'google' | 'apple';

/**
 * Social sign-in through Supabase OAuth (PKCE).
 *  - web: full-page redirect to the provider; on return, detectSessionInUrl
 *    picks up the ?code and the SignIn screen's session check enters the app.
 *  - native: system browser via expo-web-browser, returning to kasya://auth-callback,
 *    then the code is exchanged for a session here.
 * Resolves ok:false with a readable message when the provider isn't enabled yet.
 */
export async function signInWithProvider(provider: OAuthProvider): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'Cloud accounts are not configured on this build.' };
  try {
    const { Platform } = require('react-native');
    if (Platform.OS === 'web') {
      const { error } = await sb.auth.signInWithOAuth({
        provider,
        options: { redirectTo: (globalThis as any).window?.location?.origin },
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true }; // the page is navigating away; session lands on return
    }

    const redirectTo = 'kasya://auth-callback';
    const { data, error } = await sb.auth.signInWithOAuth({
      provider,
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data?.url) return { ok: false, error: error?.message ?? 'Could not start the sign-in.' };

    const WebBrowser = require('expo-web-browser');
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success' || !result.url) {
      return { ok: false, error: 'Sign-in was cancelled.' };
    }
    const code = new global.URL(result.url).searchParams.get('code');
    if (!code) return { ok: false, error: 'The provider did not return a sign-in code.' };
    const { error: exchangeError } = await sb.auth.exchangeCodeForSession(code);
    if (exchangeError) return { ok: false, error: exchangeError.message };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Sign-in failed — try again.' };
  }
}

/** Sign out of the cloud session; never throws (local sign-out must always work). */
export async function signOutCloud(): Promise<void> {
  try {
    await getSupabase()?.auth.signOut();
  } catch {
    // offline sign-out is fine — the local session is cleared regardless
  }
}

/** The signed-in user's id, or null (signed out / cloud off). */
export async function currentUserId(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data } = await sb.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** The signed-in user's email, or null. */
export async function currentUserEmail(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data } = await sb.auth.getSession();
    return data.session?.user?.email ?? null;
  } catch {
    return null;
  }
}
