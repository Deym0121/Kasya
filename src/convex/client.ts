import { ConvexReactClient } from 'convex/react';

/**
 * Lazy Convex client from the EXPO_PUBLIC env var. When the var is absent the
 * app runs fully local (guest/demo mode) — mirroring the old Supabase seam.
 * ONE shared instance: ConvexAuthProvider attaches the session to it, so
 * imperative query/mutation calls (e.g. report sync) are authenticated too.
 */

// Literal process.env.EXPO_PUBLIC_* read — Expo inlines exactly this dot form
// at bundle time; indirect reads are undefined in production builds.
const url = process.env.EXPO_PUBLIC_CONVEX_URL;

let client: ConvexReactClient | null = null;

export function isCloudEnabled(): boolean {
  return !!url;
}

export function getConvex(): ConvexReactClient | null {
  if (!url) return null;
  if (!client) client = new ConvexReactClient(url, { unsavedChangesWarning: false });
  return client;
}
