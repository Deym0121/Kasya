# Kasya v1.3 — release kit

Build: v1.3.0 (build 30), EAS-managed signing, branch `feature/activity-tracking`.

## App Store "What's New" (paste into App Store Connect)

Kasya now tracks your runs, walks, rides and hikes — and syncs your watch.

• Record with GPS: distance, pace per km, splits, elevation, steps and cadence, with auto-pause. Keeps recording with your screen locked.
• Voice cues every kilometer with your pace and time.
• Sync your watch through Apple Health — Apple Watch, plus Garmin, COROS, Polar, Suunto, Samsung and Amazfit via their own Health sync.
• Share your activity: route + stats + the Kasya logo, square or story size, with an option to hide where you started and finished.
• Smarter gait analysis: more accurate cadence on uneven strides, works whichever direction you walk, and no more phantom readings when you stand still.
• Shoe matches now respect your budget.
• Add races to the calendar (Premium) — every submission is checked against the organizer's page before it goes live.
• New, lower Premium price, with a 7-day free trial.

## App Review notes (replace the old demo-account notes)

- Sign in with Apple or Google (email/password sign-in is not shown in this version).
- **Location**: used only while the user records an activity (Activity tab → Run/Walk/Ride/Hike → Start). "While Using" permission + the location background mode keep GPS recording with the screen locked, with the blue status-bar indicator. Location is never used when not recording. Routes are stored on the device only.
- **Background audio**: speaks a short voice cue at each kilometer during a recording (toggle on the Record screen).
- **HealthKit**: optional, from Activity tab → "Connect Apple Health". Reads workouts, workout routes, steps and heart rate so workouts from the user's watch appear in Kasya; writes the user's Kasya recordings back to Health. Health data stays on the device and is never used for advertising.
- **Motion & Fitness**: step count and cadence during foot activities.
- **Free vs Premium**: free accounts get 3 gait scans per 7 days — a 4th scan in a week opens the paywall by design. Premium: unlimited scans, AI coach, race submissions, PDF export.
- **Race submissions** (Premium): submitted races are verified against the official URL and approved by the Kasya team before appearing; users can report wrong race info.
- Recording needs a GPS signal; indoors the Record screen shows "GPS searching".

## App Store listing

- Description must mention the Apple Health integration (guideline 2.5.1) — e.g. add: "Connects with Apple Health to bring in workouts from your Apple Watch and other watches."
- New screenshots: Activity tab, Record screen (live map + stats), Activity detail (splits/charts), share image, watch-sync card.

## App Privacy — re-check before submitting

- Routes, activities and Health data: stay on device → not "collected".
- **Race submissions + race reports are new server-side data** tied to the user's account (race details they typed, the time, their user id). Declare under *User Content → Other User Content*, linked to the user, purpose *App Functionality*, not used for tracking.
- Mapbox: no token in this build (maps fall back to an on-device outline), so no Mapbox network traffic yet. When the token ships (OTA), re-check MapboxCommon's privacy manifest.

## Before you press "Submit for Review"

1. Convex deployed (race submissions + ADMIN_EMAILS) — the paywall advertises submissions.
2. Prices + 7-day trial set in App Store Connect (docs/pricing-v1.3.md).
3. TestFlight pass on a real iPhone: record a short outdoor walk with the screen locked (voice cue at 1 km), connect Apple Health, share an image, a gait scan, the paywall.
