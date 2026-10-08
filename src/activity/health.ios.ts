import type * as HK from '@kingstinct/react-native-healthkit';
import type { ActivitySummary, ActivityTrack, Fix, Sport } from './types';
import type { HealthWorkout, HealthWorkoutHeader, WorkoutListing } from './health';
import { fillDays, localDayKey } from './days';

export type { HealthWorkout, HealthWorkoutHeader, WorkoutListing } from './health';
export { localDayKey, fillDays } from './days';

/**
 * Apple Health bridge (@kingstinct/react-native-healthkit). The native module
 * is required lazily: a module-scope require that throws (a build without the
 * pod) would take the whole app down at launch — the build-8 black screen.
 */
export const HEALTH_NAME = 'Apple Health';

let mod: typeof HK | null | undefined;
function hk(): typeof HK | null {
  if (mod === undefined) {
    try {
      mod = require('@kingstinct/react-native-healthkit') as typeof HK;
    } catch {
      mod = null;
    }
  }
  return mod;
}

function need(): typeof HK {
  const m = hk();
  if (!m) throw new Error('HealthKit unavailable');
  return m;
}

const OWN_BUNDLE = 'com.kasya.app';

// HKWorkoutActivityType raw values (stable Apple constants).
const HK_RUNNING = 37;
const HK_WALKING = 52;
const HK_HIKING = 24;
const HK_CYCLING = 13;

const TO_SPORT: Partial<Record<number, Sport>> = {
  [HK_RUNNING]: 'run',
  [HK_WALKING]: 'walk',
  [HK_HIKING]: 'hike',
  [HK_CYCLING]: 'ride',
};

const FROM_SPORT: Record<Sport, number> = { run: HK_RUNNING, walk: HK_WALKING, hike: HK_HIKING, ride: HK_CYCLING };

const WORKOUT = 'HKWorkoutTypeIdentifier' as const;
const ROUTE = 'HKWorkoutRouteTypeIdentifier' as const;
const DIST_FOOT = 'HKQuantityTypeIdentifierDistanceWalkingRunning' as const;
const DIST_BIKE = 'HKQuantityTypeIdentifierDistanceCycling' as const;

const READ = [
  WORKOUT,
  ROUTE,
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierHeartRate',
  DIST_FOOT,
  DIST_BIKE,
] as const;

const SHARE = [WORKOUT, ROUTE, DIST_FOOT, DIST_BIKE] as const;

/** Only the four sports Kasya shows — so yoga/strength never use up the query. */
const SPORT_FILTER = [HK_RUNNING, HK_WALKING, HK_HIKING, HK_CYCLING].map((t) => ({
  workoutActivityType: t as HK.WorkoutActivityType,
}));

export function healthAvailable(): boolean {
  try {
    return hk()?.isHealthDataAvailable() ?? false;
  } catch {
    return false;
  }
}

/**
 * Shows Apple's Health permission sheet. HealthKit never reveals whether READ
 * access was granted (privacy), so `true` only means the sheet completed.
 */
export async function requestHealthAccess(): Promise<boolean> {
  if (!healthAvailable()) return false;
  try {
    return await need().requestAuthorization({ toRead: [...READ], toShare: [...SHARE] });
  } catch {
    return false;
  }
}

type Proxy = Awaited<ReturnType<typeof HK.queryWorkoutSamples>>[number];

function header(w: Proxy): HealthWorkoutHeader | null {
  const sport = TO_SPORT[w.workoutActivityType];
  if (!sport) return null;
  // Kasya's own recordings are already in the app.
  if (w.sourceRevision?.source?.bundleIdentifier === OWN_BUNDLE) return null;
  const startedAt = new Date(w.startDate);
  const endedAt = new Date(w.endDate);
  return {
    externalId: w.uuid,
    sport,
    startedAt,
    endedAt,
    distanceM: w.totalDistance?.quantity ?? null,
    durationSec: w.duration?.quantity ?? (endedAt.getTime() - startedAt.getTime()) / 1000,
    sourceName: w.device?.name || w.sourceRevision?.source?.name || HEALTH_NAME,
  };
}

/**
 * New / changed / deleted workouts since `anchor` (all of the last `since`
 * window on the first call). Anchored, so a Garmin that syncs a week late
 * still gets picked up — a date-window sync would miss it forever. Headers
 * only: the heavy route/HR/steps are fetched later, for new ones only.
 */
export async function listWorkouts(anchor: string | null, since: Date): Promise<WorkoutListing> {
  const res = await need().queryWorkoutSamplesWithAnchor({
    limit: 0,
    anchor: anchor ?? undefined,
    filter: { date: { startDate: since }, OR: SPORT_FILTER },
  });
  const headers: HealthWorkoutHeader[] = [];
  for (const w of res.workouts) {
    const h = header(w as unknown as Proxy);
    if (h) headers.push(h);
    w.dispose?.();
  }
  return { headers, deletedIds: res.deletedSamples.map((d) => d.uuid), anchor: res.newAnchor || null };
}

/** Full details (route, heart rate, steps) for specific workouts. */
export async function workoutDetails(ids: string[]): Promise<HealthWorkout[]> {
  if (ids.length === 0) return [];
  const { queryWorkoutSamples, queryStatisticsForQuantity } = need();
  const workouts = await queryWorkoutSamples({ limit: 0, filter: { uuids: ids } });
  const out: HealthWorkout[] = [];
  for (const w of workouts) {
    const h = header(w);
    if (!h) {
      w.dispose?.();
      continue;
    }
    const filter = { date: { startDate: h.startedAt, endDate: h.endedAt } };

    // Apple Watch workouts carry their own HR statistics; other sources
    // (Garmin, COROS…) write HR samples separately — query the window then.
    let hr: Awaited<ReturnType<typeof queryStatisticsForQuantity>> | undefined;
    try {
      hr = await w.getStatistic('HKQuantityTypeIdentifierHeartRate', 'count/min');
    } catch {
      hr = undefined;
    }
    if (!hr?.averageQuantity) {
      try {
        hr = await queryStatisticsForQuantity('HKQuantityTypeIdentifierHeartRate', ['discreteAverage', 'discreteMax'], {
          filter,
          unit: 'count/min',
        });
      } catch {
        hr = undefined;
      }
    }

    let steps: number | null = null;
    if (h.sport !== 'ride') {
      try {
        const st = await queryStatisticsForQuantity('HKQuantityTypeIdentifierStepCount', ['cumulativeSum'], {
          filter,
          unit: 'count',
        });
        steps = st?.sumQuantity?.quantity != null ? Math.round(st.sumQuantity.quantity) : null;
      } catch {
        steps = null;
      }
    }

    let route: Fix[] = [];
    try {
      const routes = await w.getWorkoutRoutes();
      route = routes.flatMap((r) =>
        r.locations.map((l) => ({
          t: new Date(l.date).getTime(),
          lat: l.latitude,
          lon: l.longitude,
          alt: Number.isFinite(l.altitude) && l.verticalAccuracy > 0 ? l.altitude : null,
          acc: l.horizontalAccuracy > 0 ? l.horizontalAccuracy : null,
          altAcc: l.verticalAccuracy > 0 ? l.verticalAccuracy : null,
          speed: l.speed > 0 ? l.speed : null,
        })),
      );
    } catch {
      route = [];
    }

    out.push({
      ...h,
      avgHr: hr?.averageQuantity?.quantity != null ? Math.round(hr.averageQuantity.quantity) : null,
      maxHr: hr?.maximumQuantity?.quantity != null ? Math.round(hr.maximumQuantity.quantity) : null,
      steps,
      route,
    });
    w.dispose?.();
  }
  return out;
}

export async function healthStepsBetween(start: Date, end: Date): Promise<number | null> {
  try {
    const st = await need().queryStatisticsForQuantity('HKQuantityTypeIdentifierStepCount', ['cumulativeSum'], {
      filter: { date: { startDate: start, endDate: end } },
      unit: 'count',
    });
    return st?.sumQuantity?.quantity != null ? Math.round(st.sumQuantity.quantity) : null;
  } catch {
    return null;
  }
}

/**
 * Steps per day for the last `days` local days (today last). Health merges
 * iPhone + watch + other sources without double counting.
 */
export async function healthDailySteps(days: number): Promise<{ day: string; steps: number }[]> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
  try {
    const buckets = await need().queryStatisticsCollectionForQuantity(
      'HKQuantityTypeIdentifierStepCount',
      ['cumulativeSum'],
      start,
      { day: 1 },
      { filter: { date: { startDate: start, endDate: now } }, unit: 'count' },
    );
    const filled = buckets
      .filter((b) => b.startDate)
      .map((b) => ({ day: localDayKey(new Date(b.startDate!)), steps: Math.round(b.sumQuantity?.quantity ?? 0) }));
    // a day with no samples has no bucket at all — fill zeros so bars line up
    return fillDays(filled, days, now);
  } catch {
    return [];
  }
}

/** Write a finished Kasya activity (and its route) into Apple Health. */
export async function saveWorkoutToHealth(s: ActivitySummary, track: ActivityTrack | null): Promise<boolean> {
  if (!healthAvailable()) return false;
  const start = new Date(s.startedAt);
  const end = new Date(s.endedAt);
  try {
    const { saveWorkoutSample, saveQuantitySample } = need();
    const workout = await saveWorkoutSample(
      FROM_SPORT[s.sport] as HK.WorkoutActivityType,
      [],
      start,
      end,
      { distance: s.distanceM },
      { HKExternalUUID: s.id },
    );
    if (track && track.points.length > 1) {
      await workout
        .saveWorkoutRoute(
          track.points.map((p, i, arr) => {
            const prev = arr[i - 1];
            const dt = prev ? (p.t - prev.t) / 1000 : 0;
            return {
              latitude: p.lat,
              longitude: p.lon,
              altitude: p.alt ?? 0,
              date: new Date(p.t),
              horizontalAccuracy: 5,
              verticalAccuracy: p.alt == null ? -1 : 10,
              course: -1,
              speed: prev && dt > 0 ? (p.d - prev.d) / dt : -1,
            };
          }),
        )
        .catch(() => false);
    }
    // A separate distance sample so the activity counts toward Health's daily
    // walking/running or cycling distance (the workout's own total doesn't).
    // Saved on its own: if the user withheld that permission, the workout and
    // route above still stand.
    await saveQuantitySample(s.sport === 'ride' ? DIST_BIKE : DIST_FOOT, 'm', s.distanceM, start, end, {
      HKExternalUUID: s.id,
    }).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}
