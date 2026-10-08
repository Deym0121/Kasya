import type { ActivitySummary, ActivityTrack, Fix, Sport } from './types';

/**
 * Health-store bridge (Apple Health on iOS — health.ios.ts). This default
 * build is for web and Android, where it reports "unavailable": Android's
 * Health Connect bridge ships with the Android release.
 *
 * Every watch that syncs to the phone's health store reaches Kasya through
 * here — Apple Watch natively; Garmin, COROS, Polar, Suunto, Samsung, Amazfit
 * and others through their own companion apps' Apple Health sync.
 */

/** The cheap part of a workout — enough to decide whether it's new. */
export interface HealthWorkoutHeader {
  externalId: string;
  sport: Sport;
  startedAt: Date;
  endedAt: Date;
  distanceM: number | null;
  durationSec: number;
  /** e.g. "Apple Watch", "Connect" (Garmin), "COROS" */
  sourceName: string;
}

/** A workout with its expensive details (route, heart rate, steps). */
export interface HealthWorkout extends HealthWorkoutHeader {
  avgHr: number | null;
  maxHr: number | null;
  steps: number | null;
  route: Fix[];
}

export interface WorkoutListing {
  headers: HealthWorkoutHeader[];
  /** Health UUIDs deleted since the anchor */
  deletedIds: string[];
  /** pass back next time to get only what changed */
  anchor: string | null;
}

export const HEALTH_NAME = 'Health';

export function healthAvailable(): boolean {
  return false;
}

export async function requestHealthAccess(): Promise<boolean> {
  return false;
}

export async function listWorkouts(_anchor: string | null, _since: Date): Promise<WorkoutListing> {
  return { headers: [], deletedIds: [], anchor: null };
}

export async function workoutDetails(_ids: string[]): Promise<HealthWorkout[]> {
  return [];
}

export async function healthStepsBetween(_start: Date, _end: Date): Promise<number | null> {
  return null;
}

export async function healthDailySteps(_days: number): Promise<{ day: string; steps: number }[]> {
  return [];
}

export async function saveWorkoutToHealth(_s: ActivitySummary, _t: ActivityTrack | null): Promise<boolean> {
  return false;
}

export { localDayKey, fillDays } from './days';
