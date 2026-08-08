import { Platform } from 'react-native';

/**
 * Holds the ONE opt-in review clip from the most recent capture — in memory only,
 * never persisted to storage and never uploaded. Web keeps an object URL; native
 * keeps a temp file path. Whoever shows it (the Review screen) clears it on the
 * way out, so the clip is deleted right after the review.
 */
interface Pending {
  uri: string;
  native: boolean;
  /** the report this clip belongs to (stamped once the report id exists) */
  reportId?: string;
}
let pending: Pending | null = null;

async function dispose(p: Pending): Promise<void> {
  if (!p) return;
  if (!p.native) {
    try {
      URL.revokeObjectURL(p.uri);
    } catch {
      // already gone
    }
    return;
  }
  try {
    // SDK 56: deleteAsync is legacy-only; the File class is the current API.
    const { File } = await import('expo-file-system');
    new File(p.uri).delete();
  } catch (e) {
    console.warn('[videoHolder] could not delete temp clip', e);
  }
}

/** Stash the just-recorded clip. Disposes any previous clip first. */
export function setPendingVideo(uri: string): void {
  if (pending) dispose(pending);
  // VisionCamera hands over a bare path (/private/var/…) — expo-video and
  // expo-file-system both want a proper file:// URI, so normalize here.
  const native = Platform.OS !== 'web';
  const normalized = native && !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(uri) ? `file://${uri}` : uri;
  pending = { uri: normalized, native };
}

/** Stamp the pending clip with the report it belongs to (called once the id exists). */
export function tagPendingVideo(reportId: string): void {
  if (pending) pending.reportId = reportId;
}

/** The clip for THIS report, or null — so old scans never show a stale clip. */
export function peekPendingVideo(reportId: string): string | null {
  return pending && pending.reportId === reportId ? pending.uri : null;
}

/**
 * Delete the clip (revoke URL / remove temp file) and forget it. With no
 * argument, clears unconditionally (capture screens purge stale clips this
 * way). With `ownerId`, only clears when the clip is tagged to that report —
 * an untagged clip or someone else's clip is left alone.
 */
export function clearPendingVideo(ownerId?: string): void {
  if (!pending) return;
  if (ownerId !== undefined && pending.reportId !== ownerId) return;
  dispose(pending);
  pending = null;
}
