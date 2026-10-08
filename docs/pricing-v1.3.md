# Kasya Premium pricing — v1.3

Decided 2026-10-08. The app never hard-codes prices: the paywall shows the
store's own price strings, computes the "SAVE x%" badge from the real monthly
and yearly prices, and switches the button to "Start 7-day free trial" (with
Apple's required disclosure) when the product has a free introductory offer.
So everything below is configured in **App Store Connect** — no app release is
needed to change it.

## Price points

| Storefront | Monthly (`com.kasya.app.pro.monthly`) | Yearly (`com.kasya.app.pro.yearly`) | Badge |
|---|---|---|---|
| Philippines (main market) | ₱249 | ₱1,490 (≈ ₱124/mo) | SAVE 50% |
| United States (base for every other country) | $7.99 | $49.99 (≈ $4.17/mo) | SAVE 48% |

Free trial: **7 days on the yearly plan**, for new subscribers.

Why: Strava is about $11.99 / $79.99 in the US and roughly ₱219–299 a month in the
Philippines; Garmin Connect+ is $6.99 / $69.99; Runna is $19.99 / $119.99.
Kasya's current $9.99 / $79.99 matches Strava's yearly price with far fewer paid
features, so v1.3 drops the price and adds the scan allowance below.

## What's free vs Premium in v1.3

Free: GPS recording (run/walk/ride/hike), splits, charts, Apple Health watch
sync, history, shoe matches, the race calendar, share images, **3 gait scans per
rolling 7 days** (demo/simulated scans don't count).

Premium ("Kasya Pro" entitlement): unlimited gait scans, AI coach chat (50
replies/day), submitting races to the calendar, PDF report export.

Only list features that are live in the reviewed build (App Review 2.1 / 3.1.2).
The race-submission backend must be deployed to Convex before v1.3 is submitted.

## Steps in App Store Connect

Exact labels in App Store Connect shift over time; the flow is:

1. **Apps → Kasya → Monetization → Subscriptions → (the Kasya Pro group)**.
2. Open **monthly** → *Subscription Prices* → change the price:
   - pick **United States** as the base at **$7.99** and let Apple calculate the rest;
   - then edit **Philippines** manually to **₱249**.
   - When asked about existing subscribers: this is a *decrease*, so apply the
     new price to existing subscribers too (they pay less — no consent needed).
3. Open **yearly** → same, **$49.99** base, **Philippines ₱1,490**.
4. Yearly → *Introductory Offers* → **Free**, **1 week**, all territories, new
   subscribers only.
5. RevenueCat needs no change (same product IDs, same `Kasya Pro` entitlement,
   same default offering). Check the paywall in TestFlight: the badge should
   read SAVE 50% on a PH account, SAVE 48% on a US account, and the button
   "Start 7-day free trial" on Yearly.
6. If you are not in Apple's **Small Business Program** yet, enrol (15% commission
   instead of 30% under $1M/yr).

## Watch for

- Price changes can take up to a day to show in the sandbox / TestFlight.
- Review notes for v1.3 should mention the free allowance (3 scans/week) so the
  reviewer knows a 4th scan in a week opens the paywall on purpose.
