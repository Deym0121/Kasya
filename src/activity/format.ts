import type { Sport } from './types';

/**
 * "5.02" — kilometres with 2 decimals (1 decimal from 100 km up), truncated
 * like Strava: you haven't run 5.00 km until you have, and the live screen
 * and the saved (rounded-metre) activity never disagree by a hundredth.
 */
export function formatKm(metres: number): string {
  const m = Math.max(0, metres) + 1e-6;
  return m >= 100_000 ? (Math.floor(m / 100) / 10).toFixed(1) : (Math.floor(m / 10) / 100).toFixed(2);
}

/** "32:05" under an hour, "1:02:03" from an hour up. */
export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

/** Seconds per km → "5:32". Unknown / absurd paces render as "–:––". */
export function formatPace(secPerKm: number | null | undefined): string {
  if (secPerKm == null || !Number.isFinite(secPerKm) || secPerKm <= 0 || secPerKm >= 60 * 60) return '–:––';
  const s = Math.round(secPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Average pace (s/km) from distance + moving time; null until there's a usable distance. */
export function paceOf(distanceM: number, movingSec: number): number | null {
  if (distanceM < 10 || movingSec <= 0) return null;
  return movingSec / (distanceM / 1000);
}

/** km/h with one decimal, "0.0" when unknown. */
export function formatSpeed(distanceM: number, movingSec: number): string {
  if (movingSec <= 0) return '0.0';
  return ((distanceM / movingSec) * 3.6).toFixed(1);
}

/** Rides show speed; foot sports show pace — Strava's convention. */
export const usesSpeed = (sport: Sport) => sport === 'ride';

/** Foot sports count steps; a pedometer on a bike just counts noise. */
export const countsSteps = (sport: Sport) => sport !== 'ride';

export const SPORT_LABEL: Record<Sport, string> = {
  run: 'Run',
  walk: 'Walk',
  ride: 'Ride',
  hike: 'Hike',
};

/** Feather icon per sport. */
export const SPORT_ICON: Record<Sport, 'zap' | 'navigation' | 'disc' | 'triangle'> = {
  run: 'zap',
  walk: 'navigation',
  ride: 'disc',
  hike: 'triangle',
};

/** "Morning Run", "Evening Ride" … from the local start hour. */
export function defaultName(sport: Sport, start: Date): string {
  const h = start.getHours();
  const part = h < 5 ? 'Night' : h < 12 ? 'Morning' : h < 14 ? 'Lunch' : h < 18 ? 'Afternoon' : h < 22 ? 'Evening' : 'Night';
  return `${part} ${SPORT_LABEL[sport]}`;
}
