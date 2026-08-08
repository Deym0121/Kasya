import AsyncStorage from '@react-native-async-storage/async-storage';

/** Mock local session (no real backend yet — Supabase auth lands in Phase 2). */
export interface MockUser {
  email: string;
  name: string;
  plan: 'free' | 'premium';
}

const ONBOARDED = 'kasya:onboarded:v1';
const USER = 'kasya:user:v1';
// Entitlements live OUTSIDE the session record on purpose: signOut clears the
// session, but a paid plan must survive sign-out and come back on re-login
// (including the guest email demo@kasya.app). On native builds RevenueCat
// re-derives the plan anyway — there this map is just a harmless mirror.
const PLANS = 'kasya:plans:v1';
// Last signed-in email — survives signOut so the next sign-in can tell whether
// it's the same person returning or a different account.
const LAST_EMAIL = 'kasya:lastEmail:v1';

type PlansMap = Record<string, MockUser['plan']>;

// Emails are compared and keyed case-insensitively — "Demo@x.com" and
// "demo@x.com" are the same person and must share one plan and one history.
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function getPlans(): Promise<PlansMap> {
  const raw = await AsyncStorage.getItem(PLANS);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as PlansMap;
  } catch {
    return {};
  }
}

export async function getOnboarded(): Promise<boolean> {
  return (await AsyncStorage.getItem(ONBOARDED)) === '1';
}

export async function setOnboarded(value: boolean): Promise<void> {
  await AsyncStorage.setItem(ONBOARDED, value ? '1' : '0');
}

export async function getUser(): Promise<MockUser | null> {
  const raw = await AsyncStorage.getItem(USER);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MockUser;
  } catch {
    return null;
  }
}

export async function setUser(user: MockUser): Promise<void> {
  await AsyncStorage.setItem(USER, JSON.stringify(user));
  // Keep the per-email entitlement map in sync so the plan outlives signOut.
  const plans = await getPlans();
  plans[normalizeEmail(user.email)] = user.plan;
  await AsyncStorage.setItem(PLANS, JSON.stringify(plans));
  await AsyncStorage.setItem(LAST_EMAIL, normalizeEmail(user.email));
}

/** The plan this email last had — 'free' for emails we've never seen. */
export async function getPlanFor(email: string): Promise<MockUser['plan']> {
  const plans = await getPlans();
  return plans[normalizeEmail(email)] ?? 'free';
}

/** Email of the most recent sign-in — NOT cleared by signOut. */
export async function getLastEmail(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_EMAIL);
}

export async function signOut(): Promise<void> {
  // Deliberately leaves PLANS and LAST_EMAIL in place: signing out ends the
  // session, it doesn't revoke a paid plan or forget who was here.
  await AsyncStorage.multiRemove([USER, ONBOARDED]);
}
