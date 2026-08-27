# Social sign-in (Google + Apple) — built, flag-gated OFF

_Rewritten 2026-08-27. The CODE is fully in place (server + client); nothing shows
in the app until the env flags flip. Do NOT flip anything until the pending App
Review submission is approved._

## What's implemented

| Piece | Where | State |
|---|---|---|
| Google OAuth provider (Auth.js) | `convex/auth.ts` | Deployed; inert until `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` env vars exist |
| Apple native-token provider (`apple-native`) | `convex/auth.ts` | Deployed; verifies the identityToken JWT against Apple's JWKS (aud = `com.kasya.app`); no server secret needed |
| Deep-link redirect whitelist (`kasya://`) | `convex/auth.ts` callbacks.redirect | Deployed |
| Client flows (native Apple sheet; Google RN code-exchange via `expo-web-browser`; Google web redirect) | `src/convex/auth.ts` `signInWithProvider` | Shipped, unreachable while flags are off |
| Sign-in buttons (HIG-correct Apple button; 4.8 coupling: on iOS Google only renders when Apple does) | `src/screens/SignInScreen.tsx` | Shipped, hidden while flags are off |
| `expo-apple-authentication` npm package | package.json | Installed (JS only — config plugin/entitlement NOT added yet) |

## Activation checklist (after the current review clears)

1. **Google Cloud Console** (console.cloud.google.com → APIs & Services → Credentials):
   create an OAuth client, type **Web application**, authorized redirect URI:
   `https://youthful-civet-99.convex.site/api/auth/callback/google`
   Then set the secrets on the Convex deployment:
   ```bash
   npx convex env set AUTH_GOOGLE_ID <client-id> && npx convex env set AUTH_GOOGLE_SECRET <client-secret>
   ```
   (run from the repo root with CONVEX_DEPLOY_KEY exported, as usual)
2. **Apple**: nothing server-side. The native flow verifies the token against the
   bundle id. In `app.json`: add `"usesAppleSignIn": true` back under `ios`, and
   add `"expo-apple-authentication"` to `plugins` (adds the entitlement). The
   Sign in with Apple capability must also be ON for the App ID in the Apple
   Developer portal (it was previously).
3. **Flags**: in `eas.json` production env add
   `"EXPO_PUBLIC_GOOGLE_SIGNIN": "1", "EXPO_PUBLIC_APPLE_SIGNIN": "1"`.
4. **New native build** (the entitlement + pod are native): bump nothing, just
   `npx eas-cli build --platform ios --profile production`, TestFlight-verify BOTH
   buttons on a device, then release (this is NOT OTA-able).
5. App Review note when submitting the build that turns this on: mention Sign in
   with Apple is offered alongside Google (guideline 4.8), and that account
   deletion covers social accounts too (it does — deleteAccount wipes authAccounts
   for every provider).

## Guardrails (why it's safe today)

- Flags off → the sign-in screen renders exactly as in build 28.
- The server providers are additive: Password auth is untouched, and `apple-native`
  can only mint sessions for tokens Apple actually signed for our bundle id.
- Google sign-in without the env vars set fails server-side with an error the
  client turns into a friendly message — but the button can't even render yet.

## 4.8 coupling (do not undo)

On iOS, the Google button only renders when the Apple button also renders
(`SignInScreen.tsx`). Never ship an iOS build with Google visible and Apple
hidden — automatic rejection.
