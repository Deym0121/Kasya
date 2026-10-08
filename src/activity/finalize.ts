import { previewOf } from './geo';
import { defaultName, countsSteps } from './format';
import { computeSplits } from './splits';
import type { Recorder } from './recorder';
import type { ActivityRecord, ActivitySummary, Sport, TrackPoint } from './types';

/** A finished recording shorter than this isn't worth saving (accidental taps). */
export const MIN_SAVE_DISTANCE_M = 50;

export function newActivityId(now = Date.now()): string {
  return `act_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Turn a finished Recorder into the saved record (summary + track). Steps come
 * from the pedometer (or Health) for the activity window — they're optional.
 */
export function finalizeRecording(
  rec: Recorder,
  opts: { endedAt: number; steps?: number | null; name?: string; id?: string },
): ActivityRecord {
  const points = rec.points;
  const splits = computeSplits(points);
  const coords = points.map((p) => [p.lat, p.lon] as [number, number]);
  const steps = countsSteps(rec.sport) && opts.steps != null && opts.steps > 0 ? Math.round(opts.steps) : null;
  const movingSec = Math.round(rec.movingSec);
  const summary: ActivitySummary = {
    id: opts.id ?? newActivityId(rec.startedAt),
    sport: rec.sport,
    name: opts.name?.trim() || defaultName(rec.sport, new Date(rec.startedAt)),
    startedAt: new Date(rec.startedAt).toISOString(),
    endedAt: new Date(opts.endedAt).toISOString(),
    // 0.1 m precision so the saved total truncates to the same km the live screen showed
    distanceM: Math.round(rec.distanceM * 10) / 10,
    movingSec,
    elapsedSec: Math.max(movingSec, Math.round((opts.endedAt - rec.startedAt) / 1000)),
    elevGainM: points.some((p) => p.alt != null) ? Math.round(rec.elevGainM) : null,
    steps,
    avgCadence: steps && movingSec > 0 ? Math.round(steps / (movingSec / 60)) : null,
    avgHr: null,
    maxHr: null,
    source: 'kasya',
    hasTrack: points.length > 1,
    preview: previewOf(coords),
  };
  return { summary, track: points.length > 1 ? { points, splits } : null };
}

/** Totals for a set of activities (weekly card, profile stats). */
export function totals(list: ActivitySummary[]) {
  let distanceM = 0;
  let movingSec = 0;
  let elevGainM = 0;
  for (const a of list) {
    distanceM += a.distanceM;
    movingSec += a.movingSec;
    elevGainM += a.elevGainM ?? 0;
  }
  return { count: list.length, distanceM, movingSec, elevGainM };
}

/** Monday 00:00 local of the week containing `d`. */
export function startOfWeek(d: Date): Date {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (s.getDay() + 6) % 7; // Mon=0 … Sun=6
  s.setDate(s.getDate() - dow);
  return s;
}

export function inThisWeek(a: ActivitySummary, now: Date): boolean {
  return new Date(a.startedAt) >= startOfWeek(now);
}

/** Distance per weekday (Mon..Sun) for the current week, in metres. */
export function weekDays(list: ActivitySummary[], now: Date, sport?: Sport): number[] {
  const start = calendarDay(startOfWeek(now));
  const days = [0, 0, 0, 0, 0, 0, 0];
  for (const a of list) {
    if (sport && a.sport !== sport) continue;
    // bucket by LOCAL calendar day — dividing elapsed ms by 24 h breaks on DST weeks
    const idx = calendarDay(new Date(a.startedAt)) - start;
    if (idx >= 0 && idx < 7) days[idx] += a.distanceM;
  }
  return days;
}

/** Days since the epoch for a date's local calendar day (DST-proof). */
function calendarDay(d: Date): number {
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

/**
 * Should an imported watch workout be skipped because the same session is
 * already in the list? Matches on the Health UUID, or on the same sport family
 * overlapping by at least 60% of the LONGER one — i.e. both cover nearly the
 * same time (you recorded on the phone AND the watch). Measuring against the
 * shorter one would let a 10-minute walk swallow a 2-hour marathon.
 */
export function isDuplicateImport(
  incoming: { externalId?: string; sport: Sport; startedAt: string; endedAt: string },
  existing: ActivitySummary[],
): boolean {
  const s = Date.parse(incoming.startedAt);
  const e = Date.parse(incoming.endedAt);
  for (const a of existing) {
    if (incoming.externalId && a.externalId === incoming.externalId) return true;
    if (family(a.sport) !== family(incoming.sport)) continue;
    const as = Date.parse(a.startedAt);
    const ae = Date.parse(a.endedAt);
    const overlap = Math.min(e, ae) - Math.max(s, as);
    const longer = Math.max(e - s, ae - as);
    if (longer > 0 && overlap / longer >= 0.6) return true;
  }
  return false;
}

const family = (s: Sport) => (s === 'ride' ? 'ride' : 'foot');

/**
 * Time windows [startMs, endMs] actually recorded — one per segment, so steps
 * taken while manually paused aren't counted. The first window starts at the
 * Start tap (before the first fix); `liveEnd` extends the last window to "now"
 * while still recording.
 */
export function segmentWindows(points: TrackPoint[], startedAt: number, liveEnd: number | null): [number, number][] {
  if (points.length === 0) return liveEnd != null && liveEnd - startedAt >= 1000 ? [[startedAt, liveEnd]] : [];
  const out: [number, number][] = [];
  let seg = points[0].seg;
  let s = startedAt;
  let e = points[0].t;
  for (const p of points) {
    if (p.seg !== seg) {
      out.push([s, e]);
      seg = p.seg;
      s = p.t;
    }
    e = p.t;
  }
  out.push([s, liveEnd != null ? Math.max(e, liveEnd) : e]);
  return out.filter(([a, b]) => b - a >= 1000);
}

/** Sum a per-window step reader over windows; null if any window is unreadable. */
export async function stepsOver(
  windows: [number, number][],
  read: (start: Date, end: Date) => Promise<number | null>,
): Promise<number | null> {
  if (windows.length === 0) return null;
  let total = 0;
  for (const [a, b] of windows) {
    const n = await read(new Date(a), new Date(b)).catch(() => null);
    if (n == null) return null;
    total += n;
  }
  return total;
}
