# Races Tab — Design

_2026-08-14 · approved by Lloyd · ships as v1.1 (after the v1.0 App Store approval; built on `feature/races-tab`, never merged into the review build)_

## What it is

A fourth bottom tab, **Races**, that answers three questions for runners: what races are coming up (Philippines first, region and world next), what just happened (results), and where the photos are. Inspired by PixHero's event coverage, but international, and honest about what we can serve: a **curated calendar with link-outs**, not a results/photo platform.

Free for every user — it is an engagement feature, not a premium one.

## Screens

### Races tab

- **Header**: "Races" title; a segmented toggle — **Upcoming | Results**.
- **Country filter chips** (horizontal scroll): All · 🇵🇭 PH · 🇸🇬 SG · 🇲🇾 MY · 🇹🇭 TH · 🇮🇩 ID · 🇻🇳 VN · 🇭🇰 HK · 🌍 Majors. Selected chip fills accent orange. "Majors" is a virtual filter for the six World Marathon Majors regardless of country.
- **Month strip** (horizontal scroll): month pills (AUG · SEP · OCT …) covering the months that actually have events after filtering; tapping scrolls the list to that month's section. Selected pill uses the orange-circle style from the approved reference.
- **Event list**, grouped by month with sticky-feel month headers:
  - Left: **date badge** — big day number over a small weekday+month, accent-tinted.
  - Middle: race name; city + country flag; **distance chips** for the distances offered (e.g. 5K · 10K · 21K · 42K).
  - Right: **status tag** — `Open` (future, registration link known), `Announced` (future, no registration link yet), `Done` (past).
- **Results view** (toggle): past events from the last ~90 days, newest first, same card layout plus **Results** and **Photos** buttons directly on the card.
- **Cards are typographic** — no event photography anywhere (no licensed imagery exists for this). Cleanliness comes from spacing, the date badge, and restrained color.
- A quiet one-line banner appears when data came from cache/bundled seed rather than a live fetch: "Shown from your last update."

### Event detail

Pushed from any card. Date badge + name, city/country + flag, organizer, distance chips, then actions:

- **Register** (primary, accent) — only when a registration URL exists.
- **Official site** (secondary).
- **Results** and **Photos** (secondary) — shown when those URLs exist; for PH races Photos usually points at PixHero's event page.
- All links open in the system browser. Footer note in the house voice: "Details can change — confirm on the official page."

## Data

### Convex table `raceEvents`

| Field | Type | Notes |
|---|---|---|
| `name` | string | e.g. "Manila Marathon 2027" |
| `country` | string | ISO-3166 alpha-2 (`PH`, `SG`, …) |
| `city` | string | display name |
| `dateStart` | string | ISO date (`YYYY-MM-DD`), local race date |
| `distances` | string[] | subset of `5K 10K 21K 42K Ultra Other` |
| `major` | boolean | true only for the six World Marathon Majors |
| `regUrl` | string? | registration page |
| `officialUrl` | string? | official site / organizer page |
| `resultsUrl` | string? | official results page |
| `photosUrl` | string? | photo platform (PixHero for PH) |
| `organizer` | string? | display only |
| `sourceUrl` | string | provenance — where the entry was verified |
| `updatedAt` | number | ms epoch, set on write |

Indexed by `dateStart`. One public query `races:list` returns events from 90 days past to 18 months ahead, ordered by date. No auth required; it is public calendar data. `status` is **derived on the client**: `Done` when `dateStart` is past, else `Open` when `regUrl` exists, else `Announced` — the server stores facts, not urgency.

### Seeding & curation

- `scripts/seed-races.mjs` pushes a validated JSON seed to Convex (deploy-key auth, same pattern as existing scripts).
- Seed entries are researched from **official sources only** (organizer sites, PixHero event pages, takbo.ph calendar, the WMM sites, SEA marquee race sites). Every entry keeps its `sourceUrl`.
- **Rule: no officially-announced date → no entry.** We never guess next editions.
- `scripts/check-races-seed.mjs` (run in CI-less mode via npm script) validates the seed: schema shape, ISO dates, no past-dated "upcoming" entries at seed time, https URLs, country codes in the supported set.
- The same validated JSON is bundled as `src/data/raceSeed.json` — the offline/day-one fallback.

### Client module `src/races/`

- `types.ts` — `RaceEvent`, country metadata (name, flag emoji).
- `logic.ts` (pure, TDD): filter by country/majors, group by month, derive status, format date badge parts, month-strip building.
- `useRaces.ts` — hook: live Convex query when cloud is on → AsyncStorage cache (`kasya:races:v1`) → bundled seed. Never throws; reports `source: 'live' | 'cache' | 'seed'` for the banner. Follows the fail-open philosophy of `getConvex()`.
- `RacesScreen.tsx` + `RaceDetailScreen.tsx` under `src/screens/`.

## Navigation

`MainTabs` gains **Races** between Home and History (Feather `flag` icon). The camera FAB is untouched. `RaceDetail` registers on the root stack (`{ event: RaceEvent }` param). No deep links in v1.

## Failure & empty states

- Cloud off / offline / query error → cache → seed, with the banner. The tab always renders content.
- A filter with no events → friendly empty state ("No races here yet — check another country or month").
- Malformed cached JSON → silently discarded, seed used.

## Testing

- Vitest on all of `logic.ts`, seed validation (the checker runs as a test too), and `useRaces` source-fallback order (mocked storage/client).
- Copy passes the existing no-medical-language conventions; all user-facing claims hedged where estimates are involved.
- Full browser walkthrough (web) + typecheck before merge; on-device check rides the first v1.1 build.

## Explicitly not in v1

In-app results tables · bib-number photo search · race push-reminders · add-to-phone-calendar · user-submitted events · external race APIs · monetization of the tab. Each can layer on later without schema breakage (the table and link-out fields already carry what they'd need).

## Release plan

Built and verified on `feature/races-tab`. Merges into the release branch only after Apple approves v1.0; ships as **v1.1** with the seed already pushed to Convex so the tab is live-populated on day one.
