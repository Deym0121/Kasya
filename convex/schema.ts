import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { authTables } from '@convex-dev/auth/server';

/**
 * Kasya's Convex schema. Privacy contract carries over from the Supabase era:
 * report rows hold ONLY the derived numbers whitelisted by toGaitReportRow —
 * never landmark frames, never video.
 */
export default defineSchema({
  ...authTables,

  /** One row per synced scan. localId is the on-device report id. */
  reports: defineTable({
    userId: v.id('users'),
    localId: v.string(),
    createdAt: v.string(),
    scanType: v.string(),
    cadence: v.union(v.float64(), v.null()),
    overstrideEstimate: v.union(v.float64(), v.null()),
    kneeFlexionRange: v.union(v.float64(), v.null()),
    metrics: v.union(v.any(), v.null()),
    captureQuality: v.union(v.any(), v.null()),
    symmetryScore: v.union(v.float64(), v.null()),
    kneeValgusScore: v.union(v.float64(), v.null()),
    hipDropScore: v.union(v.float64(), v.null()),
    summary: v.union(v.string(), v.null()),
    recommendationSummary: v.union(v.string(), v.null()),
  })
    .index('by_user', ['userId'])
    .index('by_user_local', ['userId', 'localId']),

  /**
   * Server truth for premium, written ONLY by the RevenueCat webhook.
   * rcAppUserId is RevenueCat's app_user_id; when the app calls
   * Purchases.logIn(<convex user id>) it equals the users table id and
   * userId gets linked. Active = expiresAt in the future (or null for
   * non-expiring grants) — computed at read time, never trusted from clients.
   */
  entitlements: defineTable({
    userId: v.optional(v.id('users')),
    rcAppUserId: v.string(),
    productId: v.union(v.string(), v.null()),
    expiresAt: v.union(v.float64(), v.null()),
    environment: v.union(v.string(), v.null()),
    lastEventType: v.string(),
    updatedAt: v.float64(),
  })
    .index('by_user', ['userId'])
    .index('by_rc', ['rcAppUserId']),

  /** Server-side AI coach quota: one row per user per UTC day. */
  aiUsage: defineTable({
    userId: v.id('users'),
    day: v.string(),
    count: v.float64(),
  }).index('by_user_day', ['userId', 'day']),
});
