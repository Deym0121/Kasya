# Kasya — Project Status / Session Handoff

> Rewritten 2026-08-21 (v1.1 shipping day). This file is the single resume point
> for any new Claude session. Read top to bottom before doing anything.

## ⭐ RESUME HERE — exact next actions

1. **WAITING ON: Lloyd pastes the build command** (below). That produces iOS
   **build #15**, version **1.1.0**, from branch `feature/shoppable-shoe-finder`
   @ `03a53db`, with `--auto-submit` (uploads to App Store Connect by itself).

   ```
   cd "C:\Users\USER\OneDrive\Desktop\Gait Analyzer" && npx eas-cli build --platform ios --profile production --non-interactive --auto-submit --no-wait
   ```

2. **When build #15 FINISHES** (poll `npx eas-cli build:list --platform ios --limit 1 --non-interactive --json`;
   a Monitor with a 60s poll loop works well, 60-min timeout):
   - ASC **version 1.1 already exists** (id `12fb4005-3900-46af-b412-4d585b0c59b5`,
     state PREPARE_FOR_SUBMISSION, **release notes already written** via API).
   - Attach build #15 to that version (PATCH the appStoreVersion `build`
     relationship), then create + submit a `reviewSubmission` (POST
     /v1/reviewSubmissions with app 6792974071, platform IOS → POST
     reviewSubmissionItems with the appStoreVersion → PATCH submitted:true).
   - ASC API auth: JWT ES256, key `AuthKey_7AHM7AUHJ7.p8` (repo root), kid
     7AHM7AUHJ7, iss `edb70a08-d422-4c9f-86e4-a44f810109ed`, exp ≤20 min.
     Working JWT pattern: see any recent `node -e` ASC call in this repo's
     session history (crypto.sign sha256, dsaEncoding ieee-p1363, base64url).
   - Expect review to clear in 24–48h (update to an approved app).

3. **If build #15 ERRORS**: logs via `build:view <id> --json` →
   `artifacts.xcodeBuildLogsUrl` → **brotli-compressed** (`zlib.brotliDecompressSync`),
   grep `fatal error|error:`. Builds #13/#14 both failed on skia's
   `'third_party/base64.h' file not found` — root cause and fix below; that
   specific failure should be impossible now (the post-install hook rewrites the
   include itself).

4. **After v1.1 is live**: OTA-first policy applies (next section). Also offer
   Lloyd the two deferred setups: the weekly race auto-updater routine, and the
   camera on-device verification pass.

## 🚦 RELEASE POLICY — OTA-first (Lloyd's standing instruction, 2026-08-21)

**Any change that is JS/TS/assets-only ships via EAS Update, NOT a new build:**

```
cd "C:\Users\USER\OneDrive\Desktop\Gait Analyzer" && npx eas-cli update --channel production --message "<what changed>"
```

- Works only for users on build ≥15 (first binary with expo-updates) and same
  runtimeVersion (policy `appVersion` → currently 1.1.0).
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
- **Release branch**: `feature/shoppable-shoe-finder` (v1.1.0 RC @ `03a53db`).
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

## Known follow-ups (all OTA-able after v1.1)

From the accuracy audit (headline metrics are trustworthy — cadence ±2.1% over
54 configs, symmetry tracks truth, gates work): heavy-jitter standing subject
can fabricate ~72spm at HIGH confidence (add a jitter gate); extreme step-length
asymmetry halves cadence with contradictory walkthrough; stance% reads ~50 vs
physiological ~60 (extrema-method bias — relabel or recalibrate); two cadence
pipelines disagree up to 5%; simulated-scan demo knee numbers implausible.
From the shoes audit (recommendations correct + honest across 100 combos):
bounce=0 shown as "controlled" instead of unmeasured; tight-budget top-5 can be
all over budget; Home top-3 ignores saved budget; catalog premium-first tie
ordering. Races: PixHero was unreachable (TLS) — retry for PH photosUrl later;
MILO Aug legs (Davao/GenSan/Dipolog/CDO) can be added from the same verified
Pinoy Fitness source if more volume wanted.

## Deferred (Lloyd said yes, do after ship)

1. **Weekly race auto-updater**: scheduled routine — research newly announced
   races (same verify-against-official-source rules as `scripts/check-races-seed.mjs`),
   add via `scripts/seed-races.mjs` + `npx convex import --table raceEvents
   --replace --format jsonLines scripts/raceEvents.jsonl -y`, report to Lloyd.
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
