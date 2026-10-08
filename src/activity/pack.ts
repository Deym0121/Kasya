import { haversine } from './geo';
import { computeSplits } from './splits';
import type { ActivityTrack, Fix, TrackPoint } from './types';
import type { RecorderEvent } from './recorder';

/**
 * Compact (de)serialisers. Tracks and the live recording log are stored as
 * arrays-of-arrays with rounded numbers: ~60 bytes a point instead of ~150,
 * which matters for a 4-hour ride and for Android's AsyncStorage size cap.
 */

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const r1 = (v: number) => Math.round(v * 10) / 10;

type PackedPoint = [number, number, number, number | null, number, number, number];

export interface PackedTrack {
  v: 1;
  /** [t, lat, lon, alt, d, mt, seg] */
  p: PackedPoint[];
}

export function packTrack(track: ActivityTrack): PackedTrack {
  return {
    v: 1,
    p: track.points.map((q) => [q.t, r6(q.lat), r6(q.lon), q.alt == null ? null : r1(q.alt), r1(q.d), r1(q.mt), q.seg]),
  };
}

/** Splits are recomputed on load — cheap, and old tracks pick up split fixes. */
export function unpackTrack(raw: unknown): ActivityTrack | null {
  const pk = raw as PackedTrack | null;
  if (!pk || pk.v !== 1 || !Array.isArray(pk.p)) return null;
  const points: TrackPoint[] = [];
  for (const a of pk.p) {
    if (!Array.isArray(a) || a.length < 7) continue;
    const [t, lat, lon, alt, d, mt, seg] = a;
    if (![t, lat, lon, d, mt, seg].every((n) => typeof n === 'number' && Number.isFinite(n))) continue;
    points.push({ t, lat, lon, alt: typeof alt === 'number' ? alt : null, d, mt, seg });
  }
  return { points, splits: computeSplits(points) };
}

/** Recording log entries: 0 = fix, 1 = pause, 2 = resume. */
export type PackedEvent =
  | [0, number, number, number, number | null, number | null, number | null, number | null]
  | [1, number]
  | [2, number];

export function packEvent(ev: RecorderEvent): PackedEvent {
  if (ev.kind === 'pause') return [1, ev.t];
  if (ev.kind === 'resume') return [2, ev.t];
  const f = ev.fix;
  return [
    0,
    f.t,
    r6(f.lat),
    r6(f.lon),
    f.alt == null ? null : r1(f.alt),
    f.acc == null ? null : r1(f.acc),
    f.altAcc == null ? null : r1(f.altAcc),
    f.speed == null ? null : Math.round(f.speed * 100) / 100,
  ];
}

/**
 * The live session feeds the recorder the QUANTISED event (pack → unpack), so
 * replaying the stored log after a crash reproduces the recording exactly —
 * rounding can't nudge a filter or distance-gate decision the other way.
 */
export function quantize(ev: RecorderEvent): RecorderEvent {
  return unpackEvent(packEvent(ev)) ?? ev;
}

export function unpackEvent(a: unknown): RecorderEvent | null {
  if (!Array.isArray(a) || typeof a[1] !== 'number') return null;
  if (a[0] === 1) return { kind: 'pause', t: a[1] };
  if (a[0] === 2) return { kind: 'resume', t: a[1] };
  if (a[0] !== 0 || typeof a[2] !== 'number' || typeof a[3] !== 'number') return null;
  const num = (v: unknown) => (typeof v === 'number' ? v : null);
  return { kind: 'fix', fix: { t: a[1], lat: a[2], lon: a[3], alt: num(a[4]), acc: num(a[5]), altAcc: num(a[6]), speed: num(a[7]) } };
}

/**
 * Track points from a route recorded by another device (a watch workout from
 * Apple Health). Those routes are already filtered by the watch, so we only
 * thin near-duplicates and treat long, slow gaps as stops — the watch's own
 * totals stay the source of truth for the summary numbers.
 */
export function pointsFromRoute(fixes: Fix[], minStepM = 3): TrackPoint[] {
  const sorted = fixes
    .filter((f) => Number.isFinite(f.lat) && Number.isFinite(f.lon) && Number.isFinite(f.t))
    .sort((a, b) => a.t - b.t);
  const out: TrackPoint[] = [];
  let d = 0;
  let mt = 0;
  let seg = 0;
  for (const f of sorted) {
    const prev = out[out.length - 1];
    if (!prev) {
      out.push({ t: f.t, lat: f.lat, lon: f.lon, alt: f.alt, d: 0, mt: 0, seg });
      continue;
    }
    const step = haversine(prev.lat, prev.lon, f.lat, f.lon);
    const dt = (f.t - prev.t) / 1000;
    if (dt <= 0) continue;
    if (dt > 120) {
      // a long hole (paused workout / signal loss): new segment, no bridging
      seg += 1;
      out.push({ t: f.t, lat: f.lat, lon: f.lon, alt: f.alt, d, mt, seg });
      continue;
    }
    if (step < minStepM) continue;
    d += step;
    mt += dt;
    out.push({ t: f.t, lat: f.lat, lon: f.lon, alt: f.alt, d, mt, seg });
  }
  return out;
}

/**
 * Rescale a route's cumulative distance/time so its splits agree with the
 * watch's own totals (the watch fuses GPS + accelerometer and knows better).
 */
export function calibrateToTotals(points: TrackPoint[], distanceM: number | null, movingSec: number | null): TrackPoint[] {
  if (points.length < 2) return points;
  const last = points[points.length - 1];
  const kd = distanceM && last.d > 0 ? distanceM / last.d : 1;
  const kt = movingSec && last.mt > 0 ? movingSec / last.mt : 1;
  // Only trust the totals when they're in the same ballpark as the route.
  const sd = kd > 0.8 && kd < 1.25 ? kd : 1;
  const st = kt > 0.8 && kt < 1.25 ? kt : 1;
  if (sd === 1 && st === 1) return points;
  return points.map((p) => ({ ...p, d: p.d * sd, mt: p.mt * st }));
}
