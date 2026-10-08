import { previewOf } from './geo';
import { defaultName } from './format';
import { calibrateToTotals, pointsFromRoute } from './pack';
import { computeSplits } from './splits';
import { isDuplicateImport } from './finalize';
import type { ActivityRecord, ActivitySummary } from './types';
import type { HealthWorkout, HealthWorkoutHeader } from './health';

/** A watch workout from Apple Health → a Kasya activity (pure; unit-tested). */
export function workoutToRecord(w: HealthWorkout): ActivityRecord {
  const raw = pointsFromRoute(w.route);
  const routeDist = raw.length ? raw[raw.length - 1].d : 0;
  const distanceM = Math.round(w.distanceM ?? routeDist);
  const movingSec = Math.round(w.durationSec);
  const points = calibrateToTotals(raw, distanceM || null, movingSec || null);
  const elapsedSec = Math.max(movingSec, Math.round((w.endedAt.getTime() - w.startedAt.getTime()) / 1000));
  let elevGainM: number | null = null;
  if (points.some((p) => p.alt != null)) {
    // watch altitude is already barometer-fused — a small threshold is enough
    let gain = 0;
    let ref: number | null = null;
    for (const p of points) {
      if (p.alt == null) continue;
      if (ref == null) ref = p.alt;
      else if (p.alt - ref >= 2) {
        gain += p.alt - ref;
        ref = p.alt;
      } else if (ref - p.alt >= 2) ref = p.alt;
    }
    elevGainM = Math.round(gain);
  }
  const steps = w.sport !== 'ride' && w.steps && w.steps > 0 ? w.steps : null;
  const summary: ActivitySummary = {
    id: `hk_${w.externalId}`,
    sport: w.sport,
    name: defaultName(w.sport, w.startedAt),
    startedAt: w.startedAt.toISOString(),
    endedAt: w.endedAt.toISOString(),
    distanceM,
    movingSec,
    elapsedSec,
    elevGainM,
    steps,
    avgCadence: steps && movingSec > 0 ? Math.round(steps / (movingSec / 60)) : null,
    avgHr: w.avgHr,
    maxHr: w.maxHr,
    source: 'health',
    sourceName: w.sourceName,
    externalId: w.externalId,
    hasTrack: points.length > 1,
    preview: previewOf(points.map((p) => [p.lat, p.lon])),
  };
  return { summary, track: points.length > 1 ? { points, splits: computeSplits(points) } : null };
}

/**
 * Which incoming workouts to add: not deleted by the user before, not already
 * imported, and not the same session the phone recorded too. Also dedupes
 * within the incoming batch itself.
 */
export function selectNewImports<W extends HealthWorkoutHeader>(
  incoming: W[],
  existing: ActivitySummary[],
  ignoredIds: string[],
): W[] {
  const ignored = new Set(ignoredIds);
  const kept: ActivitySummary[] = existing.slice();
  const out: W[] = [];
  for (const w of incoming) {
    if (ignored.has(w.externalId)) continue;
    const probe = {
      externalId: w.externalId,
      sport: w.sport,
      startedAt: w.startedAt.toISOString(),
      endedAt: w.endedAt.toISOString(),
    };
    if (isDuplicateImport(probe, kept)) continue;
    out.push(w);
    kept.push({ ...probe, id: w.externalId } as ActivitySummary);
  }
  return out;
}
