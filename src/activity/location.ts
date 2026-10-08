import * as Location from 'expo-location';
import type { Fix, Sport } from './types';
import { session } from './session';

/**
 * Web GPS (browser Geolocation through expo-location). Foreground only — a
 * browser tab can't track with the screen off — so the web app is for trying
 * the flow and the demo run; real recording is the iPhone/Android app.
 */
export const LOCATION_TASK = 'kasya-activity-location';

export type PermissionResult = 'granted' | 'denied' | 'services-off';

let sub: Location.LocationSubscription | null = null;

export async function ensureLocationPermission(): Promise<PermissionResult> {
  try {
    const req = await Location.requestForegroundPermissionsAsync();
    return req.granted ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

export async function startTracking(_sport: Sport): Promise<void> {
  if (sub) return;
  sub = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
    (loc) => session.ingest([toFix(loc)]),
  );
}

export async function stopTracking(): Promise<void> {
  sub?.remove();
  sub = null;
}

export async function isTracking(): Promise<boolean> {
  return !!sub;
}

export async function watchPreview(onFix: (f: Fix) => void): Promise<() => void> {
  try {
    const s = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
      (loc) => onFix(toFix(loc)),
    );
    return () => s.remove();
  } catch {
    return () => {};
  }
}

export function toFix(loc: Location.LocationObject): Fix {
  const c = loc.coords;
  return {
    t: loc.timestamp,
    lat: c.latitude,
    lon: c.longitude,
    alt: c.altitude ?? null,
    acc: c.accuracy ?? null,
    altAcc: c.altitudeAccuracy ?? null,
    speed: c.speed != null && c.speed >= 0 ? c.speed : null,
  };
}

export const backgroundCapable = false;
