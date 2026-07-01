# StrideFit AI — Project Status & Handoff

_Last updated: 2026-07-01. This is the single source of truth for picking the project back up._

## What it is

A **wellness-grade running/walking form coach + comfort-led shoe finder** (React Native + Expo, TypeScript).
Record a short walk with your phone/webcam → on-device/in-browser pose analysis → a real cadence + form
read → slow-mo review + graph + feedback → shoe matches. **Privacy-first: no video is ever stored — only
derived motion data and metrics.** Wellness-only framing (estimates, never medical/diagnostic claims).

Full product plan: `~/.claude/plans/please-re-plan-this-wiggly-pony.md`

---

## Current status (what works today)

| Area | Status |
|---|---|
| Full app flow | ✅ Onboarding → sign-in (mock) → dashboard → scan setup → camera guide → scan → processing → result → **review/slow-mo** → shoe matches → paywall → profile |
| **Real gait analysis on web** | ✅ MediaPipe BlazePose on the webcam, live skeleton, real cadence + form metrics from real movement |
| Capture gating | ✅ Won't advance unless it recorded a usable walk (detects you in frame; validates after recording) |
| Slow-mo review + graph | ✅ Skeleton replay (0.25/0.5/1×) + step-rhythm graph + metrics + feedback, all from saved data (no video) |
| Smart analysis | ✅ Per-foot step events, step timing, stance %, overstride at contact, knee angle at contact/peak, symmetry, lead foot, plain-English "how your step works" walkthrough |
| AI explanation (OpenRouter) | ✅ Optional — local secure proxy; app falls back to built-in tip if off |
| Shoe matching | ✅ Comfort-led (not pronation-prescriptive), FTC "our product" labels |
| Design system | ✅ Sora typeface, ink/coral palette, Feather icons, custom components |
| Backend (Supabase) | ⬜ Not built — everything is local (AsyncStorage / localStorage) |
| **Real pose on the PHONE** | ⬜ Scaffolded but needs a dev build — see `BUILD_NATIVE.md` (not verified on-device) |

**Tests:** 33 passing (vitest, pure gait/logic core). **Typecheck:** clean. **Web bundle:** builds (~626 modules).

---

## How to run

Everything runs locally. **Node 24, npm 11** already set up.

```bash
npm install          # first time
npm test             # 33 unit tests (gait math, feedback, mapping)
npm run typecheck    # tsc --noEmit
npm run web          # web app -> http://localhost:8085  (press w if using `npm start`)
```

### See the real analyzer (web) — the main path today
1. `npm run web` → open **http://localhost:8085**
2. Start scan → pick a goal → Continue → Start recording → **allow the camera**
3. **Step back so your whole body (legs + feet) is in frame** (the Record button enables when you're detected)
4. Record + **walk side-on for 10s** → Result → **Review & slow-mo → "How your step works"**

### Optional: AI-written explanation (OpenRouter)
```bash
copy .env.example .env      # then paste OPENROUTER_API_KEY=sk-or-...
npm run server              # secure proxy on localhost:8787 (key never ships in the app)
```
The Result screen's coaching tip upgrades to AI text (with an "AI" badge) when the proxy is reachable.

### Phone via Expo Go (mock/simulated flow only)
`npx expo start --tunnel` → scan the QR Expo prints. The scan runs a **simulated** analysis in Expo Go
(real camera needs the dev build below). Everything else is the real app.

### Phone with REAL camera pose (the dev build) — not yet verified
See **`BUILD_NATIVE.md`**. Requires `expo prebuild` + an EAS/dev build (not Expo Go). Known open items:
worklets version reconciliation (vision-camera v4 uses `worklets-core`, reanimated 4 uses
`react-native-worklets`) and on-device coordinate tuning.

---

## Architecture & key files

```
App.tsx                     Navigation (native-stack, header-less; custom top bars)
index.ts                    Expo entry

src/gait/                   PURE-TS analysis core (unit-tested, no RN imports)
  types.ts                  Landmark / PoseFrame / GaitResult; MediaPipe 33-landmark indices
  signal.ts                 median, findPeaks (plateau-aware)
  ruleEngine.ts             computeCadence, assessCaptureQuality, analyzeGait, gaitSignal
  poseMapper.ts             toPoseFrame — MediaPipe landmarks -> PoseFrame (by index, visibility)
  events.ts                 detectFootEvents — per-foot contacts + toe-offs
  stepAnalysis.ts           analyzeSteps + describeGait (step timing, stance, walkthrough)
  form.ts                   computeFormMetrics + buildFeedback (wellness-only)
  detailed.ts               analyzeGaitDetailed / buildDetail / downsampleFrames
  insights.ts               cadenceTip (rule-based fallback)
  synthetic.ts              makeSyntheticWalk (simulated scans + tests)
  GaitEngine.ts / MockGaitEngine.ts / LivePoseGaitEngine.ts   engine interface + adapters

src/screens/                Onboarding, SignIn, Home, ScanSetup, CameraGuide,
  PoseScanScreen.web.tsx      real webcam pose (MediaPipe from CDN)
  PoseScanScreen.native.tsx   dispatcher: Expo Go -> Simulated, dev build -> PoseScanCamera
  PoseScanCamera.native.tsx   real device camera (vision-camera + skia), @ts-nocheck
  SimulatedScanScreen.tsx     simulated fallback
  Processing, Result, Review, ShoeMatches, Paywall, Profile

src/viz/                    SkeletonPlayer.tsx (slow-mo replay), GaitGraph.tsx (step graph) — react-native-svg
src/ai/                     features.ts (de-identified payload), explain.ts (client call)
src/shoes/ + src/data/      matchShoes (comfort-led) + seed shoe catalog
src/storage/                reportRecord (what's persisted), reports (AsyncStorage, capped 20), session
src/components.tsx          UI kit (Button, Card, Chip, IconBubble, etc.)
src/theme.ts                design tokens (Sora fonts, ink/coral colors)

server/dev-proxy.mjs        OpenRouter proxy (holds the key; -> Supabase Edge Function later)
supabase/migrations/0001_init.sql   corrected Postgres schema + RLS (not deployed yet)
BUILD_NATIVE.md             dev-build steps for real phone pose
.env.example                OpenRouter config template (.env is gitignored)
```

### Analysis pipeline
`frames: PoseFrame[]` (real from webcam, or `makeSyntheticWalk` for the simulated path)
→ `analyzeGait` (cadence + capture-quality gate)
→ `analyzeSteps` (per-foot events → step timing, stance, overstride-at-contact, knee angles, symmetry)
→ `computeFormMetrics` (vertical oscillation, knee flexion range)
→ `buildFeedback` + `describeGait` (walkthrough)
→ `buildDetail` persists metrics + feedback + graph + steps + walkthrough + **downsampled skeleton** (never video).

---

## Data & privacy model
- **Saved** (AsyncStorage / a Supabase row later): cadence, form metrics, feedback, graph data, step
  analysis, walkthrough, and a **downsampled skeleton** (for replay). History capped at 20 scans.
- **Never saved:** the video/frames of you — there's no video file; only derived landmark data.
- AI proxy receives **de-identified numbers only** (no name/email/id) — unit-tested.

---

## Honesty / compliance guardrails (do not break)
- Everything is an **estimate** ("about/roughly"), 2D single-camera.
- **No medical/injury/diagnostic language** — a test fails if feedback contains it.
- **No pronation prescription** and **no foot-strike-type claims** (not defensible from normal video).
- Shoe matching is **comfort-led**, not foot-type-prescriptive; own products are labeled (FTC).
- Persistent wellness disclaimer in the UI.

---

## Git history (branch `master`, local only — no remote yet)
```
874885d  Smarter, detailed gait analysis + per-step "what's happening" walkthrough
faece44  Add review, slow-mo replay, form feedback and a saved gait graph
9337065  Gate the scan: don't advance without a usable recording
b64e8c7  Add OpenRouter AI explanation (secure proxy + graceful fallback)
a536e7c  Real webcam gait analysis on the web (MediaPipe BlazePose)
b380f0d  Add real on-device pose tracking (camera + skeleton) for the dev build
c1904f2  Initial commit: StrideFit AI - gait analysis + shoe match app
```

---

## Environment gotchas (these bit us — remember them)
1. **Dev servers die on session restart.** Re-run `npm run web` / `npm run server`. For a persistent
   setup, run them in your own terminal.
2. **Stale Metro cache after installing a package** → white screen / "Unable to resolve" even though
   the production export works. Fix: restart Metro with a clean cache: `npx expo start -c`.
3. **MediaPipe can't be bundled by Metro** (dynamic import). We load it from CDN at runtime in
   `PoseScanScreen.web.tsx` — don't `import '@mediapipe/tasks-vision'` directly.
4. **Camera needs a secure context** — works on `localhost` and HTTPS.
5. **Expo tunnels (ngrok) rate-limit / change URL** each restart; prefer running Expo in your own terminal.

---

## Suggested next steps (roughly in order)
1. **Supabase backend** — auth + save scans to the cloud (schema already written in `supabase/`),
   then move the AI proxy into a Supabase Edge Function and point `EXPO_PUBLIC_AI_PROXY_URL` at it.
2. **History / progress view** — compare cadence, stance, step time across past scans.
3. **AI-written walkthrough** — run the "how your step works" text through OpenRouter over the real numbers.
4. **PDF report export** (from saved data).
5. **Phone dev build (Phase 0 spike)** — finish `BUILD_NATIVE.md`, verify real pose on a mid-range Android.
6. **RevenueCat + IAP** for the paywall; enroll in the 15% small-business programs.
7. **Push to GitHub** (currently local-only) so the work is backed up and shareable.
