# Kasya — Project Status & Handoff

> **Renamed:** this app is now **Kasya** (2026-07-16). Older references to "StrideFit" in dated docs are historical.

_Last updated: 2026-08-07 (full-app bug-fix sweep: ~35 audit findings fixed across capture, gait core,
entitlement, storage, AI proxy and viz — see git log; 129 tests + typecheck green). This is the single
source of truth for picking the project back up._

## What it is

A **wellness-grade running/walking form coach + comfort-led shoe finder** (React Native + Expo, TypeScript).
Record a short walk with your phone/webcam → on-device/in-browser pose analysis → a real cadence + form
read → slow-mo review + graph + feedback → shoe matches. Capture is **two-angle**: a required **side view**
(cadence + form) plus an **optional rear view** (hip level, base of support, sway, left/right symmetry),
merged into **one** result. **Privacy-first: nothing is saved to your history but derived motion data and
metrics** — an optional review clip stays on-device and is deleted right after the review, never uploaded.
Wellness-only framing (estimates, never medical/diagnostic claims).

Full product plan: `~/.claude/plans/please-re-plan-this-wiggly-pony.md`

---

## Current status (what works today)

| Area | Status |
|---|---|
| Full app flow | ✅ Onboarding → sign-in (mock) → **bottom tabs (Home · Scan · History · Profile)** → scan setup → camera guide → scan → processing → result → **review/slow-mo** → shoe matches → paywall |
| **Bottom tab navigation** | ✅ Root stack + nested tabs; raised center Scan button; scan flow full-screen over tabs |
| **Scan history + progress** | ✅ History tab: trend chart (cadence/symmetry/stance, svg), "up about N spm" delta, scan list → Result, per-scan delete + Clear all (tested progress.ts) |
| **Reminders & coaching** | ✅ Re-scan reminder (Off/Weekly/2wk/Monthly in Profile): in-app due banner everywhere + optional native local notification (expo-notifications; web = banner only). Daily rotating "Today's focus" coach card (tested coach.ts) |
| **Metric explainers** | ✅ Tap any metric tile → plain-English + typical-range panel (tested metricInfo.ts; bands mirror form/frontal thresholds); outlier tiles warn-tinted |
| **Demo paywall entitlement** | ✅ "Start free trial"/"Lifetime" set plan=premium locally (honest "no payment was made" note); premium gates ONLY the AI coach chat (shoe matches + history are free for everyone — the paywall copy says so honestly); plan survives sign-out/re-login via a per-email entitlement map |
| **Post-scan celebration** | ✅ Honest Processing (no fake ticker; min 1.2s hold) → svg success ring + haptic (expo-haptics, native) → Result count-up hero + staggered card reveals (RN Animated — NOT reanimated) |
| **Real gait analysis on web** | ✅ MediaPipe BlazePose on the webcam, live skeleton, real cadence + form metrics from real movement |
| **Two-angle capture** | ✅ Side view (required) → optional rear view chained in-screen (reuses the loaded model) → both fold into one report; rear view adds hip drop, base width, sway, symmetry |
| **Get-ready countdown** | ✅ Selectable 3/5/10s lead-in before recording (big on-screen count), so users get into position |
| **Positioning guide** | ✅ Dashed body-outline overlay before recording (turns green when detected) — web + native; `src/viz/bodyGuide.ts` |
| **3D skeleton (Review)** | ✅ Drag-to-rotate skeleton from captured depth (z), with callout pins on flagged joints (bounce/overstride/knee); `src/viz/Skeleton3D.tsx` |
| **Rear left/right view** | ✅ Per-leg alignment lines (teal L / coral R) + Left vs Right foot-lift/base panel. **Comfort-led, NO pronation / shoe-type prescription** (deliberately) |
| **Gait-cycle diagram** | ✅ Educational stance/swing phase graphic (heel strike → swing) in Review; `src/viz/GaitCycleDiagram.tsx` |
| Capture gating | ✅ Won't advance unless it recorded a usable walk (side gated on cadence/quality, rear on frontal quality; detects you in frame; validates after recording) |
| Slow-mo review + graph | ✅ Skeleton replay (0.25/0.5/1×) + step-rhythm graph + metrics + feedback, all from saved data |
| **Opt-in video review** | ✅ Off by default; "Record my video (just this once)" → in-memory (web) / temp file (native) clip shown in Review with skeleton overlay, then **hard-deleted on exit**; never saved to the report, never uploaded. `videoHolder.ts` + `VideoReplay.{web,native}.tsx` |
| Smart analysis | ✅ Per-foot step events, step timing, stance %, overstride at contact, knee angle at contact/peak, symmetry, lead foot, plain-English "how your step works" walkthrough |
| AI explanation (OpenRouter) | ✅ Optional — local secure proxy; app falls back to built-in tip if off |
| **AI coach (chatbot)** | ✅ Multi-turn **chat** on **gpt-5-mini** (env-swappable), scoped ONLY to the scan's numbers — refuses off-topic (verified). **Premium-only, 50 chats/day** (client quota `aiQuota.ts`); free users see the rule-based plan + upgrade CTA. `reasoning:{effort:'low'}` + higher max_tokens so the reasoning model returns visible content. Proxy also rate-limits per-IP/min as a cost backstop. Needs `npm run server` + `OPENROUTER_API_KEY` in `.env` (desktop/localhost, or a reachable proxy URL for phone) |
| **Movement replay (X-ray)** | ✅ Replaced the drag-3D — **shaded volumetric X-ray body** (tapered limb/torso/head volumes, blue gradient + glow) + bone skeleton that re-enacts the captured motion, glowing the joints the analysis flagged (wellness-framed, not injury); `src/viz/XraySkeleton.tsx` |
| **Shoe images** | ✅ `Shoe.image` field + `ShoeThumb` (real photo when set, tinted sneaker glyph otherwise) on Home + ShoeMatches |
| Shoe matching | ✅ **Gait-informed + comfort-led** — ranks the WHOLE 14-shoe catalog by goal + scan signals (bounce nudges cushioning), scan-specific reasons; NOT pronation/foot-type. FTC "our product" labels; own product never ranked above an equal rival. Full list shown to everyone (no paywall gate) |
| Design system | ✅ Sora typeface, ink/coral palette, Feather icons, custom components |
| Backend (Supabase) | ⬜ Not built — everything is local (AsyncStorage / localStorage) |
| **Real pose on the PHONE** | ⬜ Scaffolded but needs a dev build — see `BUILD_NATIVE.md` (not verified on-device) |

**Tests:** 87 passing (vitest — gait core + rear-view pass incl. per-side + metricInfo/progress/coach/reminderDue/reports storage, all with no-medical-language + hedging guards). **Typecheck:** clean. **Web bundle:** builds (~715 modules).

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
4. Record + **walk side-on for 10s** → then either **"+ Add rear view"** (turn away, walk straight away for 10s)
   or **"Analyze side view only"** → Result → **Review & slow-mo → "How your step works"**

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
App.tsx                     Root native-stack (Onboarding/SignIn/Tabs + full-screen flows)
src/MainTabs.tsx            Bottom tabs: Home · Scan (center action → ScanSetup) · History · Profile
index.ts                    Expo entry

src/gait/                   PURE-TS analysis core (unit-tested, no RN imports)
  types.ts                  Landmark / PoseFrame / GaitResult; MediaPipe 33-landmark indices
  signal.ts                 median, findPeaks (plateau-aware)
  ruleEngine.ts             computeCadence, assessCaptureQuality, analyzeGait, gaitSignal
  poseMapper.ts             toPoseFrame — MediaPipe landmarks -> PoseFrame (by index, visibility)
  events.ts                 detectFootEvents — per-foot contacts + toe-offs
  stepAnalysis.ts           analyzeSteps + describeGait (step timing, stance, walkthrough)
  form.ts                   computeFormMetrics + buildFeedback (wellness-only)
  frontal.ts                REAR-view pass: analyzeFrontal (hip drop, base width, sway, symmetry) + quality + feedback
  detailed.ts               analyzeGaitDetailed / buildDetail / buildFrontalDetail / downsampleFrames
  insights.ts               cadenceTip (rule-based fallback)
  metricInfo.ts             tap-to-explain copy + typical bands (mirror form/frontal thresholds)
  progress.ts               buildTrends / cadenceDelta / deltaCopy (History charts)
  coach.ts                  GENERIC_TIPS + pickCoachTip (deterministic daily rotation)
  synthetic.ts              makeSyntheticWalk (simulated scans + tests)
  GaitEngine.ts / MockGaitEngine.ts / LivePoseGaitEngine.ts   engine interface + adapters

src/screens/                Onboarding, SignIn, Home, ScanSetup, CameraGuide,
  PoseScanScreen.web.tsx      real webcam pose (MediaPipe from CDN)
  PoseScanScreen.native.tsx   dispatcher: Expo Go -> Simulated, dev build -> PoseScanCamera
  PoseScanCamera.native.tsx   real device camera (vision-camera + skia), @ts-nocheck
  SimulatedScanScreen.tsx     simulated fallback
  Processing, Result, Review, ShoeMatches, Paywall, Profile

src/viz/                    SkeletonPlayer.tsx (2D replay + optional L/R leg lines), GaitGraph.tsx, TrendChart.tsx,
                            XraySkeleton.tsx (X-ray movement replay + joint glow), GaitCycleDiagram.tsx,
                            LeftRightCompare.tsx, ShoeThumb.tsx (shoe image/glyph), bodyGuide.ts — react-native-svg
src/goals.ts                shared GOALS map + goalLabel
src/haptics.ts              successHaptic (expo-haptics; web no-op)
src/notifications/          reminders.ts — the ONLY expo-notifications touchpoint (lazy, native-only)
src/ai/                     features.ts (buildGaitFeatures + buildCoachFeatures), explain.ts, coach.ts (client calls)
src/shoes/ + src/data/      matchShoes (comfort-led) + seed shoe catalog
src/storage/                reportRecord (what's persisted), reports (AsyncStorage, capped 20, delete/clear), session,
                            settings (reminder prefs), reminderDue (pure due logic + banner copy)
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

Optional **rear view** runs in parallel to the side pass and is merged into the same report:
`frontalFrames: PoseFrame[]` → `analyzeFrontalDetailed` (hip drop, base width, sway, symmetry + **per-side lift/base
via `analyzeFrontalSides`** + quality + wellness feedback) → `buildFrontalDetail` persists `frontal` + a downsampled
rear skeleton. Cadence stays side-only. Landmark **depth (z) is now kept** (rounded) so the saved skeleton drives
the 3D view. NOT computed (not defensible from 2D): **pronation, foot-strike type, support/stability prescription**.

---

## Data & privacy model
- **Saved** (AsyncStorage / a Supabase row later): cadence, form metrics, feedback, graph data, step
  analysis, walkthrough, and a **downsampled skeleton** (for replay). History capped at 20 scans.
- **Never saved to storage:** the video/frames of you — the persisted report holds only derived landmark data.
- **Opt-in video (new):** off by default. If the user ticks "Record my video (just this once)", the clip stays
  **in memory (web object URL) / a temp file (native)** — held in `src/viz/videoHolder.ts`, shown ONLY on that
  scan's Review with the skeleton overlaid, then **hard-deleted on Review exit** (revoke URL / delete file). It is
  **never written into the saved report and never uploaded**, and is tied to the report id so old History scans never
  show a stale clip. Analysis still uses landmarks only — video is never part of the gait pipeline.
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
c1904f2  Initial commit: Kasya - gait analysis + shoe match app
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
   Re-audit the sync path to keep it numeric-only (no video — audited clean locally 2026-07-03).
2. ~~History / progress view~~ ✅ Done (History tab + TrendChart + delta).
3. **AI-written walkthrough** — run the "how your step works" text through OpenRouter over the real numbers.
4. **PDF report export** (from saved data) — the paywall promises it.
5. **Share-a-result card** (image share sheet).
6. **Phone dev build (Phase 0 spike)** — finish `BUILD_NATIVE.md`, verify real pose on a mid-range Android;
   ALSO device-verify: success haptic, local reminder notifications, native capture try/catch.
7. **RevenueCat + IAP** — replace the demo entitlement (PaywallScreen `activate()`) with real purchases.
8. **Streaks / badges** — engagement mechanics on top of History data.
9. **Shoe detail screen + catalog filters**.
10. **Push to GitHub** (currently local-only) so the work is backed up and shareable.
