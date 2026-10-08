/**
 * Free-plan gait scan allowance: a rolling 7-day window. Demo/simulated scans
 * (camera unavailable) never count — nobody should be locked out by a
 * fallback they didn't choose.
 */
export const FREE_SCANS_PER_WEEK = 3;
const WEEK_MS = 7 * 86400_000;

export function freeScansLeft(
  reports: { createdAt: string; simulated?: boolean }[],
  now: Date,
  limit = FREE_SCANS_PER_WEEK,
): { left: number; nextFreeAt: Date | null } {
  const since = now.getTime() - WEEK_MS;
  const recent = reports
    .filter((r) => !r.simulated)
    .map((r) => Date.parse(r.createdAt))
    .filter((t) => Number.isFinite(t) && t > since && t <= now.getTime())
    .sort((a, b) => a - b);
  const left = Math.max(0, limit - recent.length);
  // when used up, a slot frees exactly a week after the oldest counted scan
  const nextFreeAt = left === 0 && recent.length ? new Date(recent[recent.length - limit] + WEEK_MS) : null;
  return { left, nextFreeAt };
}
