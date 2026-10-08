import type { Split, TrackPoint } from './types';

/**
 * Per-km splits from a recorded track. Each km boundary is located by linear
 * interpolation between the two points that straddle it, so split times don't
 * depend on where the GPS happened to sample. A trailing partial km is kept
 * (pace normalised to s/km) once it is at least `minTailM` long.
 */
export function computeSplits(points: TrackPoint[], minTailM = 50, splitM = 1000): Split[] {
  if (points.length < 2) return [];
  const out: Split[] = [];
  let prevD = points[0].d;
  let prevT = points[0].mt;
  let prevAlt = points[0].alt;
  let next = splitM * (Math.floor(points[0].d / splitM) + 1);

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    while (b.d >= next && b.d > a.d) {
      const u = (next - a.d) / (b.d - a.d);
      const t = a.mt + u * (b.mt - a.mt);
      const alt = a.alt != null && b.alt != null ? a.alt + u * (b.alt - a.alt) : null;
      const movingSec = t - prevT;
      out.push({
        index: out.length + 1,
        distanceM: splitM,
        movingSec,
        paceSecPerKm: movingSec > 0 ? movingSec / (splitM / 1000) : 0,
        elevDeltaM: alt != null && prevAlt != null ? round1(alt - prevAlt) : null,
      });
      prevD = next;
      prevT = t;
      prevAlt = alt;
      next += splitM;
    }
  }

  const last = points[points.length - 1];
  const tail = last.d - prevD;
  // A tail with no moving time (pure auto-pause bridge distance) has no pace.
  if (tail >= minTailM && last.mt - prevT >= 1) {
    const movingSec = last.mt - prevT;
    out.push({
      index: out.length + 1,
      distanceM: tail,
      movingSec,
      paceSecPerKm: movingSec / (tail / 1000),
      elevDeltaM: last.alt != null && prevAlt != null ? round1(last.alt - prevAlt) : null,
    });
  }
  return out;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Fastest full split, if any — used to highlight the best km. */
export function fastestSplitIndex(splits: Split[]): number | null {
  let best: Split | null = null;
  for (const s of splits) {
    if (s.distanceM < 999 || !(s.paceSecPerKm > 0) || !Number.isFinite(s.paceSecPerKm)) continue;
    if (!best || s.paceSecPerKm < best.paceSecPerKm) best = s;
  }
  return best ? best.index : null;
}

/**
 * Evenly-spaced series for the pace / elevation charts: one sample every
 * `stepM` metres of moving distance (pace from a rolling window, so a single
 * GPS wobble doesn't spike the line).
 */
export function seriesByDistance(
  points: TrackPoint[],
  stepM = 100,
  paceWindowM = 300,
): { d: number; pace: number | null; alt: number | null }[] {
  if (points.length < 2) return [];
  const total = points[points.length - 1].d;
  if (total < stepM) return [];
  const out: { d: number; pace: number | null; alt: number | null }[] = [];
  const at = (target: number, j: { i: number }) => {
    while (j.i < points.length - 2 && points[j.i + 1].d < target) j.i++;
    const a = points[j.i];
    const b = points[j.i + 1];
    const u = b.d > a.d ? Math.min(1, Math.max(0, (target - a.d) / (b.d - a.d))) : 0;
    return {
      mt: a.mt + u * (b.mt - a.mt),
      alt: a.alt != null && b.alt != null ? a.alt + u * (b.alt - a.alt) : (a.alt ?? b.alt),
    };
  };
  const head = { i: 0 };
  const back = { i: 0 };
  for (let d = stepM; d <= total; d += stepM) {
    const here = at(d, head);
    const from = Math.max(0, d - paceWindowM);
    const there = at(from, back);
    const span = d - from;
    const dt = here.mt - there.mt;
    out.push({ d, pace: span > 0 && dt > 0 ? dt / (span / 1000) : null, alt: here.alt });
  }
  return out;
}
