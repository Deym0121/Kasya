import { localDayKey } from '../activity/days';

/**
 * Levels, medals and leaderboard windows (pure — vitest-tested).
 *
 * Level n needs 25,000·(n−1)² lifetime steps: L2 at 25k, L3 at 100k,
 * L4 at 225k, L5 at 400k … a gently rising curve (each level asks a little
 * more than the last), capped at 99.
 */

export const LEVEL_STEP_UNIT = 25_000;
export const MAX_LEVEL = 99;

/** Lifetime steps needed to reach `level` (1 → 0). */
export function stepsForLevel(level: number): number {
  const n = Math.min(MAX_LEVEL, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)));
  return LEVEL_STEP_UNIT * (n - 1) * (n - 1);
}

export interface LevelInfo {
  level: number;
  /** lifetime steps where this level started */
  current: number;
  /** lifetime steps for the next level (= current at the cap) */
  next: number;
  /** 0..1 through this level */
  progress: number;
  /** steps still needed for the next level (0 at the cap) */
  toNext: number;
}

export function levelForSteps(lifetimeSteps: number): LevelInfo {
  const s = Number.isFinite(lifetimeSteps) && lifetimeSteps > 0 ? lifetimeSteps : 0;
  let level = Math.min(MAX_LEVEL, Math.floor(Math.sqrt(s / LEVEL_STEP_UNIT)) + 1);
  // sqrt rounding guard — thresholds are exact integers
  while (level < MAX_LEVEL && stepsForLevel(level + 1) <= s) level++;
  while (level > 1 && stepsForLevel(level) > s) level--;
  const current = stepsForLevel(level);
  if (level >= MAX_LEVEL) return { level: MAX_LEVEL, current, next: current, progress: 1, toNext: 0 };
  const next = stepsForLevel(level + 1);
  return {
    level,
    current,
    next,
    progress: Math.min(1, Math.max(0, (s - current) / (next - current))),
    toNext: Math.max(0, Math.ceil(next - s)),
  };
}

/** A name for the level band — shown next to the number. */
export function levelTitle(level: number): string {
  if (level >= 25) return 'Legend';
  if (level >= 17) return 'Marathoner';
  if (level >= 12) return 'Road Runner';
  if (level >= 8) return 'Pacer';
  if (level >= 5) return 'Strider';
  if (level >= 3) return 'Walker';
  return 'Rookie';
}

export type Medal = 'gold' | 'silver' | 'bronze';

/** Top three get a medal; everyone else races for one. */
export function rankBadge(rank: number): Medal | null {
  if (rank === 1) return 'gold';
  if (rank === 2) return 'silver';
  if (rank === 3) return 'bronze';
  return null;
}

export interface DayRange {
  fromDay: string;
  toDay: string;
}

/** This Monday → this Sunday, as LOCAL day keys. */
export function weekRange(now: Date): DayRange {
  const sinceMonday = (now.getDay() + 6) % 7;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - sinceMonday);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  return { fromDay: localDayKey(monday), toDay: localDayKey(sunday) };
}

/** The 1st → the last day of this month, as LOCAL day keys. */
export function monthRange(now: Date): DayRange {
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { fromDay: localDayKey(first), toDay: localDayKey(last) };
}

/** 1234567 → "1,234,567" — Intl-free (Hermes builds may lack locale data). */
export function formatCount(n: number): string {
  const v = Math.round(Number.isFinite(n) ? n : 0);
  const sign = v < 0 ? '-' : '';
  return sign + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct 13 – Oct 19" for a range of day keys. */
export function formatRange({ fromDay, toDay }: DayRange): string {
  const fmt = (key: string) => {
    const [, m, d] = key.split('-').map(Number);
    return `${MONTHS[(m - 1 + 12) % 12]} ${d}`;
  };
  return `${fmt(fromDay)} – ${fmt(toDay)}`;
}
