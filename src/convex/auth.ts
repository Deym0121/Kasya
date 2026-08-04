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
 * Social sign-in is STAGED on Convex: add the Google provider in
 * convex/auth.ts and flip EXPO_PUBLIC_GOOGLE_SIGNIN to '1' to re-enable the
 * button. Until then this resolves with a readable notice.
 */
export async function signInWithProvider(_provider: OAuthProvider): Promise<AuthResult> {
  return { ok: false, error: 'Social sign-in is not enabled yet — use email and password for now.' };
}

/** Sign out of the cloud session; never throws (local sign-out must always work). */
export async function signOutCloud(): Promise<void> {
  try {
    await getAuthActions()?.signOut();
  } catch {
    // offline sign-out is fine — the local session is cleared regardless
  }
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
