import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { estimateActiveMin, estimateKcal, type DayMetrics } from './daily';
import { localDayKey } from './days';
import {
  healthAvailable,
  healthDailySteps,
  healthDailySums,
  healthHeartRateToday,
  healthRestingHeartRate,
  requestHealthAccess,
  type HeartRatePoint,
} from './health';
import { getHealthState } from './healthSync';
import { phoneStepsBetween } from './steps';
import { listActivities } from '../storage/activities';

/**
 * Where the dashboard's numbers come from:
 *  - 'health': Apple Health (watch + iPhone, merged without double counting) —
 *    real active calories and exercise minutes when a watch records them;
 *  - 'phone':  the iPhone's own pedometer (7 days of history, kept longer in a
 *    small on-device cache); calories and brisk minutes are estimates;
 *  - 'demo':   sample data on web previews, always labelled as such;
 *  - 'none':   nothing to read yet (Android without Health Connect).
 * Kasya recordings always add their moving minutes.
 */
export type DailySource = 'health' | 'phone' | 'demo' | 'none';

export interface DailyLoad {
  byDay: Map<string, DayMetrics>;
  source: DailySource;
  /** metres run + moving seconds per local day (club distance / pace) */
  runs: Map<string, RunDay>;
}

export interface RunDay {
  runM: number;
  runSec: number;
}

const CACHE_KEY = 'kasya:daily:steps:v1';
const TYPES_KEY = 'kasya:health:types:v2';
const HISTORY_DAYS = 62;

/** Ask Health once for the dashboard's newer types (calories, exercise minutes, resting HR). */
async function ensureHealthTypes() {
  try {
    if (await AsyncStorage.getItem(TYPES_KEY)) return;
    await requestHealthAccess();
    await AsyncStorage.setItem(TYPES_KEY, '1');
  } catch {}
}

/**
 * Kasya-recorded moving minutes per local day, and the day's runs (recorded
 * or imported from Apple Health — Garmin, COROS, Apple Watch). Demo runs and
 * implausible paces don't count toward club distance.
 */
async function recordedDays(): Promise<{ minutes: Map<string, number>; runs: Map<string, RunDay> }> {
  const minutes = new Map<string, number>();
  const runs = new Map<string, RunDay>();
  try {
    for (const a of await listActivities()) {
      const day = localDayKey(new Date(a.startedAt));
      minutes.set(day, (minutes.get(day) ?? 0) + a.movingSec / 60);
      if (a.sport !== 'run' || a.demo || a.distanceM < 200 || a.movingSec <= 0) continue;
      const pace = (a.movingSec / a.distanceM) * 1000;
      if (pace < 150 || pace > 1200) continue;
      const r = runs.get(day) ?? { runM: 0, runSec: 0 };
      runs.set(day, { runM: r.runM + a.distanceM, runSec: r.runSec + a.movingSec });
    }
  } catch {}
  return { minutes, runs };
}

const dayKeys = (days: number, now = new Date()) =>
  Array.from({ length: days }, (_, i) => localDayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1 - i))));

export async function loadDaily(): Promise<DailyLoad> {
  if (Platform.OS === 'web') return { byDay: demoDays(), source: 'demo', runs: new Map() };
  const { minutes: rec, runs } = await recordedDays();
  const state = await getHealthState().catch(() => null);

  if (Platform.OS === 'ios' && state?.connected && healthAvailable()) {
    await ensureHealthTypes();
    const [steps, kcal, ex] = await Promise.all([
      healthDailySteps(HISTORY_DAYS),
      healthDailySums('kcal', HISTORY_DAYS),
      healthDailySums('exerciseMin', HISTORY_DAYS),
    ]);
    if (steps.length) {
      const kcalBy = new Map(kcal.map((d) => [d.day, d.value]));
      const exBy = new Map(ex.map((d) => [d.day, d.value]));
      const byDay = new Map<string, DayMetrics>();
      for (const d of steps) {
        const hk = kcalBy.get(d.day) ?? 0;
        const hx = exBy.get(d.day) ?? 0;
        const recMin = rec.get(d.day) ?? 0;
        byDay.set(d.day, {
          day: d.day,
          steps: d.steps,
          kcal: hk > 0 ? hk : estimateKcal(d.steps),
          activeMin: hx > 0 ? Math.max(hx, Math.round(recMin)) : estimateActiveMin(d.steps, recMin),
          est: { kcal: !(hk > 0), activeMin: !(hx > 0) },
        });
      }
      return { byDay, source: 'health', runs };
    }
  }

  if (Platform.OS === 'ios') {
    // The pedometer only remembers a week: keep each day's count on the device
    // so the month view still has last week's numbers.
    let cache: Record<string, number> = {};
    try {
      cache = JSON.parse((await AsyncStorage.getItem(CACHE_KEY)) ?? '{}') ?? {};
    } catch {}
    const now = new Date();
    let read = false;
    for (let i = 6; i >= 0; i--) {
      const s = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const e = i === 0 ? now : new Date(s.getFullYear(), s.getMonth(), s.getDate() + 1);
      const n = await phoneStepsBetween(s, e);
      if (n == null) continue;
      read = true;
      cache[localDayKey(s)] = n;
    }
    if (read) {
      const keep = new Set(dayKeys(HISTORY_DAYS));
      const trimmed = Object.fromEntries(Object.entries(cache).filter(([k]) => keep.has(k)));
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(trimmed)).catch(() => {});
      const byDay = new Map<string, DayMetrics>();
      for (const [day, steps] of Object.entries(trimmed)) {
        const recMin = rec.get(day) ?? 0;
        byDay.set(day, { day, steps, kcal: estimateKcal(steps), activeMin: estimateActiveMin(steps, recMin), est: { kcal: true, activeMin: true } });
      }
      return { byDay, source: 'phone', runs };
    }
  }

  // Nothing to read steps from: still credit recorded activities.
  const byDay = new Map<string, DayMetrics>();
  for (const [day, min] of rec) byDay.set(day, { day, steps: 0, kcal: Math.round(min * 7), activeMin: Math.round(min), est: { kcal: true } });
  return { byDay, source: 'none', runs };
}

export interface HeartRateToday {
  points: HeartRatePoint[];
  latest: HeartRatePoint | null;
  min: number | null;
  max: number | null;
  avg: number | null;
  resting: number | null;
  demo: boolean;
}

export async function loadHeartRate(): Promise<HeartRateToday | null> {
  if (Platform.OS === 'web') return summarizeHr(demoHeartRate(), 58, true);
  if (Platform.OS !== 'ios' || !healthAvailable()) return null;
  const state = await getHealthState().catch(() => null);
  if (!state?.connected) return null;
  const [points, resting] = await Promise.all([healthHeartRateToday(), healthRestingHeartRate()]);
  return summarizeHr(points, resting, false);
}

export function summarizeHr(points: HeartRatePoint[], resting: number | null, demo: boolean): HeartRateToday {
  const bpms = points.map((p) => p.bpm);
  return {
    points,
    latest: points[points.length - 1] ?? null,
    min: bpms.length ? Math.min(...bpms) : null,
    max: bpms.length ? Math.max(...bpms) : null,
    avg: bpms.length ? Math.round(bpms.reduce((s, v) => s + v, 0) / bpms.length) : null,
    resting,
    demo,
  };
}

// ---- web preview sample data (deterministic, clearly labelled "Sample data") ----

function rand(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function demoDays(): Map<string, DayMetrics> {
  const now = new Date();
  const byDay = new Map<string, DayMetrics>();
  dayKeys(HISTORY_DAYS, now).forEach((day, i, all) => {
    const isToday = i === all.length - 1;
    const weekend = [0, 6].includes(new Date(day + 'T12:00:00').getDay());
    const base = 6500 + rand(i) * 7500 + (weekend ? 1500 : 0);
    const frac = isToday ? Math.min(1, (now.getHours() * 60 + now.getMinutes()) / (21 * 60)) : 1;
    const steps = Math.round(base * frac);
    byDay.set(day, {
      day,
      steps,
      kcal: Math.round(steps * (0.042 + rand(i + 99) * 0.012)),
      activeMin: Math.round(Math.max(0, steps - 3000) / (95 + rand(i + 7) * 30)),
    });
  });
  return byDay;
}

function demoHeartRate(): HeartRatePoint[] {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const out: HeartRatePoint[] = [];
  for (let t = start + 6.5 * 3600_000; t <= now.getTime(); t += 4 * 60_000) {
    const h = (t - start) / 3600_000;
    const run = h > 7 && h < 7.6 ? 70 * Math.sin(((h - 7) / 0.6) * Math.PI) : 0;
    const walk = h > 12.2 && h < 12.7 ? 22 : 0;
    out.push({ t, bpm: Math.round(64 + 8 * Math.sin(h * 1.7) + 5 * rand(t / 60000) + run + walk) });
  }
  return out;
}
