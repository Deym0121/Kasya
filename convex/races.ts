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

// ---------------------------------------------------------------------------
// Ingest path for the weekly cloud refresh routine. The routine authenticates
// with RACES_INGEST_TOKEN (scoped secret — deliberately NOT the deploy key)
// against the /api/races/ingest HTTP action, which validates shape and then
// calls this internal mutation. Full-replace semantics, same as the local
// `npx convex import --replace` pipeline.
// ---------------------------------------------------------------------------
import { internalMutation } from './_generated/server';
import { v } from 'convex/values';

const eventValidator = v.object({
  id: v.string(),
  name: v.string(),
  country: v.string(),
  city: v.string(),
  dateStart: v.string(),
  distances: v.array(v.string()),
  major: v.boolean(),
  regUrl: v.optional(v.string()),
  officialUrl: v.optional(v.string()),
  resultsUrl: v.optional(v.string()),
  photosUrl: v.optional(v.string()),
  organizer: v.optional(v.string()),
  sourceUrl: v.string(),
});

export const replaceAll = internalMutation({
  args: { events: v.array(eventValidator) },
  handler: async (ctx, { events }) => {
    const existing = await ctx.db.query('raceEvents').collect();
    for (const row of existing) await ctx.db.delete(row._id);
    const now = Date.now();
    for (const e of events) await ctx.db.insert('raceEvents', { ...e, updatedAt: now });
    return { deleted: existing.length, inserted: events.length };
  },
});
