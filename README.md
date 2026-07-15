# Kasya

A wellness-grade running/walking **form coach** + comfort-led shoe finder. Capture your stride
with your phone, get personalized form estimates **led by cadence** (the one strongly-validated
metric), and match shoes to your goals and comfort. A coach — **not** a clinical gait lab or
injury screen.

> Full product plan: `~/.claude/plans/please-re-plan-this-wiggly-pony.md`
> Research that shaped it: see the re-plan's Context section.

## Status (Phase 0/1 foundation)

- ✅ Expo SDK 56 + TypeScript app scaffold
- ✅ Pure-TS **gait core** (`src/gait/`), test-driven, 16 passing tests:
  cadence (ankle-separation peak detection), capture-quality gate, cadence coaching tip
- ✅ `GaitEngine` interface with **`MockGaitEngine`** (active) + **`LivePoseGaitEngine`** stub
- ✅ Screens: Home → Scan → Result, wired to the mock engine (runs in **Expo Go** today)
- ✅ On-device report persistence (AsyncStorage) — no video/frames ever stored
- ✅ Corrected Supabase schema (`supabase/migrations/0001_init.sql`)
- ⬜ **Phase 0 spike:** real on-device pose (react-native-vision-camera + 33-landmark MediaPipe/ML Kit
  pose) behind an EAS dev client — the make-or-break technical bet
- ⬜ Phase 2+: Supabase auth/sync, rule-engine+LLM explanation, shoe DB, RevenueCat/IAP

## Honest scope

The current build uses **simulated analysis** (the mock engine) so the whole flow works in Expo Go.
Per the plan, prescriptive outputs (pronation / stability / cushion / support) and foot-strike from
normal video are intentionally **not** included — they aren't scientifically defensible and risk
app-store/FTC rejection. Cadence leads; everything else is a hedged estimate.

## Develop

```bash
npm install            # install deps
npm test               # run the gait-core unit tests (vitest)
npm run typecheck      # tsc --noEmit
npm start              # start Metro; open in Expo Go (mock flow works)
```

**Important:** the real on-device pose engine needs native modules, so it will require a **custom
EAS dev client** (`expo prebuild` + config plugins) — it cannot run in Expo Go. The mock-driven app
above runs in Expo Go fine.

## Structure

```
App.tsx                     # navigation (Home → Scan → Result)
src/gait/                   # pure-TS gait core (unit-tested)
  types.ts                  # Landmark / PoseFrame / GaitResult ...
  signal.ts                 # median, findPeaks (plateau-aware)
  ruleEngine.ts             # computeCadence, assessCaptureQuality, analyzeGait
  insights.ts               # cadenceTip (hedged coaching copy)
  GaitEngine.ts             # the swappable engine interface
  MockGaitEngine.ts         # canned result (active)
  LivePoseGaitEngine.ts     # real on-device engine (Phase 0 stub)
src/storage/                # on-device persistence (AsyncStorage)
src/screens/                # Home, Scan, Result
src/components.tsx          # PrimaryButton, Card, ConfidenceChip, Disclaimer
src/theme.ts                # orange/white brand tokens
supabase/migrations/        # Postgres schema + RLS
```

## Disclaimer

Kasya gives wellness and shoe-selection estimates, not medical advice or a diagnosis. For pain
or injury, consult a qualified professional.
