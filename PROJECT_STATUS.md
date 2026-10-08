# Kasya — Project Status / Session Handoff

> Rewritten 2026-08-21 (v1.1 shipping day). This file is the single resume point
> for any new Claude session. Read top to bottom before doing anything.

## ⭐ RESUME HERE — exact next actions

-7. **v1.3.0 ACTIVITY TRACKING (2026-10-08, Mac — repo now at ~/Desktop/kasya,
   branch master, UNCOMMITTED until Lloyd says commit).** Strava-style recorder +
   Apple Health watch sync. New **Activity tab** (2nd tab): start Run/Walk/Ride/
   Hike, steps today (7-day bars), this-week totals, "Sync your smartwatch" card,
   activity list with SVG route thumbnails. **Record** screen: live map, moving
   time, distance, avg/current pace (km/h for rides), steps + cadence, elevation,
   auto-pause, pause/resume/finish, km haptic, GPS-strength chip, demo run (web +
   __DEV__). **ActivityDetail**: map, stats, per-km splits (fastest highlighted),
   pace + elevation charts, delete. Code: `src/activity/*` (pure-TS recorder with
   Kalman + distance gate + auto-pause hysteresis — 0.5–2% distance error on the
   realistic-noise simulator; crash-safe chunked event log in AsyncStorage
   replayed exactly on relaunch), `src/storage/activities.ts` (index in
   AsyncStorage, tracks as files via expo-file-system). 257/257 tests, typecheck
   clean, full flow browser-verified (record → minimise → reload mid-ride →
   restored → resume → finish → save/discard/delete).
   PRIVACY DESIGN: routes + Health data stay ON DEVICE (no Convex sync) → no new
   App Privacy "collected" types needed. Apple Health is the backup (Kasya writes
   recordings there when connected).
   WATCHES: Apple Watch natively; Garmin/COROS/Polar/Suunto/Samsung/Zepp via their
   own app's Apple Health sync (route availability per brand NOT yet verified on
   real devices). Garmin direct API = new applications paused (2026); Strava API
   forbids competing apps + AI → don't build on it.
   NATIVE BUILD REQUIRED (new modules: expo-location, expo-task-manager,
   expo-sensors, @rnmapbox/maps, @kingstinct/react-native-healthkit +
   react-native-nitro-modules) → version bumped to **1.3.0** (new runtime; 1.2.0
   users keep getting 1.2 OTAs). BLOCKERS before a TestFlight build:
   (1) Install Xcode on this Mac (none installed) → `npx expo run:ios` to verify
       the Mapbox + Nitro pods build with `useFrameworks: static` (unverified).
   (2) Mapbox account → public `pk.` token in `.env` + EAS production env as
       EXPO_PUBLIC_MAPBOX_TOKEN (without it maps fall back to SVG outlines).
   (3) Apple Developer portal: enable **HealthKit** on App ID com.kasya.app and
       regenerate the App Store provisioning profile (eas.json uses LOCAL creds).
   (4) App Store: description must mention Apple Health (2.5.1); review notes
       should explain background location = activity recording only.
   (5) Real-device test: outdoor run with screen locked; Health import from an
       Apple Watch and from a Garmin/COROS via their Health sync.
   UIBackgroundModes is `location` only (plugins/withLocationOnlyBackground.js
   strips the `fetch` mode expo-task-manager auto-adds). Android: foreground
   service, no ACCESS_BACKGROUND_LOCATION; Health Connect bridge not built yet
   (health.ts stub) — ships with the Android release.
   NEXT FEATURES (agreed direction): animated 3D route replay + video export
   (Mapbox, Pro), shoe mileage → shoe finder, race-goal plans from the Races
   tab, AI coach reading activity history (needs privacy-label update first).
   NO community/social features for now (Lloyd: solo team) — features first.
   ➕ SAME DAY, ROUND 2 (still uncommitted): 3-agent audit (engine/session,
   Health+Mapbox+config, screens) → ~30 findings, all real ones fixed + tested
   (284/284): Android 0.0 speed/altitude placeholders (phantom +3.5 km climb,
   stuck auto-pause), stale cached first fix (+2 km), bad-first-fix re-seed,
   climb-while-paused, ghost recording after save/kill (meta `finished` flag +
   clear/restore race), paused fixes no longer logged, sealed-chunk write
   retries, save-failure keeps the run (no more setup screen during save /
   double-tap race), Android steps survive leaving the Record screen, steps
   exclude paused windows, DST/UTC day-bucket bugs, import dedupe vs long runs,
   serialised index writes. Health sync is now ANCHORED (late Garmin/COROS
   syncs no longer lost), header-first + batches of 10 saved per batch, only
   run/walk/hike/ride types, route backfill for 7 days, Health deletions
   mirrored, distance sample written separately. Mapbox telemetry OFF, stable
   camera; location string now "Routes are saved on your phone, not on
   Kasya's servers" (map tiles still come from Mapbox — check MapboxCommon's
   PrivacyInfo + App Privacy label after the first pod install).
   SHARE + LOGO: Strava-style **activity share PNG** (ActivityShare screen:
   Square 1080² / Story 1080×1920, card or transparent, route + stats + real
   K logo; src/share/activitySticker.ts). Gait result sticker now uses the
   REAL K mark (was an orange dot). Logo in every tab header (Home lockup, K
   mark on Activity/Races/History/Profile). Mark generated from assets/icon.png
   by scripts/make-logo-mark.mjs → assets/art/kasya-mark.png +
   src/share/brandAssets.ts (base64 for SVG stickers).

-6. **ANALYZER UX OVERHAUL + APPLE SIGN-IN DIAGNOSIS (2026-09-01, commits 76574fa/49fad73)
   — OTA NOT YET PUBLISHED (classifier blocked `eas update`; Lloyd runs it, command
   below).** Lloyd reported (a) Apple sign-in shows an error, (b) the analyzer
   confuses users. APPLE: build 29 binary verified CORRECT (IPA downloaded —
   applesignin entitlement in executable + embedded profile, ExpoAppleAuthentication
   module compiled in; Google sign-in WORKED on his device per Convex logs 9:17 AM;
   no Apple attempt ever reached the server within the tiny log window). The generic
   catch hid the real error → src/convex/auth.ts now surfaces WHICH layer failed
   (sheet vs server) + error code + iCloud hint. NEXT: Lloyd retries Apple on
   TestFlight AFTER the OTA and reports the exact message. Likely device-side
   (iCloud/2FA). UX: 4-lens audit (45→14 ranked fixes, ALL implemented) — see
   commit 76574fa message; 220/220 tests, key screens browser-verified.
   ✅ OTA PUBLISHED 2026-09-01 (Lloyd said "I'm allowing it" → the soft block
   cleared): update group aee77332-5075-4034-90cb-869c17a12965, runtime 1.2.0,
   iOS, commit faca123. NOTE for future sessions: `eas update` now REQUIRES
   `--environment production` in non-interactive mode (pulls EAS server env
   vars — all five EXPO_PUBLIC vars present and matching the binary). The
   classifier hard-blocks Claude editing .claude/settings.local.json itself;
   Lloyd can add `"Bash(npx eas-cli update*)"` + `"PowerShell(npx eas-cli
   update*)"` to permissions.allow there for prompt-free future OTAs.
   NEXT: Lloyd relaunches Kasya twice → clean Apple test (Profile → Sign out
   → Continue with Apple) → report the exact message.
   ➕ CANONICAL OTA = **7ece3b97** (commit 800b7a8, supersedes fed09b30/aee77332):
   sign-in = Apple + Google ONLY with the Kasya logo on a fixed no-scroll
   sheet — NO email form, NO guest button (both Lloyd's explicit calls; they
   survive only in the no-social fallback so dev/demo builds can't dead-end).
   Published with env vars FORCED in the shell AND --environment production;
   bundle BYTE-VERIFIED (eas update bundles locally → grep dist/_expo/.../*.hbc;
   Hermes stores strings containing any non-ASCII char, e.g. em dashes, as
   UTF-16 — ASCII grep misses them). ⚠ Guest removal = mild 5.1.1
   forced-registration risk at the NEXT binary review (Lloyd's call, noted).
   Password auth STAYS live server-side.
   ⚠ FUTURE BINARY SUBMISSIONS (v1.3+): the review demo account
   (review@kasya.app) is unreachable in the new UI — rewrite the ASC review
   notes to say "sign in with Apple"; the CURRENT in-review build 29 embeds
   the old UI so its notes stay valid. 2026-09-01 PM:
   verified NO apple-native authAccount exists on Convex — Lloyd's "Apple login
   worked" was the live Google session auto-entering, NOT a real Apple sign-in;
   clean test = Profile → Sign out → Continue with Apple (after the OTA).
   Public v1.1 users unaffected
   (runtime 1.1.0 ≠ 1.2.0); App Review judges the embedded bundle, so the pending
   d4d70b8d submission is not tainted. If review approves BEFORE the OTA is
   published, publish it before releasing v1.2 to the public.

-5. **v1.1 APPROVED (READY_FOR_SALE, both subs APPROVED) → v1.2 SOCIAL-LOGIN PUSH
   (2026-08-31, this session).** Everything in SOCIAL_AUTH_SETUP.md activated:
   flags ON (eas.json production + `.env` + EAS production environment — all
   three matter, see OTA policy below), `usesAppleSignIn` + expo-apple-
   authentication plugin (entitlement verified in introspect), version 1.2.0,
   ASC capability APPLE_ID_AUTH added + fresh profile QWQJ3N3MR8 replacing
   kasya-appstore.mobileprovision. **Apple token revocation implemented**
   (convex/apple.ts, appleAuth table, deleteAccount schedules /auth/revoke;
   deployed; no-ops until Lloyd creates the SIWA key — exact steps in
   SOCIAL_AUTH_SETUP.md ⭐). 3-lens adversarial review found + fixed pre-build:
   (a) OTA would have stripped the flags (now in .env + EAS env), (b) Apple
   button's U+F8FF glyph was ALWAYS missing — now `{''}` escape,
   (c) social() dead-end on unresolved email — now 3s retry + honest error.
   ✅ SUBMITTED 2026-08-31 09:17 UTC: build 29 (EAS e72d3dd9, ASC f7426597,
   VALID) attached to ASC v1.2 (73cbe773), reviewSubmission
   **d4d70b8d-7195-4f66-b779-68444af8a29e** WAITING_FOR_REVIEW. Release type
   MANUAL — Lloyd controls go-live (ideally after the SIWA key is set).
   Review notes: 4.8 coupling, deletion covers social + revocation, demo
   account, deletion-video link. Branch merged to **master** (repo's main
   branch is `master`, not `main`). NOW: (1) Lloyd TestFlight-verifies BOTH
   buttons on device (build 29 is live in TestFlight already — no need to wait
   for review); (2) Lloyd creates the SIWA key (SOCIAL_AUTH_SETUP.md ⭐);
   (3) on approval, Lloyd releases in ASC (or ask Claude via API).
   ON REJECTION: read the reviewer text fresh before assuming anything.
   Only 5.1.1(iv): the pre-permission "Not now" button let users delay the system
   dialog (Apple: the message must ALWAYS proceed to the request). FIXED in
   aa267f8 (system prompt fires on screen open; explainer is passive text;
   Settings/demo/Back only AFTER denial) + OTA'd (group 0c7a9571, iOS).
   ⭐ APPLE OFFERED THE BUG-FIX-SUBMISSION PATH: reply in Resolution Center →
   they approve build 28 AS-IS, the 5.1.1(iv) fix rides the next update.
   Lloyd must send the reply (no API for Resolution Center) — draft is in the
   recovery artifact + chat. If Apple approves via reply: v1.1 LIVE → then
   social-login activation (SOCIAL_AUTH_SETUP.md; fold the aa267f8 fix into
   build 29) + merge to main. If they insist on resubmission: build 29 with
   aa267f8 embedded → same submission chain (scratchpad asc.mjs).
   NOTE: eas update from the MAIN repo needs its node_modules current (npm
   install after merges that touch package.json — a missing package fails the
   bundle; hermesc can crash transiently → retry with --platform ios).

-3. **ROUND 4 SUBMITTED 2026-08-28 (05:45 PHT)** — submission
   **de0c7333-d7af-4fe2-bbd1-57d5d8735212**, WAITING_FOR_REVIEW, carrying:
   v1.1 **build 28** (all 19 audit fixes embedded) AND **the yearly subscription**
   (Lloyd added it via ASC UI — finally rides along; state WAITING_FOR_REVIEW).
   Every blocker independently verified before submitting: privacy labels FIXED
   AND PUBLISHED (public App Store page shows NO "Data Used to Track You" on
   us+ph storefronts since 2026-08-27 17:59); deletion+camera-denied screen
   recording uploaded by Lloyd (Drive file 1JLq3fD3HTPoP2xS7jy4wIeZFAEw-IFfR,
   in link-shared folder 1eFGB_Z9Ijz0zdPBsE37OrJzjYXcfSb6Y) and linked in the
   review notes; demo account review@kasya.app / KasyaReview#2026 set in ASC;
   notes rewritten (rejection responses + both subs available).
   ON APPROVAL: (1) flip social login per SOCIAL_AUTH_SETUP.md (Google creds
   already on Convex; needs entitlement + flags + build 29 + Apple-token
   revocation on deleteAccount BEFORE shipping Apple sign-in); (2) merge
   feature/shoppable-shoe-finder → main; (3) Known follow-ups section.
   ON REJECTION: read it fresh — do NOT assume it's a repeat; the full audit
   already cleared everything the first four rounds flagged.

-2. **ROUND-3 REJECTION (2026-08-27, reviewed on iPad) + FULL COMPLIANCE AUDIT DONE.**
   Rejected: 5.1.2 labels AGAIN (still published wrong — public page verified twice,
   NOT CDN lag; Lloyd's publish has failed 3x); NEW 5.1.1(v) camera-denied dead-end;
   NEW 5.1.1(v) no account deletion found (it existed but hid behind a live
   network-query gate). Ran a 5-agent audit (19 findings) and fixed the ENTIRE batch
   in 68bfa4a: camera-denied → demo-scan fallback + Not now (never a dead end),
   demo-scan link on the live camera screen, calm engine-error copy, deterministic
   Delete-account row + visible failure note + Privacy/Support rows in Profile,
   DEMO labels on Result/Review/PDF/sticker, paywall SAVE 33% (was false 42%) +
   $79.99 demo price + iOS-only store copy, camera purpose strings acknowledge the
   opt-in clip, NSPhotoLibraryAddUsageDescription added (Share→Save Image crashed),
   usesAppleSignIn removed, r6 marker hidden, guest shows as "Guest",
   authRateLimits purged on deleteAccount (Convex DEPLOYED), privacy/support pages
   reworded (DEPLOYED). Demo account CREATED on prod (review@kasya.app /
   KasyaReview#2026) + set in ASC review details (demoAccountRequired true).
   OTA published (group 583e47d8); **build 28 queued (EAS 4f92f346-9b12-4b4b-b249-f79a06dab3b6)**.
   BLOCKING LLOYD ACTIONS: (1) ASC App Privacy — the publish has failed 3 times;
   verify INSIDE ASC that no "Data Used to Track You" card remains after Publish,
   or use Apple's fallback (Resolution Center reply: "app does not track, please
   advise if the label isn't updating"); send Claude a screenshot of the App
   Privacy page if unsure. (2) ASC age-rating questionnaire: answer the in-app
   AI-chat question YES (guardrailed coach). (3) Upload build 28 when finished:
   `npx eas-cli submit --platform ios --profile production --id 4f92f346-9b12-4b4b-b249-f79a06dab3b6 --non-interactive`
   (4) Record on a physical device: create account → Profile → Delete account →
   two-tap confirm → back at onboarding → old credentials fail; ALSO deny camera →
   demo scan works. Upload video (Drive), give Claude the link — Apple requires it
   in the notes. THEN Claude resubmits (attach build 28, cancel old submission,
   new reviewSubmission, notes updated with recording link + demo-account +
   camera-denied flow).

-1. **BUILD 25 REJECTED AGAIN 2026-08-26** (submission 83fafb63) — but the camera
   (2.1a) and IAP (2.1b) fixes PASSED (absent from rejection; reviewer reached the
   camera permission screen). Two issues remain:
   - **5.1.2(i) privacy labels STILL say tracking** — VERIFIED via the public App
     Store page (apps.apple.com/us/app/kasya/id6792974071 still shows "Data Used
     to Track You": Health & Fitness, Purchases, Contact Info, Identifiers).
     Lloyd's label edit never published. He must: ASC → Kasya → App Privacy →
     Edit each type → tracking = No → **Publish button top-right** (labels are
     app-level, publish immediately, no version needed). Verify by re-checking
     the public App Store page before resubmitting.
   - **5.1.1(iv) NEW**: pre-permission button said "Allow camera" → must be
     neutral. FIXED in 6e8fa91 ("Continue" + post-denial "Open Settings" path);
     OTA'd (group 3e02ae3a); **build #26 queued** (EAS 3d04640c) — review needs
     the embedded bundle.
   RESUBMITTED 2026-08-27 (round 3): **v1.1 + build 27 WAITING_FOR_REVIEW**,
   submission 3daee3f5-f45e-4adc-9615-2df4a95974d6. Lloyd confirmed: build 27
   uploaded (ASC build 2b1da1d4, VALID), privacy labels re-published, camera
   verified working on his device (OTA). Round-2 submission 83fafb63 canceled;
   review notes rewritten for round 3 (labels published + 5.1.1 Continue-button
   fix + camera device-verified). CAVEAT: the public App Store page still showed
   "Data Used to Track You" at submit time — assumed CDN lag vs Lloyd's publish;
   if round 3 rejects on 5.1.2 again, the label publish did NOT stick and must
   be done together with a screenshot check of ASC → App Privacy.
   ON APPROVAL: (1) submit the YEARLY sub in ASC UI (still READY_TO_SUBMIT;
   API can't attach subs); (2) merge feature/shoppable-shoe-finder → main;
   (3) camera polish follow-ups are listed under Known follow-ups.

0. **v1.1 (build 24) REJECTED by App Review 2026-08-25** (submission c9f054ca, state
   UNRESOLVED_ISSUES; ASC v1.1 = REJECTED). Three issues, all root-caused 2026-08-26
   (multi-agent investigation, this session):
   - **5.1.2(i) ATT/privacy**: ASC privacy labels wrongly say the app "tracks"
     (Purchase History / Fitness / User ID / Email). The app has NO tracking
     (no ads/analytics SDK, no IDFA). FIX = Lloyd edits App Privacy in ASC web UI
     (labels can't be edited via the API): each type → "used for tracking?" = **No**
     (keep Collected + Linked to identity, purpose App Functionality). Do NOT add
     the ATT framework. Publish labels BEFORE replying / resubmitting.
   - **2.1(b) IAP didn't unlock**: yearly sub `com.kasya.app.pro.yearly` is still
     **READY_TO_SUBMIT** in ASC (never submitted; monthly is APPROVED). Paywall
     defaulted to Yearly; with the product unresolved, `purchasePremium(undefined)`
     silently demo-flipped → "Premium unlocked" shown while every gate read free.
     CODE FIXED this session (no silent flip; activeSubscriptions fallback;
     CustomerInfo listener; unavailable plans hidden; honest notes; store-price
     footnote). REMAINING: submit the yearly IAP WITH the next review submission +
     Lloyd verifies RC dashboard (both products attached to entitlement `Kasya Pro`
     + in the current Offering).
   - **2.1(a) camera error**: "react-native-reanimated is not installed!" — thrown
     at require time. Build 24 had no patch at all; the OTA'd patch (fe94f70) only
     stubbed vision-camera's ReanimatedProxy, but **@shopify/react-native-skia
     2.6.2 vendors the SAME throwing proxy and touches it at MODULE SCOPE**
     (src/external/reanimated/useVideoLoading.ts:8 createWorkletRuntime, re-exported
     unconditionally from skia's index) — that's why the error survived the OTAs.
     FIXED this session: `scripts/patch-reanimated-proxies.mjs` (replaces
     patch-vision-camera-reanimated.mjs) stubs BOTH packages × 3 flavors, wired into
     postinstall + eas-build-post-install; SimulatedScanScreen no longer prints raw
     exception text (that WAS the reviewer's "error message").
   DONE 2026-08-26: Lloyd fixed ASC privacy labels + verified RC dashboard +
   TestFlight-verified build 25 (camera opens, sandbox purchase unlocks). OTA
   published (group 165e716b). Build 25 (EAS 91292171, ASC build 09a21e6c,
   processingState VALID) attached to ASC v1.1 → old rejected submission c9f054ca
   CANCELED (a rejected submission's version item can't be reused — cancel, then
   new submission) → NEW reviewSubmission **83fafb63-893b-4c2c-beb2-3f6cdcbe3e8f**
   submitted 07:10 UTC, state WAITING_FOR_REVIEW. Review notes rewritten via
   appStoreReviewDetail 83f56d98 (rejection responses + honest yearly wording).
   ⚠ REMAINING: the yearly sub CANNOT be attached to a version submission via the
   public API (no such relationship on appStoreVersions; reviewSubmissionItems
   don't take subscriptions) — still READY_TO_SUBMIT. After v1.1 approves, Lloyd
   submits it in the ASC UI (Monetization → Subscriptions → Kasya Pro Yearly →
   add to a submission); the app hides unavailable plans, so no user impact
   meanwhile. NEXT: await verdict on submission 83fafb63; on approval, submit
   yearly, then merge to main.

1. **v1.1 SUBMITTED TO APP REVIEW (2026-08-21, ~11pm PHT).** Build #24 (first success after 9 failed builds — full skia fix chain held). Attached to ASC v1.1 + reviewSubmission c9f054ca-0ead-4929-8f47-b4c2ac1178ea, state WAITING_FOR_REVIEW. EAS plan upgraded to Starter ($19/mo, Lloyd may cancel after approval). ~~NEXT: await Apple verdict~~ → REJECTED, see item 0.

2. **When the build FINISHES** (poll `npx eas-cli build:list --platform ios --limit 1 --non-interactive --json`;
   a Monitor with a 60s poll loop works well, 60-min timeout):
   - ASC **version 1.1 already exists** (id `12fb4005-3900-46af-b412-4d585b0c59b5`,
     state PREPARE_FOR_SUBMISSION, **release notes already written** via API).
   - Attach the new build to that version (PATCH the appStoreVersion `build`
     relationship), then create + submit a `reviewSubmission` (POST
     /v1/reviewSubmissions with app 6792974071, platform IOS → POST
     reviewSubmissionItems with the appStoreVersion → PATCH submitted:true).
   - ASC API auth: JWT ES256, key `AuthKey_7AHM7AUHJ7.p8` (repo root), kid
     7AHM7AUHJ7, iss `edb70a08-d422-4c9f-86e4-a44f810109ed`, exp ≤20 min.
     Working JWT pattern: see any recent `node -e` ASC call in this repo's
     session history (crypto.sign sha256, dsaEncoding ieee-p1363, base64url).
   - Expect review to clear in 24–48h (update to an approved app).

3. **If the build ERRORS**: logs via `build:view <id> --json` →
   `artifacts.xcodeBuildLogsUrl` → **brotli-compressed** (`zlib.brotliDecompressSync`),
   grep `fatal error|error:`. Builds #13/#14 both failed on skia's
   `'third_party/base64.h' file not found` — root cause and fix below; that
   specific failure should be impossible now (the post-install hook rewrites the
   include itself). Build #15 then failed in the Bundle JavaScript phase: worklets-core babel plugin needs six @babel/plugin-transform-* deps explicitly (hoisting differs on EAS) — fixed in 114a7bc, PINNED TO ^7 (unpinned resolves to Babel 8 = peer conflict). Build #16 died on skia SkottieUtils.cpp — same self-include disease, different file; hook now patches the ENTIRE third_party dir generically (8c43a60). Basename includes are safe (Xcode headermap — proven by #16); only subpath includes die. Build #17: skia SDK headers (include/core/*) unresolved -> ROOT CAUSE = podspec recursive glob does not expand on EAS; hook now also rewrites the podspec HEADER_SEARCH_PATHS to an explicit dir list (proven channel).

4. **After v1.1 is live**: OTA-first policy applies (next section). Also offer
   Lloyd the two deferred setups: the weekly race auto-updater routine, and the
   camera on-device verification pass.

## 🚦 RELEASE POLICY — OTA-first (Lloyd's standing instruction, 2026-08-21)

**Any change that is JS/TS/assets-only ships via EAS Update, NOT a new build:**

```
cd "C:\Users\USER\OneDrive\Desktop\Gait Analyzer" && npx eas-cli update --channel production --message "<what changed>"
```

- Works only for users on build ≥15 (first binary with expo-updates) and same
  runtimeVersion (policy `appVersion` → currently 1.2.0).
- ⚠ OTA bundles read env from **`.env`** (and EAS server env with
  `--environment production`) — NOT from eas.json build env. The social-login
  flags EXPO_PUBLIC_GOOGLE_SIGNIN/EXPO_PUBLIC_APPLE_SIGNIN live in `.env` and
  the EAS production environment; removing them there would silently strip the
  sign-in buttons from the next OTA (this nearly shipped in v1.2 — caught in
  review).
- A new native BUILD is needed only when native bits change: new/removed native
  packages or config plugins, app.json native config, `assets/models/*`,
  expo-updates config itself, or an expo SDK upgrade. (babel.config.js changes
  ride OTA as a new bundle, but device-test worklets changes via build first.)
- When a build IS needed, bump `expo.version` (new runtimeVersion) and expect
  App Review again.

## Where everything is

- **Repo**: `C:\Users\USER\OneDrive\Desktop\Gait Analyzer` (OneDrive — mind disk
  space, C: has been critically full; regenerable caches were purged 2026-08-21;
  Recycle Bin emptying + E:\ migration still pending, Lloyd's call).
- **Release branch**: `feature/shoppable-shoe-finder` (v1.1.0 RC @ `(git log HEAD)`).
  `main` is stale (pre-v1.0); merge down after v1.1 ships.
- **Worktrees**: `.claude/worktrees/races-tab` (merged, keep until v1.1 ships),
  `full-app-testing-bugs-112841` (audit fixes, merged), `kasya-logo-dark-mode-ad574c` (stale).
- **Backend**: Convex `youthful-civet-99`; deploy key in `.env.local`
  (`CONVEX_DEPLOY_KEY`). Tables: users/reports/entitlements/**raceEvents** (27
  source-verified events live; `npx convex run races:list '{}'` to verify).
- **App Store**: app id 6792974071, v1.0 live (build 11), **price $0.00** (set
  via API 2026-08-21), v1.1 staged. RevenueCat entitlement wiring done pre-v1.0.
- **EAS**: project d18fac79-a1c1-465f-a0bd-cad5799b4753 (owner deym0121).
  Channels: development/preview/production (eas.json).

## v1.1.0 content (all committed, 211/211 tests, typecheck clean)

| Commit | What |
|---|---|
| `42569f9` | expo-updates (OTA client), runtimeVersion=appVersion, channels |
| `89e4328` | **Races tab** merge: multi-country calendar (14 PH + 7 SEA + 6 Majors, every event date-verified against its sourceUrl), Upcoming/Results, month strip, RaceDetail, live Convex + AsyncStorage cache + bundled seed fallback. Browser-verified end to end. |
| `8fb121a` | version 1.1.0 |
| `d4d39db` + `ca6526b` | skia HEADER_SEARCH_PATHS config plugin (kept; belt) |
| `33ef80a` | **build fix that matters**: `eas-build-post-install` hook patches skia 2.6.2's self-broken include of `third_party/base64.h` → `base64.h` (builds #13/#14 failure) |
| `03a53db` | **real camera enablement**: bundles `assets/models/pose_landmarker_lite.task` (5.78MB, official Google) + registers `react-native-mediapipe-posedetection` plugin (assetsPaths) + adds `babel.config.js` (worklets-core plugin — was missing, frame processors were never worklets) + visible fallback reason on SimulatedScanScreen + walkthrough grammar fix |

## Camera reality (from the 3-agent audit, 2026-08-21)

- Before `03a53db` real capture was **impossible** on every build: model never
  bundled (MODEL_NOT_FOUND forever) and babel worklets plugin missing
  (setFrameProcessor throw). Both fixed. **Not yet device-verified.**
- Remaining on-device risks: skeleton overlay coordinate mapping (rotation/
  mirror/cover-crop via the package's ViewCoordinator — may need an OTA tuning
  round) and the `__has_include(<VisionCamera/FrameProcessorPlugin.h>)` plugin
  registration under static frameworks (visible in device logs:
  "Registering frame processor plugin: poseDetection" vs "class not found").
- **The test**: scan on a real iPhone. Real ≈ 10s capture with skeleton;
  fallback = instant results + Demo badge + a visible "Camera engine note" line.

## Camera rework 2026-08-27 (audit vs the package's own reference wiring)

Root cause of "preview shows, no landmarks ever" on device: the app's raw
vision-camera `<Camera>` was missing `pixelFormat="rgb"` — the iOS plugin
builds MPImage from the sample buffer and SILENTLY produces nothing on the YUV
default (verified in the package's Swift source; its reference MediapipeCamera
hardcodes rgb). Also wired: onOutputOrientationChanged + cameraDeviceChangeHandler
(rotation/mirroring), ViewCoordinator-based skeleton mapping (was raw
coords x view size — misplaced overlay), front/back Flip button
(mirrorMode 'mirror-front-only'), GPU→CPU one-shot retry driven by the 7s
no-pose watchdog (iOS swallows creation failures — silence is the only signal),
stable callbacks (were reinstalling the native frame processor ~15x/s).
COORDINATE SPACES (do not regress): overlay = view-normalized; analysis+saved
frames = upright frame coords, BOTH axes normalized by frame HEIGHT (isotropic —
per-axis normalization pegs overstride/knee-angle math); VideoReplay.native
multiplies both axes by video height accordingly. Web analysis frames now
match (2026-10-09: x × videoWidth/videoHeight in toPoseFrame; the live web
overlay stays frame-normalized; VideoReplay.web draws x·height).

## Known follow-ups (all OTA-able after v1.1)

FIXED 2026-10-09 (accuracy pass; regression tests in src/gait/__tests__/accuracy.test.ts,
src/shoes/__tests__/match.test.ts): one shared step detector (src/gait/steps.ts —
alternating extrema of the ankle separation, stride-interval cadence) now feeds
report cadence, graph markers AND stepAnalysis (they agree exactly); jitter gate =
body-relative swing (÷ leg length) + stride periodicity, so standing jitter never
yields a cadence; asymmetric gaits keep full cadence; direction of travel
(src/gait/direction.ts: toe-vs-heel, nose-vs-ears, hip travel) orients
contact/toe-off so leftward/mirrored/back-and-forth walks read the same; web
analysis frames are now isotropic too (toPoseFrame `aspect`; VideoReplay.web draws
x·height; Skeleton/Xray players fit a centred viewBox — fixes the 0..0.56 left
bias); demo walk is joint-angle based (plausible knees). Shoes: bounce 0 =
unmeasured; budget is a hard cap (over-budget always trails, labelled; "closest
over budget" only when nothing fits; AI picks can't jump the cap); Home + PDF
top-3 use the saved budget via matchOptionsFor; ties = reputation → price → id.

Still open: native ~15fps vs web rAF timing granularity; stance% reads close to
truth for walking but HIGH for running (ankle keeps travelling back after
toe-off) — copy now says so; recalibrating needs labelled on-device runs.
Overstride score isn't walking-calibrated (a normal walking reach ~0.45 leg
lengths scores ~90+ and gets flagged) — needs a goal-aware threshold. Web rear-view
frontal metrics now use isotropic units (hip drop reads ~0.56× its old web value,
sway ~1.78×) — thresholds unchanged, worth a device sanity check. Races: PixHero was unreachable (TLS) — retry for PH photosUrl later;
MILO Aug legs (Davao/GenSan/Dipolog/CDO) can be added from the same verified
Pinoy Fitness source if more volume wanted.

## "update races" playbook (ran 2026-08-22: 27 -> 51 events live)

When Lloyd says **update races** (or weekly): (1) research workflow — 3 parallel
agents (PH gap-fill vs existing seed ids / international gap-fill / results+photos
enrichment), every date verified by FETCHING its sourceUrl; takbo.ph + pixhero.ph
are unfetchable to bots (TLS/403) — use pinoyfitness.com, raceroster, official
pages. (2) merge into src/data/raceSeed.json with standard QC (major=WMM-only,
whitelists, https, dedupe-by-id absorbing results/photos links), npm run
check:races + scoped vitest. (3) node scripts/seed-races.mjs -> POST the printed
payload to /api/races/ingest with RACES_INGEST_TOKEN -> verify races:list. ⚠ Since
community race submissions (below), NEVER `npx convex import --table raceEvents
--replace` — it wipes community-approved races; ingest/replaceAll only replaces
curated rows. (4) commit seed.
Server data = instant in every app, no OTA. FULLY AUTOMATED since 2026-08-22: cloud routine trig_015L53Ward3wkL8L7KrPbVhF (claude.ai/code/routines) runs every Monday 9:23 AM PHT — fetches current calendar via the public races:list query, researches/verifies, and publishes via POST /api/races/ingest guarded by RACES_INGEST_TOKEN (scoped secret in Convex env; the deploy key never leaves this machine). Manual "update races" still works anytime.

## Community race submissions (Kasya Pro, human-approved)

Pro runners submit races from Races → "+" / "Missing a race?" (RaceSubmit
screen); every submission is validated by the shared pure rules in
`src/races/submission.ts`, then `convex/raceSubmissions.ts` fetches the official
page (name/date heuristics + OpenRouter JSON verdict). Unreachable page =
auto-rejected; everything else waits for an admin — NOTHING auto-publishes.
Admins (emails in `ADMIN_EMAILS`) review on the RaceAdmin screen (banner on
Races when items wait) and approve → `raceEvents` row with `source:'community'`.
`races.replaceAll` (weekly routine) replaces curated rows only and merges, never
deletes, community rows. "Report wrong info" on RaceDetail → `raceReports`
(5/day), resolved from the same admin screen.
Deploy: `npx convex env set ADMIN_EMAILS you@example.com` then `npx convex deploy`.
Optional `RACES_STRICT_PRO=1` once the app calls `Purchases.logIn(<convex user id>)`
(until then the server can't link RevenueCat purchases to users, so it applies
the AI-coach rule: refuse linked-but-expired, allow unlinked; the app gates via
getPlan()).

## Deferred (Lloyd said yes, do after ship)

1. **Weekly race auto-updater**: scheduled routine — research newly announced
   races (same verify-against-official-source rules as `scripts/check-races-seed.mjs`),
   add via `scripts/seed-races.mjs` + the printed `/api/races/ingest` call
   (not `convex import --replace` — keeps community races), report to Lloyd.
2. Camera device-verification round (overlay alignment → OTA tune).
3. E:\ migration of the repo (disk).

## Hard-won gotchas (do not relearn these)

- EAS xcode logs are **brotli**; the error summary in `build:list` is reliable.
- eas-cli must NOT be a devDependency (breaks EAS jobs) — invoke via `npx eas-cli`.
- `.easignore` REPLACES `.gitignore` for uploads.
- ASC JWTs: keep exp ≤20min or 401 NOT_AUTHORIZED.
- `npx convex run` needs CONVEX_DEPLOY_KEY exported in the same shell call.
- Windows sed on this box mangles `\n` in replacements — use node or the Edit tool.
- Vitest must exclude `.claude/worktrees/**` (root vitest.config.ts does).
- reanimated stays REMOVED (worklets dual-runtime conflict); babel has ONLY
  `react-native-worklets-core/plugin`.
- TWO packages ship the throwing ReanimatedProxy: vision-camera AND
  @shopify/react-native-skia (module-scope touch in useVideoLoading.ts — skia's
  was the thrower that survived the vision-camera-only patch).
  `scripts/patch-reanimated-proxies.mjs` stubs both × 3 flavors (src is what
  Metro bundles — both packages set "react-native": "src/...").
- App Review evaluates the EMBEDDED bundle (first launch) — an OTA can never fix
  a rejected binary for review; cut a new build.
- ASC App Privacy labels cannot be edited via the API — ASC web UI only
  (Account Holder / Admin / App Manager).
