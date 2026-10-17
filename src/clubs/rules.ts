import { GROUP_LIMITS, cleanGroupName } from '../groups/rules';
import type { StepDay } from '../groups/types';
export { RUN_LIMITS, cleanRunDay } from './runDay';

/**
 * Running clubs — pure rules shared by convex/clubs.ts, convex/steps.ts and
 * the app. A club is a group (same members, invite code and member
 * leaderboard) that also has a public face: photo or emblem, home country,
 * monthly club-vs-club rankings by steps, run distance and run pace.
 * No React Native imports: the Convex bundler and vitest load this file.
 */

export const CLUB_LIMITS = {
  nameMin: GROUP_LIMITS.nameMin,
  nameMax: GROUP_LIMITS.nameMax,
  aboutMax: 160,
  cityMax: 40,
  /** clubs one runner can be a member of (each sync updates every club's totals) */
  maxClubsPerUser: 5,
  /** clubs one runner can own */
  maxOwnedClubs: 2,
  maxMembersPerClub: 300,
  /** monthly club goal, km */
  goalKmMax: 100_000,
  /** club photos: JPEG/PNG/WebP/HEIC up to this size */
  photoMaxBytes: 3_000_000,
  /** distinct reports that hide a club from public lists until reviewed */
  reportsToHide: 3,
  reportsPerDay: 10,
  reportNoteMax: 200,
  /** rows in one rankings page */
  rankingSize: 50,
  /** rank positions counted past the page ("1000+") */
  rankCountCap: 1000,
  /** a club needs this much running in the month to be ranked on pace */
  minClubRunMForPace: 20_000,
  /** a member needs this much running in the range to be ranked on pace */
  minMemberRunMForPace: 5_000,
  searchSize: 20,
} as const;

/** Sort key for clubs without a pace (sorts after every real pace). */
export const NO_PACE = 1e9;

export type ClubMetric = 'steps' | 'distance' | 'pace';
export const CLUB_METRICS: readonly ClubMetric[] = ['steps', 'distance', 'pace'];

export const REPORT_REASONS = ['inappropriate', 'spam', 'impersonation', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

// --------------------------- text ------------------------------------------

/**
 * A small first-line filter for public club text (names, about, city), in
 * English and Filipino. Reports + review are the real moderation; this only
 * stops the obvious. Short words match whole words only — "tanga" must not
 * block "Batangas", "puta" must not block "reputation".
 */
const BLOCK_ANYWHERE = [
  'fuck',
  'motherf',
  'nigger',
  'nigga',
  'faggot',
  'putangina',
  'tangina',
  'kantot',
  'jakol',
  'pakyu',
  'hindot',
  'pokpok',
  'porn',
];
const BLOCK_WORDS = new Set([
  'shit',
  'bitch',
  'cunt',
  'retard',
  'sex',
  'xxx',
  'nude',
  'nudes',
  'rape',
  'nazi',
  'hitler',
  'puta',
  'gago',
  'gaga',
  'tanga',
  'bobo',
  'ulol',
  'tarantado',
  'titi',
  'tite',
  'puke',
  'pekpek',
  'burat',
  'bayag',
  'leche',
  'bilat',
  'kupal',
]);

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's' };

export function isBlockedText(raw: string): boolean {
  const s = raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[013457@$]/g, (ch) => LEET[ch] ?? ch);
  const squashed = s.replace(/[^a-z]/g, '');
  if (BLOCK_ANYWHERE.some((w) => squashed.includes(w))) return true;
  return s.split(/[^a-z]+/).some((w) => BLOCK_WORDS.has(w));
}

const CONTROL = /[\u0000-\u001F\u007F]/g;
const tidy = (raw: unknown) => (typeof raw === 'string' ? raw : '').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();

export type TextCheck = { ok: true; value: string } | { ok: false; message: string };

export function cleanClubName(raw: unknown): TextCheck {
  const base = cleanGroupName(typeof raw === 'string' ? raw : '');
  if (!base.ok) return { ok: false, message: base.message.replace('the group', 'the club') };
  if (isBlockedText(base.name)) return { ok: false, message: 'Please choose a different club name.' };
  return { ok: true, value: base.name };
}

/** Optional club text (about, city): '' is allowed. */
export function cleanClubText(raw: unknown, max: number, what: string): TextCheck {
  const value = tidy(raw);
  if (value.length > max) return { ok: false, message: `Keep the ${what} under ${max} characters.` };
  if (value && isBlockedText(value)) return { ok: false, message: `Please reword the ${what}.` };
  return { ok: true, value };
}

export function cleanGoalKm(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(CLUB_LIMITS.goalKmMax, Math.round(n));
}

// --------------------------- emblems ---------------------------------------

/** Club avatar when there's no photo: a MaterialCommunityIcons glyph on a color. */
export const EMBLEM_ICONS = [
  'run-fast',
  'shoe-sneaker',
  'lightning-bolt',
  'fire',
  'image-filter-hdr',
  'trophy-variant',
  'star-four-points',
  'heart-pulse',
  'flag-checkered',
  'weather-sunset-up',
  'waves',
  'paw',
] as const;
export type EmblemIcon = (typeof EMBLEM_ICONS)[number];

export const EMBLEM_COLORS = [
  '#FF4D0D',
  '#FFA24C',
  '#F2C14E',
  '#2FBF8F',
  '#2BB3C0',
  '#4C8DFF',
  '#8B6CFF',
  '#E85A9B',
  '#C9CED6',
] as const;

export interface Emblem {
  icon: EmblemIcon;
  color: string;
}

export const DEFAULT_EMBLEM: Emblem = { icon: 'run-fast', color: EMBLEM_COLORS[0] };

export function emblemKey(e: Emblem): string {
  return `${e.icon}|${e.color}`;
}

export function parseEmblem(key: unknown): Emblem | null {
  if (typeof key !== 'string') return null;
  const [icon, color] = key.split('|');
  if (!(EMBLEM_ICONS as readonly string[]).includes(icon)) return null;
  if (!(EMBLEM_COLORS as readonly string[]).includes(color)) return null;
  return { icon: icon as EmblemIcon, color };
}

// --------------------------- months ----------------------------------------

/** 'YYYY-MM' with a real month. */
export function isMonthKey(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function monthOfDay(day: string): string {
  return day.slice(0, 7);
}

export function utcMonthKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 7);
}

/** The local calendar month of a date (what the app asks for). */
export function localMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function addMonths(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return t.toISOString().slice(0, 7);
}

/** Months the rankings serve: the last two years up to next month (time zones). */
export function isServableMonth(key: unknown, nowMs: number): key is string {
  if (!isMonthKey(key)) return false;
  const now = utcMonthKey(nowMs);
  return key >= addMonths(now, -24) && key <= addMonths(now, 1);
}

// --------------------------- run totals ------------------------------------

export interface MonthTotals {
  steps: number;
  activeMin: number;
  runM: number;
  runSec: number;
}

export const ZERO_TOTALS: MonthTotals = { steps: 0, activeMin: 0, runM: 0, runSec: 0 };

export function addTotals(a: MonthTotals, b: MonthTotals, sign: 1 | -1 = 1): MonthTotals {
  return {
    steps: Math.max(0, a.steps + sign * b.steps),
    activeMin: Math.max(0, a.activeMin + sign * b.activeMin),
    runM: Math.max(0, a.runM + sign * b.runM),
    runSec: Math.max(0, a.runSec + sign * b.runSec),
  };
}

export function isZeroTotals(t: MonthTotals): boolean {
  return t.steps === 0 && t.activeMin === 0 && t.runM === 0 && t.runSec === 0;
}

/** Difference new − old (may be negative; for applying deltas). */
export function diffTotals(next: MonthTotals, prev: MonthTotals): MonthTotals {
  return {
    steps: next.steps - prev.steps,
    activeMin: next.activeMin - prev.activeMin,
    runM: next.runM - prev.runM,
    runSec: next.runSec - prev.runSec,
  };
}

/** Same as addTotals but without the floor — deltas pass through unchanged. */
export function sumDelta(a: MonthTotals, b: MonthTotals): MonthTotals {
  return { steps: a.steps + b.steps, activeMin: a.activeMin + b.activeMin, runM: a.runM + b.runM, runSec: a.runSec + b.runSec };
}

export function dayTotals(d: Pick<StepDay, 'steps' | 'activeMin'> & { runM?: number; runSec?: number }): MonthTotals {
  return { steps: d.steps, activeMin: d.activeMin, runM: d.runM ?? 0, runSec: d.runSec ?? 0 };
}

/** Seconds per km, or null without running. */
export function paceSecPerKm(runM: number, runSec: number): number | null {
  if (!(runM > 0) || !(runSec > 0)) return null;
  return Math.round((runSec / runM) * 1000);
}

/** The club ranking key for pace: real pace once the club ran enough, else NO_PACE. */
export function clubPaceKey(runM: number, runSec: number): number {
  if (runM < CLUB_LIMITS.minClubRunMForPace) return NO_PACE;
  return paceSecPerKm(runM, runSec) ?? NO_PACE;
}

/** "5:42" for 342 s/km. */
export function formatPace(secPerKm: number | null): string {
  if (secPerKm === null || !Number.isFinite(secPerKm) || secPerKm >= NO_PACE) return '—';
  const s = Math.round(secPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "1,234.5" km under 1,000 km, whole km above. */
export function formatKm(m: number): string {
  const km = m / 1000;
  return km >= 1000
    ? Math.round(km).toLocaleString('en-US')
    : km.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

// --------------------------- ranking ---------------------------------------

export interface MemberMetricRow {
  userId: string;
  steps: number;
  activeMin: number;
  runM: number;
  runSec: number;
  joinedAt: number;
}

/**
 * Member leaderboard order for a metric. Steps: most steps. Distance: most
 * run km. Pace: fastest average pace among members who ran at least
 * minMemberRunMForPace — everyone else follows by distance with rank null.
 * Ties fall back to steps, then join order, then id (always total).
 */
export function rankMembersBy<T extends MemberMetricRow>(
  rows: readonly T[],
  metric: ClubMetric,
): (T & { rank: number | null })[] {
  const tie = (a: T, b: T) =>
    b.steps - a.steps || b.activeMin - a.activeMin || a.joinedAt - b.joinedAt || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0);
  if (metric === 'steps') return rows.slice().sort(tie).map((r, i) => ({ ...r, rank: i + 1 }));
  if (metric === 'distance') return rows.slice().sort((a, b) => b.runM - a.runM || tie(a, b)).map((r, i) => ({ ...r, rank: i + 1 }));
  const eligible = rows.filter((r) => r.runM >= CLUB_LIMITS.minMemberRunMForPace && r.runSec > 0);
  const rest = rows.filter((r) => !eligible.includes(r));
  const pace = (r: T) => r.runSec / r.runM;
  return [
    ...eligible.sort((a, b) => pace(a) - pace(b) || b.runM - a.runM || tie(a, b)).map((r, i) => ({ ...r, rank: i + 1 as number | null })),
    ...rest.sort((a, b) => b.runM - a.runM || tie(a, b)).map((r) => ({ ...r, rank: null })),
  ];
}

/** "3.41M", "512K", "9,800" — club totals on narrow rows. */
export function compactCount(n: number): string {
  const v = Math.round(n);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v >= 10_000_000 ? 1 : 2)}M`;
  if (v >= 100_000) return `${Math.round(v / 1000)}K`;
  return v.toLocaleString('en-US');
}

/** The value a metric shows, formatted for a row ("12,345", "42.1", "5:42"). */
export function metricValue(
  metric: ClubMetric,
  t: { steps: number; runM: number; runSec: number },
  compact = false,
): string {
  if (metric === 'steps') return compact ? compactCount(t.steps) : Math.round(t.steps).toLocaleString('en-US');
  if (metric === 'distance') return formatKm(t.runM);
  return formatPace(paceSecPerKm(t.runM, t.runSec));
}

export const METRIC_UNIT: Record<ClubMetric, string> = { steps: 'steps', distance: 'km run', pace: '/km pace' };
export const METRIC_LABEL: Record<ClubMetric, string> = { steps: 'Steps', distance: 'Distance', pace: 'Pace' };
