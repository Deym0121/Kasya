# Kasya 1.3.0 — App Store Connect listing (paste-ready)

Build to submit: **1.3.0 (35)** — removes the `audio` background mode (1.3 (34) was rejected under 2.5.4) and
carries the Terms agreement + "Hide this club" in the embedded bundle
(App Review judges the embedded bundle, not later OTAs). Plain text only: no emoji, no `<` `>`.

---

## 1. App Information (applies to every version)

| Field | Value |
|---|---|
| Privacy Policy URL | `https://proficient-cricket-154.convex.site/privacy` |
| License Agreement | Leave **Apple's Standard License Agreement** (our Terms page links to it) |
| Age rating | Re-answer the questionnaire: **User-Generated Content = Yes** (club names/photos) — usually stays 4+ / 12+ depending on answers; keep "Unrestricted Web Access" = No |

## 2. Version 1.3.0 page

| Field | Limit | Value |
|---|---|---|
| Support URL | — | `https://proficient-cricket-154.convex.site/support` |
| Marketing URL | — | (leave empty) |
| Subtitle (optional) | 30 | `Form check, shoes & run clubs` |
| Promotional Text | 170 | see below |
| Keywords | 100 bytes | see below |
| Description | 4000 | see below |
| What's New | 4000 | see below |

### Promotional Text (≤170)

```
New: running clubs. Start or join a club, race other clubs every month in the Philippines and worldwide, and track your steps, runs and heart rate in one place.
```

### Keywords (≤100 bytes, no spaces after commas)

```
running,run club,gait,cadence,pace,steps,step counter,shoes,running shoes,marathon,leaderboard
```

### Description (≤4000)

```
Kasya is your running buddy: check your walking and running form with your phone's camera, find shoes that suit how you move, track every run and walk, and race your friends and your running club.

GAIT ANALYSIS
• Prop your phone, walk or jog past it for about 30 seconds, and get your cadence, rhythm, symmetry and form estimates.
• Everything is analyzed on your phone. No video is uploaded.
• The AI coach explains your results in plain English or Taglish.

SHOE FINDER
• Comfort-led shoe matches based on your stride and your budget.

ACTIVITY TRACKING
• Record runs, walks, rides and hikes with GPS: distance, pace per km, splits, elevation, steps and cadence, even with your screen locked.
• Voice cues every kilometer with your pace and time while Kasya is open.
• Connects with Apple Health to bring in workouts, steps and heart rate from your Apple Watch, plus Garmin, COROS, Polar, Suunto and other watches that sync with Apple Health.
• A daily activity score with steps, active minutes, calories and heart rate, weekly and monthly totals, and goal streaks.
• Share your activity as an image with your route and stats.

GROUPS AND RUNNING CLUBS
• Start a private group, invite friends with a code, and climb weekly and monthly leaderboards. The top 3 earn badges, and every step levels you up.
• Running clubs: create your club with its own photo, or join one. Every member's steps and kilometers add up, and clubs are ranked each month in their country and worldwide by steps, distance and pace. Set a monthly club goal and chase it together.
• Only daily totals are shared with your groups and clubs. Your routes and Health records stay on your phone.

RACE CALENDAR
• Upcoming races in one place. Premium members can submit races, which are checked before they go live.

KASYA PREMIUM
Recording, watch sync, history, groups, clubs and shoe matches are free. Free accounts get 3 gait scans every 7 days. Kasya Premium unlocks unlimited gait scans, the AI coach, race submissions and PDF reports.

Kasya Premium is an auto-renewing subscription. Payment is charged to your Apple ID at confirmation of purchase. The subscription renews automatically unless it is cancelled at least 24 hours before the end of the current period, and your account is charged for renewal within 24 hours before the end of the current period. You can manage and cancel your subscription in your App Store account settings. Any unused portion of a free trial is forfeited when you purchase a subscription.

Kasya provides wellness estimates, not medical advice.

Terms of Use (EULA): https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
Privacy Policy: https://proficient-cricket-154.convex.site/privacy
```

(The Terms line keeps Apple's standard EULA — it already works and satisfies 3.1.2. Kasya's own Terms page,
with the club community rules, is linked inside the app at sign-in and when creating/joining a club.)

### What's New in This Version (≤4000)

```
Kasya now tracks your runs, walks, rides and hikes, syncs your watch, and adds running clubs.

• Daily activity dashboard: a daily score, steps, active minutes, calories and heart rate, with weekly and monthly totals and the days you hit your goal.
• Running clubs: create or join a club with its own photo, and race other clubs every month in the Philippines and worldwide by steps, distance and pace.
• Groups with friends: invite with a code, weekly and monthly leaderboards, badges for the top 3, and levels.
• Record with GPS: distance, pace per km, splits, elevation, steps and cadence, even with your screen locked. Voice cues every kilometer while Kasya is open.
• Sync your watch through Apple Health: Apple Watch, plus Garmin, COROS, Polar, Suunto and others.
• Share your activity as an image.
• Smarter gait analysis and shoe matches that respect your budget.
```

---

## 3. App Privacy (the "nutrition label") — Data Linked to You, purpose **App Functionality**, Tracking **No**

| Category → type | Why |
|---|---|
| Contact Info → **Name** | Sign in with Apple/Google; first name shown in groups/clubs |
| Contact Info → **Email Address** | account |
| Identifiers → **User ID** | account, RevenueCat app user id |
| Health & Fitness → **Health** | daily totals derived from Apple Health (steps, active energy, exercise minutes) when the user joins a group/club |
| Health & Fitness → **Fitness** | daily steps, active minutes, run distance/time for leaderboards; gait scan scores |
| User Content → **Photos or Videos** | club photo (build 34+) |
| User Content → **Other User Content** | club name/description, race submissions, reports, AI coach messages |
| Purchases → **Purchase History** | subscription status (RevenueCat) |

Not collected: Location (routes stay on device), Browsing/Search history, Diagnostics, Usage data, Advertising data. "Used for tracking": **No** for everything.

## 4. App Review Information → Notes (add to the 1.3 notes in docs/release-v1.3.md)

```
Background modes: the app declares only "location" (keeps GPS recording an activity with the screen locked, with the blue location indicator). The "audio" background mode flagged under Guideline 2.5.4 in build 34 has been removed in build 35; voice cues now play only while the app is on screen.

Running clubs and groups (user-generated content):
- Clubs are created in Activity tab > Groups & running clubs > Running clubs > Start a running club. Club name, photo, city and description are public in club rankings and search.
- Users agree to the Terms of Use (zero tolerance for objectionable content or abusive users) on the sign-in screen and again when creating or joining a club. Terms: https://proficient-cricket-154.convex.site/terms
- Filtering: club names, cities and descriptions pass a profanity filter (English and Filipino).
- Reporting: every club page has "Report this club"; three reports hide the club from rankings and search until we review it. We review reports within 24 hours and remove content or users that break the rules.
- Blocking: "Hide this club" removes a club from the user's own rankings and search; club owners can remove members.
- Only daily totals (steps, active minutes, active calories, run distance and time) are shared with group/club members. Routes, location and Health records never leave the device.
- Contact: lloyd.bbedigital@gmail.com
```

## 5. Errors people hit when updating — and what this listing does about them

| Rejection / error | Cause | Covered by |
|---|---|---|
| **3.1.2** "no functional link to Terms of Use (EULA)" | subscription apps need Terms + Privacy links in the metadata | the two link lines at the end of the Description, plus the License Agreement field |
| **5.1.1(i)** privacy policy incomplete | policy must list what's collected, how it's used, retention and deletion | new `/privacy` page (accounts, Health, groups/clubs, photos, AI coach, providers, deletion, rights) |
| **2.5.1** HealthKit not identified | Health use must be clear in the description/UI | "Connects with Apple Health…" bullet |
| **1.2** user-generated content | needs terms agreement, filter, report, block, contact, timely action | Terms page + agreement text in the app (build 35), filter, Report, Hide, review within 24h |
| **2.3.x** metadata | features/claims must match the build | description lists only what build 35 does |
| ASC "invalid characters" / won't save | emoji or unusual symbols, over the limit | plain text; limits checked (Promo ≤170, Keywords ≤100 bytes) |
| Privacy URL "unreachable" | page down or wrong deployment | prod `/privacy` must be deployed before you save the URL |
