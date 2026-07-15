# RevenueCat setup — what's built and what you must do

App name: **Kasya** (renamed from the working name "StrideFit" on 2026-07-16).

The app is fully wired for RevenueCat behind ONE seam: `src/monetization/entitlements.ts`.
Every premium gate (AI coach chat, PDF report export, the Paywall) reads the plan through
`getPlan()`. Billing runs in two modes, chosen automatically at runtime:

| Runtime | Mode |
|---|---|
| Native **dev build** with a RevenueCat key in `.env` | **LIVE** — real purchases, restore, the dashboard **Paywall** (`react-native-purchases-ui`), and **Customer Center** under Profile → Manage subscription |
| Web, Expo Go, or no key | **DEMO** — the honest local entitlement, clearly labeled "no real billing" |

Nothing else in the app may check `user.plan` directly for gating.

## Current state (already done in code)

- SDK installed: `react-native-purchases` + `react-native-purchases-ui` (v10.4.x, version-paired).
- **Test Store key** is set in `.env` as `EXPO_PUBLIC_REVENUECAT_KEY` (public key, both platforms).
  Per-platform production keys (`EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `_ANDROID_KEY`) override it later.
- Entitlement identifier: **`Kasya Pro`** (`ENTITLEMENT_ID` in entitlements.ts). Any active
  entitlement counts as premium, but paywall gating asks for `Kasya Pro` by name.
- Purchase paths: dashboard Paywall (`presentPaywallIfNeeded`) → falls back to in-app offering
  buttons (`getOfferings` → `purchasePackage`) → plus **Restore purchases** (App Store requirement).
- Plan is mirrored into local session after purchase/restore/Customer Center so offline reads stay coherent.

## Your dashboard checklist (app.revenuecat.com)

1. **Products** (Test Store while testing): `monthly` at **$9.99/mo** and `yearly` at **$79.99/yr**
   (~33% saving) — set these prices on the products in the dashboard; the app displays whatever
   the offering's `priceString` says. The demo paywall mirrors the same numbers.
2. **Entitlement**: create identifier exactly **`Kasya Pro`** and attach both products to it.
3. **Offering**: put both packages in the **default (current) Offering** — the app lists whatever
   packages the current offering has (monthly first is the headline).
4. **Paywall**: design one in the dashboard's Paywalls tab and attach it to the default offering —
   "View subscription options" in the app presents it. No paywall configured → the app quietly
   falls back to its own buttons.
5. **Customer Center**: enable it in the dashboard (Tools → Customer Center) — Profile →
   "Manage subscription" presents it on native.
6. Later, for production: real App Store Connect / Play Console products, per-platform public keys
   in `.env`, and store sandbox testers before going live.

## Testing it

`react-native-purchases` is a NATIVE module — the live path needs the dev build
(`expo prebuild` + EAS/dev build, see BUILD_NATIVE.md). Expo Go and web stay in demo mode by
design. With the Test Store key, purchases are simulated by RevenueCat (no store account needed) —
perfect for verifying the flow end-to-end on a device.

⚠️ Key hygiene: only PUBLIC keys (`appl_`/`goog_`/`test_`) ever ship. The RevenueCat **secret**
key (`sk_...`) must never enter the repo — `npm run check:secrets` fails the build if one does.

## What lands with Supabase (the server half — required before real launch)

From the security audit (2026-07-05): client entitlements alone must never be the source of truth
for anything that costs money.

- **RevenueCat webhook** → Supabase Edge Function (verify the webhook auth header) → upsert
  `public.entitlements` with the service_role key (schema already in `supabase/migrations/0001_init.sql`).
- The AI proxy (as an Edge Function) must check `entitlements.active` + increment
  `scan_usage.llm_call_count` server-side before every OpenRouter call.
- The webhook signing secret and service_role key live ONLY in Edge Function secrets.

Until that lands, the client seam is UI gating only — good enough for the store launch gate,
not for cost enforcement.
