import { Platform } from 'react-native';
import { getUser, setUser } from '../storage/session';

/**
 * The ONE entitlement seam for the whole app (GaitEngine-style swappable):
 *
 *  - Billing LIVE (native dev build + RevenueCat public key set): plan comes
 *    from the RevenueCat SDK — receipt-validated by RC's servers, purchases and
 *    restore go through the store.
 *  - Otherwise (web, Expo Go, no key): the existing honest DEMO entitlement in
 *    local session storage, exactly as before.
 *
 * Every premium gate reads plan via getPlan() — nothing else in the app may
 * check user.plan directly for gating. When Supabase lands, the RC webhook
 * writes the server-side `entitlements` table and the Edge Function re-verifies
 * on every paid call; this client seam stays the UI half of that check.
 *
 * Only the RC PUBLIC SDK key ever ships (EXPO_PUBLIC_REVENUECAT_*); the RC
 * secret key and webhook signing secret are server-only (see check-secrets).
 */

export type Plan = 'free' | 'premium';

/** Pure: map a RevenueCat CustomerInfo-shaped object to a plan. */
export function planFromCustomerInfo(info: unknown): Plan {
  const active = (info as any)?.entitlements?.active;
  if (active && typeof active === 'object' && Object.keys(active).length > 0) return 'premium';
  return 'free';
}

/**
 * The RevenueCat entitlement identifier configured in the dashboard. Any active
 * entitlement counts as premium (planFromCustomerInfo), but paywall gating asks
 * for this one by name.
 */
export const ENTITLEMENT_ID = 'Kasya Pro';

/**
 * Pure: the RC public SDK key for this runtime, or null when billing can't be
 * live. Per-platform keys (production) win; EXPO_PUBLIC_REVENUECAT_KEY is the
 * single-key fallback used on both platforms (RevenueCat Test Store).
 */
export function rcApiKey(platform: string, env: Record<string, string | undefined>): string | null {
  if (platform !== 'ios' && platform !== 'android') return null;
  const perPlatform = platform === 'ios' ? env.EXPO_PUBLIC_REVENUECAT_IOS_KEY : env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
  const key = perPlatform && perPlatform.trim() ? perPlatform : env.EXPO_PUBLIC_REVENUECAT_KEY;
  return key && key.trim() ? key.trim() : null;
}

// Literal process.env.EXPO_PUBLIC_* reads — Expo inlines exactly this dot form
// at bundle time; indirect reads (globalThis.process.env etc.) are undefined in
// production builds, which silently drops the key and strands users in demo mode.
const RC_ENV: Record<string, string | undefined> = {
  EXPO_PUBLIC_REVENUECAT_IOS_KEY: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  EXPO_PUBLIC_REVENUECAT_ANDROID_KEY: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  EXPO_PUBLIC_REVENUECAT_KEY: process.env.EXPO_PUBLIC_REVENUECAT_KEY,
};

function runtimeKey(): string | null {
  // Expo Go can't load the native purchases module — demo mode there.
  try {
    const Constants = require('expo-constants').default;
    if (Constants?.appOwnership === 'expo') return null;
  } catch {}
  return rcApiKey(Platform.OS, RC_ENV);
}

let configured = false;
function purchases(): any | null {
  const key = runtimeKey();
  if (!key) return null;
  try {
    const P = require('react-native-purchases').default;
    if (!configured) {
      P.configure({ apiKey: key });
      configured = true;
    }
    return P;
  } catch {
    return null; // native module unavailable — stay in demo mode
  }
}

/** Whether real store billing is active in this runtime (drives paywall copy). */
export function isBillingLive(): boolean {
  return purchases() != null;
}

/** The current plan — RevenueCat when live (falling back to the local session on error), demo otherwise. */
export async function getPlan(): Promise<Plan> {
  const P = purchases();
  if (P) {
    try {
      return planFromCustomerInfo(await P.getCustomerInfo());
    } catch {
      // offline etc. — fall through to the local mirror
    }
  }
  const u = await getUser();
  return u?.plan === 'premium' ? 'premium' : 'free';
}

export interface PremiumPackage {
  id: string;
  label: string;
  price: string;
  pkg: unknown;
}

/** The live offering's packages for the paywall — empty in demo mode. */
export async function getPremiumPackages(): Promise<PremiumPackage[]> {
  const P = purchases();
  if (!P) return [];
  try {
    const offerings = await P.getOfferings();
    const pkgs = offerings?.current?.availablePackages ?? [];
    return pkgs.map((p: any) => ({
      id: p.identifier,
      label: p.product?.title || p.identifier,
      price: p.product?.priceString || '',
      pkg: p,
    }));
  } catch {
    return [];
  }
}

/** Mirror the plan into the local session so offline reads stay coherent. */
async function mirrorPlan(plan: Plan): Promise<void> {
  const u = await getUser();
  await setUser({ email: u?.email ?? 'demo@kasya.app', name: u?.name ?? 'Runner', plan });
}

/**
 * Buy premium. Live: a real store purchase via RevenueCat (throws when the user
 * cancels or the store errors). Demo: the honest local flip, as before.
 */
export async function purchasePremium(pkg?: unknown): Promise<Plan> {
  const P = purchases();
  if (P && pkg) {
    const { customerInfo } = await P.purchasePackage(pkg);
    const plan = planFromCustomerInfo(customerInfo);
    await mirrorPlan(plan);
    return plan;
  }
  await mirrorPlan('premium'); // demo entitlement — UI labels it as such
  return 'premium';
}

/** Restore previous store purchases (App Store review requires this path). */
export async function restorePurchases(): Promise<Plan> {
  const P = purchases();
  if (!P) return getPlan();
  const info = await P.restorePurchases();
  const plan = planFromCustomerInfo(info);
  await mirrorPlan(plan);
  return plan;
}

/**
 * Present the dashboard-configured RevenueCat Paywall (react-native-purchases-ui),
 * gated on the Kasya Pro entitlement. Returns the resulting plan, or null when
 * the paywall couldn't be shown (web/demo/no paywall configured) so the caller
 * can fall back to the in-app package buttons.
 */
export async function presentRcPaywall(): Promise<Plan | null> {
  if (!purchases()) return null; // billing not live — nothing to present
  try {
    const RevenueCatUI = require('react-native-purchases-ui').default;
    const { PAYWALL_RESULT } = require('react-native-purchases-ui');
    const result = await RevenueCatUI.presentPaywallIfNeeded({
      requiredEntitlementIdentifier: ENTITLEMENT_ID,
    });
    switch (result) {
      case PAYWALL_RESULT.PURCHASED:
      case PAYWALL_RESULT.RESTORED:
      case PAYWALL_RESULT.NOT_PRESENTED: {
        // NOT_PRESENTED = the entitlement is already active.
        const plan = await getPlan();
        await mirrorPlan(plan);
        return plan;
      }
      case PAYWALL_RESULT.CANCELLED:
        return 'free';
      default:
        return null; // ERROR / unknown — let the caller fall back
    }
  } catch {
    return null; // UI module unavailable or no paywall configured in the dashboard
  }
}

/**
 * Present RevenueCat's Customer Center (manage/cancel subscription, refunds,
 * restore). Returns false when unavailable (web/demo) so the caller can route
 * to the in-app paywall instead. Re-syncs the plan afterwards — the user may
 * have cancelled or restored inside.
 */
export async function presentCustomerCenter(): Promise<boolean> {
  if (!purchases()) return false;
  try {
    const RevenueCatUI = require('react-native-purchases-ui').default;
    await RevenueCatUI.presentCustomerCenter();
    await mirrorPlan(await getPlan());
    return true;
  } catch {
    return false;
  }
}
