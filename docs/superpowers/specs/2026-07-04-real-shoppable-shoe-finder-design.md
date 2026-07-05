# Real, AI-matched, shoppable shoe finder — design

_Date: 2026-07-04. Status: approved (verbal “go proceed”)._

## Problem

The shoe finder shows **fake, inaccurate images** — every `Shoe.image` in `src/data/shoes.ts`
points to `loremflickr.com` (random photos, not the actual model). The catalog is a small,
mostly-premium hand-picked list (14 shoes) with **no way to buy** and no reach into the affordable
Shopee / TikTok Shop / “China brand” shoes Filipino buyers actually see. Users can’t find or trust
the recommendation.

## What the user wants (their words, decoded)

- **No generated / fake images.** Show the *real* shoe with a **100%-accurate thumbnail**.
- Shoes must be **searchable / buyable on the web** — **Shopee and TikTok Shop too**, not just a
  fixed premium list.
- **All brands, all price tiers** — keep Asics/Nike/Brooks *and* add the flood of affordable
  China/local brands. “Put all the shoes available to the users.”
- Recommendations **grounded in the user’s gait scan**, and **AI helps** make + explain the picks.

## Locked decisions (from this brainstorm)

1. **Sourcing = link-out now, live feed later** (hybrid). Ship real *searchable* links today (no
   backend / API keys needed); keep a swappable data layer so a live marketplace/affiliate feed
   drops in later. (User picked this.)
2. **AI does the matching + explanation**, grounded in the scan — with the existing deterministic
   `matchShoes` as the always-on fallback (offline / no key). (User asked for AI here.)
3. **All brands & tiers**, including budget/China brands popular on Shopee/TikTok PH. (User.)
4. **Remove the fake house shoe** `StrideFit Support Runner` — it isn’t a real, buyable product and
   has no listing. (Confirmed via “go proceed”.)
5. **Light, optional fit inputs** — foot width (regular/wide), size, budget cap — stored locally,
   used to feed the AI and pre-fill the marketplace search. Optional; the app works without them.

## Honesty guardrails (unchanged, must not break)

- **No pronation / arch / foot-strike / medical / “correct” claims.** Matching stays **comfort-led**
  and **gait-informed** (goal + how you move + stated fit prefs), never foot-type-prescriptive.
- The AI is constrained by a strict system prompt AND a response sanitizer (below).
- Everything hedged (“about”, “try them on”). Prices shown as **approximate bands**; the live link
  is the source of truth for the real current price.
- FTC labeling logic stays in the code (in case an own-product returns later), but no fake SKU ships.

## Architecture

### 1. Data model + broad catalog — `src/data/shoes.ts`
- Extend `Shoe`:
  - `tier: 'premium' | 'midrange' | 'budget'` — surfaces affordable/China options.
  - `image?` stays, but **every `loremflickr` URL is deleted**. `image` is set only for a
    hand-verified real product photo; otherwise the UI shows the clean glyph.
  - `shop?: { shopee?: string; tiktok?: string; lazada?: string }` — optional curated *direct*
    product URLs that override the generated search links when present.
- Expand catalog to ~30–45 **real** models across tiers (premium global + budget/local/China brands
  verified as sold in PH). Facts only. Remove `sf-support-runner`.
- Catalog rows are seeded from a verified research pass (real models + approximate ₱ bands +
  marketplace URL formats).

### 2. Shoppable links — `src/shoes/shopLinks.ts` (new, pure, unit-tested)
- `marketplaceLinks(shoe, profile?) → { key, label, url }[]` builds **live search URLs** for
  Shopee PH, TikTok Shop, Lazada PH, Google Shopping from `brand + model` (+ size / budget when
  the fit profile supplies them). URL-encoded; verified templates from research.
- Curated `shop.*` direct URLs override the generated search URL for that marketplace when set.
- Consumed by the UI via React Native `Linking.openURL` (works web + native).

### 3. AI-matched picks — proxy `+ src/ai/shoes.ts` (new)
- **Proxy** (`server/dev-proxy.mjs`): add `/api/shoes`. Input: de-identified gait features
  (`buildCoachFeatures`) + goal + fit profile + the **candidate catalog (facts + ids only)**.
  Output: JSON `{ picks: [{ id, reason }] }` — a ranked shortlist choosing **only from the given
  ids**. New `SHOES_SYSTEM` mirrors the coach guardrails: comfort-led, no pronation/medical/
  “correct”, must not invent shoes, hedged.
- **Client** (`src/ai/shoes.ts`): `recommendShoes(report, shoes, profile) → ShoeMatch[]`.
  - Calls the proxy; **sanitizes** the response: drop any `id` not in the catalog; drop any reason
    containing banned language; if fewer than N valid picks come back, or on ANY error / offline /
    no key → **fall back to the tested `matchShoes`**. AI enhances; deterministic is the backbone.
  - Returns the same `ShoeMatch[]` shape the UI already renders, tagged with `source: 'ai' | 'rules'`.

### 4. Fit profile — `src/storage/fitProfile.ts` (new, follows `settings.ts`)
- `{ sizeLabel?: string; width?: 'regular' | 'wide'; budgetMaxPhp?: number }`, AsyncStorage.
- A small **“Refine fit”** control on `ShoeMatchesScreen` (size text, width toggle, budget). Feeds
  the AI + `shopLinks`. Purely additive; empty profile = today’s behavior.

### 5. UI — `ShoeMatchesScreen.tsx` + `HomeScreen.tsx` + `ShoeThumb.tsx`
- Each card gains a **“Find it → Shopee · TikTok Shop · Lazada”** action row (opens the real
  listing). An **“AI pick”** badge when `source==='ai'`; otherwise the rule-based reason as today.
- `ShoeThumb`: unchanged logic (real photo when `image` set, else glyph) — but now honest because no
  fake URLs ship. Add a subtle tier chip (Budget/Mid/Premium) so affordable options read clearly.
- Home’s top-3 “Recommended for you” uses the same source (rules on Home for speed; AI on the full
  screen), with the same shop row optional.

## Testing (vitest, pure modules only — keep 87 green + add)

- `shopLinks.test.ts`: correct per-marketplace templates; URL-encodes brand+model; injects size/
  budget when present; curated `shop.*` overrides the search URL.
- `shoes.ai` sanitizer test (pure helper extracted from the client): strips unknown ids, strips
  banned-language reasons, falls back to `matchShoes` when the AI returns junk/empty.
- `shoes.data` integrity test: **no `loremflickr`/generated hosts**; every shoe has brand+model,
  sane price band (min≤max, >0), a valid tier; no `isOwnProduct` fake SKU ships.
- Extend `match.test.ts` only as needed for the `tier` field (existing behavior preserved).

## Out of scope (future — the “live feed” upgrade)
- Real Shopee Affiliate / TikTok Shop / Lazada / Google-Shopping API integration behind a Supabase
  Edge Function (real in-app photos + live prices + affiliate revenue). Needs program approval +
  keys + the backend. The link-out data layer here is shaped so this is a drop-in swap.
- Optional foot-photo width/arch estimate (explicitly deferred — honesty risk).
