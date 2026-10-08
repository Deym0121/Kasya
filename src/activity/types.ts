/**
 * Activity tracking core types (GPS run / walk / ride / hike recording plus
 * workouts imported from a watch through Apple Health). Pure data — no React
 * Native imports — so everything under src/activity/ that isn't a screen,
 * map or platform bridge is unit-testable in node.
 */

export type Sport = 'run' | 'walk' | 'ride' | 'hike';

export const SPORTS: Sport[] = ['run', 'walk', 'ride', 'hike'];

/** One raw location fix as delivered by the OS (expo-location shape, flattened). */
export interface Fix {
  /** epoch ms */
  t: number;
  lat: number;
  lon: number;
  /** metres above sea level, null when the OS gave none */
  alt: number | null;
  /** horizontal accuracy radius in metres (lower is better); null = unknown */
  acc: number | null;
  /** vertical accuracy in metres; null = unknown */
  altAcc?: number | null;
  /** OS-reported speed m/s; null/negative = unknown */
  speed?: number | null;
}

/** An accepted, smoothed point on the recorded track. */
export interface TrackPoint {
  /** epoch ms */
  t: number;
  lat: number;
  lon: number;
  /** smoothed altitude (m), null when unknown */
  alt: number | null;
  /** cumulative moving distance (m) at this point */
  d: number;
  /** cumulative moving time (s) at this point */
  mt: number;
  /** segment index — bumps after every pause so the map never bridges a gap */
  seg: number;
}

export interface Split {
  /** 1-based km number */
  index: number;
  /** metres covered in this split (1000 except possibly the last) */
  distanceM: number;
  /** moving seconds spent in this split */
  movingSec: number;
  /** seconds per km for this split */
  paceSecPerKm: number;
  /** net elevation change across the split (m), null when unknown */
  elevDeltaM: number | null;
}

export type ActivitySource = 'kasya' | 'health';

/** The light row kept in the activity index (lists, weekly totals). */
export interface ActivitySummary {
  id: string;
  sport: Sport;
  name: string;
  /** ISO */
  startedAt: string;
  /** ISO */
  endedAt: string;
  distanceM: number;
  movingSec: number;
  elapsedSec: number;
  elevGainM: number | null;
  steps: number | null;
  /** steps per minute over moving time */
  avgCadence: number | null;
  avgHr: number | null;
  maxHr: number | null;
  source: ActivitySource;
  /** e.g. "Apple Watch", "Garmin Connect", "COROS" — imported workouts only */
  sourceName?: string;
  /** HealthKit UUID of an imported workout (re-import dedupe key) */
  externalId?: string;
  hasTrack: boolean;
  /** recorded with the demo run (simulated GPS) — labelled, like demo scans */
  demo?: boolean;
  /** the runner's own note ("felt strong, humid") */
  notes?: string;
  /** ~48 simplified [lat, lon] pairs for list thumbnails */
  preview: [number, number][];
}

/** The heavy part, stored per activity outside the index. */
export interface ActivityTrack {
  points: TrackPoint[];
  splits: Split[];
}

export interface ActivityRecord {
  summary: ActivitySummary;
  track: ActivityTrack | null;
}
