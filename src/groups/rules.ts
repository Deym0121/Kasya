import type { StepDay } from './types';

/**
 * Groups + leaderboards — pure rules shared by the Convex functions
 * (convex/groups.ts, convex/steps.ts) and the app. No React Native imports:
 * the Convex bundler and vitest both load this file.
 */

export const GROUP_LIMITS = {
  nameMin: 2,
  nameMax: 40,
  maxGroupsPerUser: 20,
  maxMembersPerGroup: 100,
  codeLength: 6,
  /** wrong invite codes allowed per user per hour (brute-force guard) */
  joinFailuresPerHour: 10,
  /** most days one steps.sync call may upsert */
  maxDaysPerSync: 62,
  /** widest leaderboard window (a month fits with room to spare) */
  maxRangeDays: 62,
  /** per-day rows older than this are pruned server-side; lifetime totals live in userStats */
  keepDays: 70,
} as const;

export const STEP_LIMITS = { steps: 150_000, activeMin: 1440, kcal: 20_000 } as const;

/** No 0/O, 1/I/L — codes get read aloud and typed from screenshots. */
export const INVITE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** A fresh invite code. `random` returns [0, 1) — crypto-backed on the server. */
export function makeInviteCode(random: () => number): string {
  let out = '';
  for (let i = 0; i < GROUP_LIMITS.codeLength; i++) {
    const r = random();
    const idx = Math.min(INVITE_ALPHABET.length - 1, Math.max(0, Math.floor(r * INVITE_ALPHABET.length)));
    out += INVITE_ALPHABET[idx];
  }
  return out;
}

/** Case-insensitive; ignores spaces and dashes. null unless it's a well-formed code. */
export function normalizeInviteCode(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.toUpperCase().replace(/[\s-]+/g, '');
  if (code.length !== GROUP_LIMITS.codeLength) return null;
  for (const ch of code) if (!INVITE_ALPHABET.includes(ch)) return null;
  return code;
}

const CONTROL = /[\u0000-\u001F\u007F]/g;

export type NameCheck = { ok: true; name: string } | { ok: false; message: string };

/** Trimmed, single-spaced, 2–40 characters. */
export function cleanGroupName(raw: string): NameCheck {
  const name = (typeof raw === 'string' ? raw : '').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  if (name.length < GROUP_LIMITS.nameMin) {
    return { ok: false, message: `Give the group a name (at least ${GROUP_LIMITS.nameMin} characters).` };
  }
  if (name.length > GROUP_LIMITS.nameMax) {
    return { ok: false, message: `Keep the name under ${GROUP_LIMITS.nameMax} characters.` };
  }
  return { ok: true, name };
}

/**
 * What other members see: the account's FIRST name only, else "Runner" + the
 * last 4 of the user id. Never an email (Password-provider accounts have no
 * name; anything that looks like an address is dropped).
 */
export function publicDisplayName(name: unknown, userId: string): string {
  const raw = typeof name === 'string' ? name.replace(CONTROL, ' ').trim() : '';
  const first = raw.split(/\s+/)[0] ?? '';
  if (first && !first.includes('@')) return first.slice(0, 20);
  return `Runner ${String(userId).slice(-4).toUpperCase()}`;
}

// --------------------------- day keys --------------------------------------

/** Strict YYYY-MM-DD that names a real calendar day. */
export function isDayKey(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function keyToUtcMs(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** The UTC calendar day of a timestamp (server-side window checks). */
export function utcDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** `key` shifted by `n` calendar days (calendar math, no DST drift). */
export function addDaysToKey(key: string, n: number): string {
  return utcDayKey(keyToUtcMs(key) + n * 86_400_000);
}

/** Number of days in [from, to] inclusive (0 when to < from). */
export function daysInRange(fromDay: string, toDay: string): number {
  const diff = Math.round((keyToUtcMs(toDay) - keyToUtcMs(fromDay)) / 86_400_000);
  return diff < 0 ? 0 : diff + 1;
}

/** A valid leaderboard window: real days, from ≤ to, at most maxRangeDays long. */
export function isValidRange(fromDay: unknown, toDay: unknown): boolean {
  if (!isDayKey(fromDay) || !isDayKey(toDay)) return false;
  const n = daysInRange(fromDay, toDay);
  return n >= 1 && n <= GROUP_LIMITS.maxRangeDays;
}

// --------------------------- step days -------------------------------------

function inRange(n: unknown, max: number): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= max;
}

/** A sane, rounded day of totals — or null (bad day key / out-of-range numbers). */
export function cleanStepDay(d: Partial<StepDay> | null | undefined): StepDay | null {
  if (!d || !isDayKey(d.day)) return null;
  if (!inRange(d.steps, STEP_LIMITS.steps)) return null;
  if (!inRange(d.activeMin, STEP_LIMITS.activeMin)) return null;
  if (!inRange(d.kcal, STEP_LIMITS.kcal)) return null;
  return { day: d.day, steps: Math.round(d.steps), activeMin: Math.round(d.activeMin), kcal: Math.round(d.kcal) };
}

/**
 * Client-side prep before upload: drop bad rows, one row per day (the last
 * one wins), oldest → newest, and only the most recent `max` days.
 */
export function prepareStepDays(days: readonly Partial<StepDay>[], max: number = GROUP_LIMITS.maxDaysPerSync): StepDay[] {
  const byDay = new Map<string, StepDay>();
  for (const d of Array.isArray(days) ? days : []) {
    const c = cleanStepDay(d);
    if (c) byDay.set(c.day, c);
  }
  const sorted = Array.from(byDay.values()).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  return max > 0 ? sorted.slice(-max) : [];
}

// --------------------------- ranking ---------------------------------------

export interface RankInput {
  userId: string;
  steps: number;
  activeMin: number;
  joinedAt: number;
}

/**
 * Leaderboard order: most steps; ties → more active minutes, then whoever
 * joined first (then id, so the order is always total). Ranks are 1..n.
 */
export function rankMembers<T extends RankInput>(rows: readonly T[]): (T & { rank: number })[] {
  return rows
    .slice()
    .sort(
      (a, b) =>
        b.steps - a.steps ||
        b.activeMin - a.activeMin ||
        a.joinedAt - b.joinedAt ||
        (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0),
    )
    .map((r, i) => ({ ...r, rank: i + 1 }));
}
