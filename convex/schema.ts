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

  /**
   * Race calendar (public read). Facts only — no urgency fields; status is
   * derived on the client from dateStart. Every row carries its provenance
   * sourceUrl. `source`: 'curated' rows are owned by the weekly refresh
   * routine (/api/races/ingest → races.replaceAll, which replaces them);
   * 'community' rows are Pro submissions a human approved and are NEVER
   * deleted by the refresh. Absent = curated (pre-community rows).
   */
  raceEvents: defineTable({
    id: v.string(),
    name: v.string(),
    country: v.string(),
    city: v.string(),
    dateStart: v.string(),
    dateEnd: v.optional(v.string()),
    distances: v.array(v.string()),
    major: v.boolean(),
    regUrl: v.optional(v.string()),
    officialUrl: v.optional(v.string()),
    resultsUrl: v.optional(v.string()),
    photosUrl: v.optional(v.string()),
    organizer: v.optional(v.string()),
    sourceUrl: v.string(),
    source: v.optional(v.union(v.literal('curated'), v.literal('community'))),
    updatedAt: v.float64(),
  })
    .index('by_date', ['dateStart'])
    .index('by_event_id', ['id']),

  /**
   * Community race submissions (Kasya Pro only). Validated by the shared pure
   * rules in src/races/submission.ts, checked against the official page by
   * raceSubmissions.verifySubmission, and published ONLY when an admin
   * approves (status 'approved' + publishedEventId = the raceEvents `id`).
   */
  raceSubmissions: defineTable({
    userId: v.id('users'),
    status: v.union(
      v.literal('pending'),
      v.literal('approved'),
      v.literal('rejected'),
      v.literal('auto_rejected'),
    ),
    name: v.string(),
    dateStart: v.string(),
    dateEnd: v.optional(v.string()),
    city: v.string(),
    country: v.string(),
    distances: v.array(v.string()),
    officialUrl: v.string(),
    registrationUrl: v.optional(v.string()),
    organizer: v.optional(v.string()),
    verification: v.optional(
      v.object({
        checkedAt: v.float64(),
        urlReachable: v.boolean(),
        nameFound: v.boolean(),
        dateFound: v.boolean(),
        aiVerdict: v.union(v.literal('legit'), v.literal('doubtful'), v.literal('unavailable')),
        aiSummary: v.string(),
      }),
    ),
    createdAt: v.float64(),
    reviewedAt: v.optional(v.float64()),
    reviewNote: v.optional(v.string()),
    publishedEventId: v.optional(v.string()),
  })
    .index('by_user', ['userId', 'createdAt'])
    .index('by_status_date', ['status', 'dateStart']),

  /** "Report wrong info" on a race (any signed-in user, 5/day). eventId = raceEvents.id. */
  raceReports: defineTable({
    eventId: v.string(),
    userId: v.id('users'),
    reason: v.string(),
    createdAt: v.float64(),
    resolved: v.boolean(),
  })
    .index('by_user', ['userId', 'createdAt'])
    .index('by_resolved', ['resolved', 'createdAt']),

  /**
   * Sign in with Apple refresh tokens, kept ONLY so deleteAccount can revoke
   * the user's Apple session (Apple requires revocation on account deletion).
   * One row per user; removed with the account.
   */
  appleAuth: defineTable({
    userId: v.id('users'),
    refreshToken: v.string(),
    updatedAt: v.float64(),
  }).index('by_user', ['userId']),

  /** Server-side AI coach quota: one row per user per UTC day. */
  aiUsage: defineTable({
    userId: v.id('users'),
    day: v.string(),
    count: v.float64(),
  }).index('by_user_day', ['userId', 'day']),

  /**
   * Step groups (friends' leaderboards). `code` is the 6-char invite code
   * (unambiguous alphabet, unique). Rules: src/groups/rules.ts.
   */
  groups: defineTable({
    name: v.string(),
    ownerId: v.id('users'),
    code: v.string(),
    createdAt: v.float64(),
  }).index('by_code', ['code']),

  /** One row per (group, user). displayName is the public first name — never an email. */
  groupMembers: defineTable({
    groupId: v.id('groups'),
    userId: v.id('users'),
    displayName: v.string(),
    joinedAt: v.float64(),
    role: v.union(v.literal('owner'), v.literal('member')),
  })
    .index('by_group', ['groupId'])
    .index('by_user', ['userId'])
    .index('by_group_user', ['groupId', 'userId']),

  /**
   * Daily activity totals (Apple 5.1.3): uploaded ONLY while the user is in at
   * least one group, readable ONLY by fellow members via groups.leaderboard,
   * never used for ads. `day` is the user's LOCAL calendar day. Rows older
   * than ~70 days are pruned on sync; all rows go when the user leaves their
   * last group or deletes the account.
   */
  stepDays: defineTable({
    userId: v.id('users'),
    day: v.string(),
    steps: v.float64(),
    activeMin: v.float64(),
    kcal: v.float64(),
    updatedAt: v.float64(),
  }).index('by_user_day', ['userId', 'day']),

  /** Running lifetime step total (levels) — kept in sync by steps.sync deltas. */
  userStats: defineTable({
    userId: v.id('users'),
    lifetimeSteps: v.float64(),
    updatedAt: v.float64(),
  }).index('by_user', ['userId']),

  /**
   * Fixed-window rate limiting: the public AI endpoints (per-IP + global) and
   * wrong group invite codes (`groupjoin:<userId>`, hourly windows).
   */
  rateLimits: defineTable({
    key: v.string(),
    windowStart: v.float64(),
    count: v.float64(),
  }).index('by_key', ['key']),
});
