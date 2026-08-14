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
let initFailed = false;

export function isCloudEnabled(): boolean {
  return !!url && !initFailed;
}

export function getConvex(): ConvexReactClient | null {
  if (!url || initFailed) return null;
  if (!client) {
    try {
      client = new ConvexReactClient(url, { unsavedChangesWarning: false });
    } catch (e) {
      // A broken runtime (e.g. a missing URL polyfill) must degrade to the
      // fully-local app, never take down the first render (black screen).
      initFailed = true;
      console.warn('[convex] client init failed — running local-only', e);
      return null;
    }
  }
  return client;
}
