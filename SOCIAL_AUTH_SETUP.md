# Google & Apple sign-in — setup guide

The app side is DONE: "Continue with Google" / "Continue with Apple" buttons on the sign-in
screen run Supabase's OAuth PKCE flow (web = full-page redirect; native = system browser →
`kasya://auth-callback` → code exchange). Until you enable the providers in the dashboard,
tapping them shows "provider is not enabled" — nothing breaks.

Your project callback URL (needed in both consoles):

    https://mvsgrlvyxhufmyjwjzcb.supabase.co/auth/v1/callback

## Part 1 — Google (do this first; works on web + Android + iOS)

1. Go to https://console.cloud.google.com → create a project (e.g. "Kasya").
2. **APIs & Services → OAuth consent screen**: External · app name **Kasya** · your support
   email · add your domain later; scopes: just the default openid/email/profile. Save.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application** (yes, web — Supabase handles the exchange for
     every platform in this flow).
   - Authorized redirect URIs: paste the callback URL above.
   - Create → copy the **Client ID** and **Client secret**.
4. Supabase dashboard → **Authentication → Sign In / Providers → Google**:
   - Enable · paste Client ID + Client secret · Save.
5. Test: web app → Sign in → "Continue with Google". Done.

Native note (later, with the dev build): the same flow works in the system browser via the
`kasya://` scheme — no extra Google config needed. Only if you later want the *native* Google
account sheet do you add Android/iOS client IDs + @react-native-google-signin.

## Part 2 — Apple (needs the paid Apple Developer Program, $99/yr)

Store rule to know: once the iOS app ships with ANY social login, Apple **requires**
Sign in with Apple (Guideline 4.8). On web/Android it's optional — the app already hides
the Apple button on Android.

1. https://developer.apple.com → **Certificates, Identifiers & Profiles**.
2. **Identifiers → App ID** (e.g. `com.kasya.app`): enable the **Sign in with Apple** capability.
3. **Identifiers → Services ID** (e.g. `com.kasya.web`): enable Sign in with Apple → Configure:
   - Primary App ID: the App ID above
   - Domains: `mvsgrlvyxhufmyjwjzcb.supabase.co`
   - Return URLs: the callback URL above.
4. **Keys → create a key** with Sign in with Apple enabled → download the `.p8` (once!), note
   the Key ID and your Team ID.
5. Generate the **Secret Key** locally (the `.p8` never leaves your machine):

       node scripts/apple-secret.mjs ./AuthKey_XXXX.p8 <TEAM_ID> <KEY_ID> <SERVICES_ID>

   Paste the printed JWT into Supabase → **Authentication → Sign In / Providers → Apple**
   (enable · Client ID = the Services ID · Secret Key = the JWT). ⚠ Apple caps the secret at
   **6 months** — the script prints the expiry date; calendar a re-run.
6. Set `EXPO_PUBLIC_APPLE_SIGNIN=1` in `.env` — the Apple button stays hidden until this flag
   is on, so users never meet a dead button.
7. Test on web first; native needs the dev build.

## How it behaves in the app

- First social sign-in auto-creates the Supabase user (no email confirmation needed — the
  provider already verified the address).
- On return, the sign-in screen detects the session and walks straight into the app, then
  cloud-syncs any local scans.
- Guest mode is unchanged: local-only, no account.

Keep the client secret values in the dashboards only — never in the repo or `.env` shipped
values (the app needs no secrets for OAuth; `npm run check:secrets` guards the repo).
