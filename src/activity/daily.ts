import { localDayKey } from './days';

/**
 * Daily movement — steps, active minutes and active calories — scored out of
 * 1,000 against the user's own goals, plus the week strip and the Day / Week /
 * Month summaries the Activity dashboard shows. Pure (no RN), unit-tested.
 */

export interface DayMetrics {
  /** YYYY-MM-DD, local calendar */
  day: string;
  steps: number;
  /** minutes of brisk movement (watch exercise minutes, or estimated) */
  activeMin: number;
  /** active calories (not resting burn) */
  kcal: number;
  /** which numbers are estimates rather than watch / Health readings */
  est?: { kcal?: boolean; activeMin?: boolean };
}

export interface Goals {
  steps: number;
  activeMin: number;
  kcal: number;
  /** optional, only for heart-rate zones */
  age?: number | null;
}

export const DEFAULT_GOALS: Goals = { steps: 10000, activeMin: 30, kcal: 500, age: null };

/** [min, max, step] the goal editor allows. */
export const GOAL_LIMITS = {
  steps: [1000, 50000, 500],
  activeMin: [5, 300, 5],
  kcal: [50, 3000, 50],
  age: [13, 100, 1],
} as const;

export function clampGoals(g: Partial<Goals>): Goals {
  const fit = (v: unknown, [lo, hi, step]: readonly [number, number, number], fallback: number) => {
    const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
    return Math.min(hi, Math.max(lo, Math.round(n / step) * step));
  };
  const age = typeof g.age === 'number' && Number.isFinite(g.age) ? fit(g.age, GOAL_LIMITS.age, 30) : null;
  return {
    steps: fit(g.steps, GOAL_LIMITS.steps, DEFAULT_GOALS.steps),
    activeMin: fit(g.activeMin, GOAL_LIMITS.activeMin, DEFAULT_GOALS.activeMin),
    kcal: fit(g.kcal, GOAL_LIMITS.kcal, DEFAULT_GOALS.kcal),
    age,
  };
}

/** How the 1,000 points split: steps carry half, then active minutes, then calories. */
export const SCORE_WEIGHTS = { steps: 0.5, activeMin: 0.3, kcal: 0.2 } as const;

const part = (value: number, goal: number) => (goal > 0 && value > 0 ? Math.min(1, value / goal) : 0);

/**
 * 0–1000. Each metric earns its share of the points in proportion to its goal
 * and is capped at the goal, so one huge number can't hide a missing one.
 */
export function dailyScore(m: Pick<DayMetrics, 'steps' | 'activeMin' | 'kcal'>, g: Goals): number {
  const s =
    SCORE_WEIGHTS.steps * part(m.steps, g.steps) +
    SCORE_WEIGHTS.activeMin * part(m.activeMin, g.activeMin) +
    SCORE_WEIGHTS.kcal * part(m.kcal, g.kcal);
  return Math.round(1000 * s);
}

export type ScoreTier = 'excellent' | 'great' | 'good' | 'fair' | 'start';

export function scoreLabel(score: number): { label: string; tier: ScoreTier } {
  if (score >= 850) return { label: 'Excellent', tier: 'excellent' };
  if (score >= 650) return { label: 'Great', tier: 'great' };
  if (score >= 450) return { label: 'Good', tier: 'good' };
  if (score >= 200) return { label: 'Fair', tier: 'fair' };
  return { label: 'Getting started', tier: 'start' };
}

/** A day "counts" on the week strip when the step goal is reached. */
export const goalMet = (m: Pick<DayMetrics, 'steps'> | undefined, g: Goals) => !!m && m.steps >= g.steps;

/** Rough active calories from steps (~0.04 kcal per step for an average adult). */
export const estimateKcal = (steps: number) => Math.round(Math.max(0, steps) * 0.04);

/**
 * Rough brisk minutes when no watch measured them: steps beyond everyday
 * pottering (~4,000) at a brisk ~110 steps/min, never less than what the user
 * actually recorded in Kasya.
 */
export const estimateActiveMin = (steps: number, recordedMin = 0) =>
  Math.max(Math.round(recordedMin), Math.round(Math.max(0, steps - 4000) / 110));

export type Period = 'day' | 'week' | 'month';

const dayAt = (now: Date, offset: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);

/** Monday of the local week containing `now`. */
export function startOfWeekLocal(now: Date): Date {
  return dayAt(now, -((now.getDay() + 6) % 7));
}

/** Every local day of the period (week Mon–Sun, month 1st–last), future days included. */
export function periodDays(period: Period, now: Date): string[] {
  if (period === 'day') return [localDayKey(now)];
  if (period === 'week') {
    const mon = startOfWeekLocal(now);
    return Array.from({ length: 7 }, (_, i) => localDayKey(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i)));
  }
  const len = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return Array.from({ length: len }, (_, i) => localDayKey(new Date(now.getFullYear(), now.getMonth(), i + 1)));
}

export interface PeriodSummary {
  period: Period;
  /** days of the period up to today (no future days) */
  days: DayMetrics[];
  steps: number;
  activeMin: number;
  kcal: number;
  /** goal totals for the elapsed days */
  goalSteps: number;
  goalActiveMin: number;
  goalKcal: number;
  /** today's score for 'day', the average daily score otherwise */
  score: number;
  daysMet: number;
  elapsed: number;
  best: DayMetrics | null;
  estimated: boolean;
}

const empty = (day: string): DayMetrics => ({ day, steps: 0, activeMin: 0, kcal: 0 });

export function summarize(byDay: Map<string, DayMetrics>, period: Period, now: Date, g: Goals): PeriodSummary {
  const today = localDayKey(now);
  const keys = periodDays(period, now).filter((k) => k <= today);
  const days = keys.map((k) => byDay.get(k) ?? empty(k));
  const sum = (f: (d: DayMetrics) => number) => days.reduce((s, d) => s + f(d), 0);
  const scores = days.map((d) => dailyScore(d, g));
  const n = Math.max(1, days.length);
  return {
    period,
    days,
    steps: sum((d) => d.steps),
    activeMin: sum((d) => d.activeMin),
    kcal: sum((d) => d.kcal),
    goalSteps: g.steps * n,
    goalActiveMin: g.activeMin * n,
    goalKcal: g.kcal * n,
    score: Math.round(scores.reduce((s, v) => s + v, 0) / n),
    daysMet: days.filter((d) => goalMet(d, g)).length,
    elapsed: days.length,
    best: days.reduce<DayMetrics | null>((b, d) => (d.steps > (b?.steps ?? 0) ? d : b), null),
    estimated: days.some((d) => d.est?.kcal || d.est?.activeMin),
  };
}

export interface StripDay {
  day: string;
  /** M T W T F S S */
  letter: string;
  date: number;
  met: boolean;
  isToday: boolean;
  isFuture: boolean;
  score: number;
}

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** This week, Monday first, each day marked when its step goal was reached. */
export function weekStrip(byDay: Map<string, DayMetrics>, now: Date, g: Goals): StripDay[] {
  const today = localDayKey(now);
  return periodDays('week', now).map((day, i) => {
    const m = byDay.get(day);
    return {
      day,
      letter: LETTERS[i],
      date: Number(day.slice(8)),
      met: day <= today && goalMet(m, g),
      isToday: day === today,
      isFuture: day > today,
      score: m ? dailyScore(m, g) : 0,
    };
  });
}

/** Consecutive goal days ending today (or yesterday, if today isn't done yet). */
export function goalStreak(byDay: Map<string, DayMetrics>, now: Date, g: Goals): number {
  let streak = 0;
  let i = goalMet(byDay.get(localDayKey(now)), g) ? 0 : -1;
  for (; ; i--) {
    if (!goalMet(byDay.get(localDayKey(dayAt(now, i))), g)) break;
    streak++;
  }
  return streak;
}

export interface HrZone {
  zone: 1 | 2 | 3 | 4 | 5;
  name: string;
}

/** Heart-rate zone by % of an age-predicted max (220 − age). */
export function hrZone(bpm: number, age: number | null | undefined): HrZone | null {
  if (!age || !(bpm > 0)) return null;
  const pct = bpm / (220 - age);
  if (pct >= 0.9) return { zone: 5, name: 'Peak' };
  if (pct >= 0.8) return { zone: 4, name: 'Threshold' };
  if (pct >= 0.7) return { zone: 3, name: 'Cardio' };
  if (pct >= 0.6) return { zone: 2, name: 'Fat burn' };
  if (pct >= 0.5) return { zone: 1, name: 'Warm-up' };
  return null;
}
