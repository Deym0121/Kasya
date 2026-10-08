import * as Location from 'expo-location';
import type { Fix, Sport } from './types';
import { SPORT_LABEL } from './format';
import { colors } from '../theme';

/**
 * Native GPS for recording. Uses expo-location's background location task
 * (defined in locationTask.native.ts) so tracking continues with the screen
 * locked or the app in the background:
 *  - iOS: "While Using" permission + the `location` background mode + the blue
 *    status-bar indicator — the same pattern Strava uses; no "Always" prompt.
 *  - Android: a foreground service with a persistent notification, which
 *    needs only foreground location permission (no background-location
 *    declaration on Play).
 */
export const LOCATION_TASK = 'kasya-activity-location';

export type PermissionResult = 'granted' | 'denied' | 'services-off';

export async function ensureLocationPermission(): Promise<PermissionResult> {
  if (!(await Location.hasServicesEnabledAsync())) return 'services-off';
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) return 'granted';
  if (!current.canAskAgain) return 'denied';
  const req = await Location.requestForegroundPermissionsAsync();
  return req.granted ? 'granted' : 'denied';
}

/**
 * Start (or re-assert) background GPS. Calling it again for a running task is
 * safe and intentional: after Android killed the process, the restored task
 * has no foreground service until the app re-registers it from the foreground.
 */
export async function startTracking(sport: Sport): Promise<void> {
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    activityType: Location.ActivityType.Fitness,
    // every update (~1 Hz); the recorder's own distance gate handles jitter
    distanceInterval: 0,
    timeInterval: 1000,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: `Recording your ${SPORT_LABEL[sport].toLowerCase()}`,
      notificationBody: 'Open Kasya to pause or finish.',
      notificationColor: colors.accent,
      killServiceOnDestroy: false,
    },
  });
}

export async function stopTracking(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    }
  } catch {
    // already stopped
  }
}

export async function isTracking(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
}

/**
 * Foreground position preview before Start: centres the map and shows GPS
 * strength while the runner waits for a lock. Returns an unsubscribe.
 */
export async function watchPreview(onFix: (f: Fix) => void): Promise<() => void> {
  const sub = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
    (loc) => onFix(toFix(loc)),
  );
  return () => sub.remove();
}

export function toFix(loc: Location.LocationObject): Fix {
  const c = loc.coords;
  // Android fills 0.0 for values a fix doesn't have (hasSpeed/hasAltitude false);
  // iOS uses -1. Either way, non-positive accuracy means "unknown".
  const altAcc = c.altitudeAccuracy != null && c.altitudeAccuracy > 0 ? c.altitudeAccuracy : null;
  return {
    t: loc.timestamp,
    lat: c.latitude,
    lon: c.longitude,
    alt: c.altitude != null && (altAcc != null || c.altitude !== 0) ? c.altitude : null,
    acc: c.accuracy != null && c.accuracy > 0 ? c.accuracy : null,
    altAcc,
    speed: c.speed != null && c.speed > 0 ? c.speed : null,
  };
}

/** True when tracking can keep running with the screen off. */
export const backgroundCapable = true;
