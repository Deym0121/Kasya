/** Local-calendar day helpers shared by the Health bridges (pure). */

/** YYYY-MM-DD in LOCAL time (toISOString would give yesterday east of UTC). */
export function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * The last `days` local days (oldest first) filled from sparse buckets —
 * Health returns no bucket at all for a day without steps, which would shift
 * every bar (and show yesterday as "today" before your first step).
 */
export function fillDays(buckets: { day: string; steps: number }[], days: number, now: Date): { day: string; steps: number }[] {
  const by = new Map(buckets.map((b) => [b.day, b.steps]));
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1 - i));
    const key = localDayKey(d);
    return { day: key, steps: by.get(key) ?? 0 };
  });
}
