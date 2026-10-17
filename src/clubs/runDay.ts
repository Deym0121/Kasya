/**
 * Per-day run totals (no imports: groups/rules and clubs/rules both use it).
 * Generous caps + a plausibility window on pace.
 */
export const RUN_LIMITS = {
  runM: 150_000,
  runSec: 86_400,
  /** faster than 2:30 /km for a whole day of running isn't a run */
  minSecPerKm: 150,
  /** slower than 20:00 /km is a walk */
  maxSecPerKm: 1_200,
} as const;

/**
 * Plausible run totals for one day, or zeros. Both fields travel together:
 * a distance without a time (or an impossible pace) drops the pair.
 */
export function cleanRunDay(runM: unknown, runSec: unknown): { runM: number; runSec: number } {
  const m = typeof runM === 'number' && Number.isFinite(runM) ? Math.round(runM) : 0;
  const s = typeof runSec === 'number' && Number.isFinite(runSec) ? Math.round(runSec) : 0;
  if (m <= 0 || s <= 0 || m > RUN_LIMITS.runM || s > RUN_LIMITS.runSec) return { runM: 0, runSec: 0 };
  const pace = (s / m) * 1000;
  if (pace < RUN_LIMITS.minSecPerKm || pace > RUN_LIMITS.maxSecPerKm) return { runM: 0, runSec: 0 };
  return { runM: m, runSec: s };
}
