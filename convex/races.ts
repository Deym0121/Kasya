import { query } from './_generated/server';

const WINDOW_PAST_DAYS = 90;
const WINDOW_AHEAD_MONTHS = 18;

/** ISO YYYY-MM-DD from a Date (UTC — server-side windowing only). */
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Public race calendar: recent results window + everything announced up to
 * 18 months out, ordered by date. No auth — this is public calendar data.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const now = new Date();
    const past = new Date(now);
    past.setDate(past.getDate() - WINDOW_PAST_DAYS);
    const ahead = new Date(now);
    ahead.setMonth(ahead.getMonth() + WINDOW_AHEAD_MONTHS);
    const rows = await ctx.db
      .query('raceEvents')
      .withIndex('by_date', (q) => q.gte('dateStart', iso(past)).lte('dateStart', iso(ahead)))
      .collect();
    return rows
      .sort((a, b) => a.dateStart.localeCompare(b.dateStart))
      .map(({ _id, _creationTime, updatedAt, ...event }) => event);
  },
});
