import { query, internalMutation } from './_generated/server';
import { v } from 'convex/values';
import type { Infer } from 'convex/values';
import { missingLinkFields, planCuratedReplace } from '../src/races/submission';

const WINDOW_PAST_DAYS = 90;
const WINDOW_AHEAD_MONTHS = 18;

/** ISO YYYY-MM-DD from a Date (UTC — server-side windowing only). */
function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Public race calendar: recent results window + everything announced up to
 * 18 months out, ordered by date. No auth — this is public calendar data.
 * Rows carry `source` ('community' = approved Pro submission) and an optional
 * `dateEnd`; older app builds simply ignore both.
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
// calls this internal mutation.
//
// Replace semantics apply to CURATED rows only. Community rows (approved Pro
// submissions) are never deleted here; when the routine sends the same race:
//  - same `id` (the routine round-tripped races:list) → the community row is
//    updated in place with the routine's freshly verified facts;
//  - same race under another id (similar name, date ±1 day) → the community
//    row is kept and only gains links it was missing; no duplicate insert.
// ---------------------------------------------------------------------------

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

type IngestEvent = Infer<typeof eventValidator>;

/** Drop undefined keys — db.patch treats `undefined` as "remove this field". */
function definedOnly(e: IngestEvent): Partial<IngestEvent> {
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(e)) if (val !== undefined) out[k] = val;
  return out as Partial<IngestEvent>;
}

export const replaceAll = internalMutation({
  args: { events: v.array(eventValidator) },
  handler: async (ctx, { events }) => {
    const existing = await ctx.db.query('raceEvents').collect();
    const plan = planCuratedReplace(existing, events);
    for (const row of plan.remove) await ctx.db.delete(row._id);
    const now = Date.now();
    for (const { row, event, match } of plan.merge) {
      if (match === 'same_id') {
        await ctx.db.patch(row._id, { ...definedOnly(event), source: 'community', updatedAt: now });
      } else {
        const fill = missingLinkFields(row, event);
        if (Object.keys(fill).length) await ctx.db.patch(row._id, { ...fill, updatedAt: now });
      }
    }
    for (const e of plan.insert) await ctx.db.insert('raceEvents', { ...e, source: 'curated', updatedAt: now });
    return {
      deleted: plan.remove.length,
      inserted: plan.insert.length,
      keptCommunity: existing.length - plan.remove.length,
      mergedIntoCommunity: plan.merge.length,
    };
  },
});
