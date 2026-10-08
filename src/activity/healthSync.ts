import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  healthAvailable,
  requestHealthAccess,
  listWorkouts,
  workoutDetails,
  healthDailySteps,
  healthStepsBetween,
  localDayKey,
} from './health';
import { workoutToRecord, selectNewImports } from './importer';
import { listActivities, listIgnoredImports, saveActivities, deleteActivity } from '../storage/activities';
import { phoneStepsBetween } from './steps';

/**
 * Apple Health connection state + incremental import of watch workouts.
 *
 * Sync is ANCHORED (HealthKit hands back exactly what was added or deleted
 * since last time), so a Garmin/COROS that syncs to the phone days late is
 * still picked up. Only headers are listed; the heavy details (route, heart
 * rate, steps) are fetched for genuinely new workouts, 10 at a time, each
 * batch saved as it lands — a kill mid-import loses at most one batch, and
 * the anchor only advances once everything is in.
 */
const KEY = 'kasya:health:v1';
const FIRST_LOOKBACK_DAYS = 90;
const BATCH = 10;
/** Apple Watch routes can land in Health after the workout — re-check this long */
const ROUTE_BACKFILL_DAYS = 7;

export interface HealthState {
  connected: boolean;
  /** ISO of the last completed sync */
  lastSyncAt: string | null;
  /** HealthKit anchor of the last completed sync */
  anchor: string | null;
  /** write Kasya recordings into Health */
  writeBack: boolean;
}

const DEFAULT: HealthState = { connected: false, lastSyncAt: null, anchor: null, writeBack: true };

export async function getHealthState(): Promise<HealthState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...DEFAULT, ...JSON.parse(raw) } : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

async function setHealthState(patch: Partial<HealthState>): Promise<HealthState> {
  const next = { ...(await getHealthState()), ...patch };
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export async function setWriteBack(on: boolean) {
  return setHealthState({ writeBack: on });
}

/** Ask for access, then pull history. Returns how many workouts were imported. */
export async function connectHealth(): Promise<{ ok: boolean; imported: number }> {
  if (!healthAvailable()) return { ok: false, imported: 0 };
  const ok = await requestHealthAccess();
  if (!ok) return { ok: false, imported: 0 };
  await setHealthState({ connected: true });
  const imported = await syncHealth().catch(() => 0);
  return { ok: true, imported };
}

export async function disconnectHealth(): Promise<void> {
  await setHealthState({ connected: false, lastSyncAt: null, anchor: null });
}

let inflight: Promise<number> | null = null;

/** Import new watch workouts. Safe to call on every screen focus (coalesced). */
export function syncHealth(): Promise<number> {
  if (!inflight) {
    inflight = runSync().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

function chunks<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

async function runSync(): Promise<number> {
  const state = await getHealthState();
  if (!state.connected || !healthAvailable()) return 0;
  const now = new Date();
  const since = new Date(now.getTime() - FIRST_LOOKBACK_DAYS * 86400_000);

  let listing;
  try {
    listing = await listWorkouts(state.anchor, since);
  } catch {
    // a stale/invalid anchor (e.g. Health data reset) — start over
    listing = await listWorkouts(null, since);
  }

  // Workouts deleted in Health disappear from Kasya too (imports only).
  const before = await listActivities();
  if (listing.deletedIds.length) {
    const gone = new Set(listing.deletedIds);
    for (const a of before) {
      if (a.source === 'health' && a.externalId && gone.has(a.externalId)) {
        await deleteActivity(a.id, { ignoreReimport: false });
      }
    }
  }

  const existing = await listActivities();
  const fresh = selectNewImports(listing.headers, existing, await listIgnoredImports());
  let imported = 0;
  for (const batch of chunks(fresh.map((h) => h.externalId), BATCH)) {
    const details = await workoutDetails(batch);
    await saveActivities(details.map(workoutToRecord));
    imported += details.length;
  }

  // Recent imports that arrived without a route: the watch may have written it since.
  const backfill = existing
    .filter(
      (a) =>
        a.source === 'health' &&
        !a.hasTrack &&
        a.externalId &&
        now.getTime() - Date.parse(a.endedAt) < ROUTE_BACKFILL_DAYS * 86400_000,
    )
    .map((a) => a.externalId!);
  for (const batch of chunks(backfill, BATCH)) {
    const details = (await workoutDetails(batch).catch(() => [])).filter((d) => d.route.length > 1);
    if (details.length) await saveActivities(details.map(workoutToRecord));
  }

  // Only advance the anchor once everything above landed — and never write
  // state back if the user disconnected while we were syncing.
  if ((await getHealthState()).connected) {
    await setHealthState({ lastSyncAt: now.toISOString(), anchor: listing.anchor });
  }
  return imported;
}

/** Steps for a time window: Health when connected (watch + phone merged), else the phone. */
export async function stepsBetween(start: Date, end: Date): Promise<number | null> {
  const state = await getHealthState();
  if (state.connected && healthAvailable()) {
    const s = await healthStepsBetween(start, end);
    if (s != null) return s;
  }
  return phoneStepsBetween(start, end);
}

/** Last 7 days of steps (oldest first), or null when no source is available. */
export async function weekOfSteps(): Promise<{ day: string; steps: number }[] | null> {
  const state = await getHealthState();
  if (state.connected && healthAvailable()) {
    const days = await healthDailySteps(7);
    if (days.length) return days;
  }
  const out: { day: string; steps: number }[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const s = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const e = i === 0 ? now : new Date(s.getFullYear(), s.getMonth(), s.getDate() + 1);
    const n = await phoneStepsBetween(s, e);
    if (n == null) return null;
    out.push({ day: localDayKey(s), steps: n });
  }
  return out;
}
