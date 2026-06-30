# Building StrideFit with real on-device pose tracking

The live camera + skeleton tracking is **native** — it does **not** run in Expo Go or the
browser. You build a one-time **development build** of StrideFit and install it on your phone.
Everything else (onboarding, dashboard, shoe matches, the simulated scan) keeps working in Expo
Go / web; only the real camera screen needs the dev build.

## What's already wired (in this repo)

- `src/screens/PoseScanScreen.native.tsx` — real camera + BlazePose skeleton overlay + 10s landmark capture (native only).
- `src/screens/PoseScanScreen.tsx` — web / Expo Go fallback (simulated scan).
- `src/gait/poseMapper.ts` — turns pose landmarks into the gait engine's input (unit-tested).
- `ProcessingScreen` runs the real `LivePoseGaitEngine` when it receives captured frames.
- `app.json` (camera permission, build properties, dev client) and `eas.json` (development profile).
- Deps installed: `react-native-vision-camera@4`, `react-native-mediapipe-posedetection`, `@shopify/react-native-skia`, `react-native-worklets-core`, `expo-dev-client`.

## Step 1 — add babel.config.js

Create `babel.config.js` in the project root:

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'react-native-worklets-core/plugin', // required by vision-camera v4 frame processors
    ],
  };
};
```

> ⚠️ **Worklets version note (the one real gotcha).** `react-native-vision-camera@4` uses
> `react-native-worklets-core`, while `react-native-reanimated@4` uses a *different* runtime
> (`react-native-worklets`). Having **both** can cause an Android build error like
> `duplicate class ...WorkletsPackage` / `undefined symbol RNWorklet`. This screen's skeleton is
> drawn with a plain Skia `<Canvas>` updated from React state — it does **not** need reanimated —
> so the babel config above intentionally uses only `worklets-core`. If a library forces reanimated
> and you hit the conflict, the cleanest fix is `npm uninstall react-native-reanimated`. Only if you
> later add reanimated-driven animation, add `'react-native-worklets/plugin'` as the **last** plugin
> and align versions.

## Step 2 — generate native projects

```
npx expo prebuild --clean
```

This creates `ios/` and `android/` from your config. (They're gitignored; regenerate any time.)

## Step 3 — build & install the dev client on your phone

You need a **physical device** (camera frame processors don't work in the iOS Simulator). Two paths:

### Path A — EAS cloud build (best on Windows, no Android Studio)
```
npm install -g eas-cli
eas login                 # you're already 'deym0121'
eas build --profile development --platform android
```
When it finishes (~10–15 min), open the build link on your **phone** and install the APK.

### Path B — local build (needs Android Studio + USB debugging)
```
npx expo run:android --device
```

> iOS: a physical iPhone needs a Mac + an Apple Developer account for signing.

## Step 4 — everyday development

Once the StrideFit dev build is installed, you only run the JS server:
```
npx expo start --dev-client
```
Open the **StrideFit** app on your phone (not Expo Go) and it loads your JS over LAN/tunnel.
JS edits hot-reload. Re-run `prebuild` + the build only when native deps or `app.json` change.

## Step 5 — verify on device (the spike checklist)

Because native pose can't be tested off-device, expect a short round of tuning:

- [ ] Camera preview shows, and **green skeleton lines + red dots track your legs and feet**.
- [ ] If the skeleton is **mirrored or offset**, adjust the `X`/`Y` mapping in
      `PoseScanScreen.native.tsx` (front-camera mirror / cover-crop). We use the **back** camera to
      avoid the mirror; keep it that way.
- [ ] If lines are **rotated/upside-down**, it's the known frame-orientation issue — handle
      `frame.orientation`.
- [ ] Record 10s walking side-on → you land on the Result screen with a **real cadence** (not the
      mock 162). Sanity-check it against counting your steps.
- [ ] Performance is smooth on your phone (we use the `lite` model + GPU delegate). If it janks,
      keep inference throttled.

## Reality check

This is the **Phase 0 spike** from the plan — the hardest part of the whole project. The code here
is an accurate starting point against the real library APIs, but on-device pose integration almost
always needs 1–2 iterations (the worklets version pin, coordinate mapping, orientation). If you hit
a specific error during the build or on-device, send me the exact message and I'll fix it.
