import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { getAuthUserId } from '@convex-dev/auth/server';
import { isCountryCode } from '../src/clubs/countries';
import {
  CLUB_LIMITS as C,
  DEFAULT_EMBLEM,
  NO_PACE,
  REPORT_REASONS,
  cleanClubName,
  cleanClubText,
  cleanGoalKm,
  emblemKey,
  isServableMonth,
  parseEmblem,
  type ClubMetric,
} from '../src/clubs/rules';
import { GROUP_LIMITS } from '../src/groups/rules';
import { isAdminEmail, parseAdminEmails } from '../src/races/submission';
import {
  addMembership,
  clubCount,
  clubFace,
  displayNameFor,
  fail,
  membershipOf,
  membershipsOf,
  uniqueInviteCode,
  type ClubFace,
  type GroupFail,
} from './groups';
import { addMemberToClub, clubMonthOf, isClub, syncClubMonthsMeta } from './clubStats';

/**
 * Running clubs: groups with a public face, ranked against each other.
 *
 *   create / update / setPhoto ─▶ owner-managed club page (name, photo or
 *                                 emblem, country, city, about, goal, open)
 *   joinOpen ─▶ join an open club from its page (invite codes: groups.join)
 *   rankings ─▶ monthly club leaderboard, by country or worldwide, on
 *               steps, run distance or run pace (clubMonths, see clubStats.ts)
 *   profile / search ─▶ the public club page and club search
 *   report ─▶ 3 distinct reports hide a club from rankings + search until an
 *             admin reviews it (adminReported / adminReview, ADMIN_EMAILS)
 *
 * Membership, the member leaderboard, leave/remove/rename and deletion are
 * the shared group functions in groups.ts. Public views show club-level
 * aggregates only; member names and per-person totals stay members-only.
 * Expected failures are RETURNED (production redacts throws).
 */

type Ctx = QueryCtx | MutationCtx;
const DAY_MS = 86_400_000;
/** an uploaded photo must be attached within this window */
const UPLOAD_FRESH_MS = 3_600_000;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

async function ownedClub(
  ctx: MutationCtx,
  clubId: Id<'groups'>,
): Promise<{ userId: Id<'users'>; club: Doc<'groups'> } | GroupFail> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return fail('signed_out', 'Sign in to manage your club.');
  const club = await ctx.db.get(clubId);
  if (!isClub(club)) return fail('not_found', 'That club no longer exists.');
  if (club.ownerId !== userId) return fail('not_owner', 'Only the club owner can do that.');
  return { userId, club };
}

async function isAdmin(ctx: Ctx): Promise<boolean> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return false;
  const user = await ctx.db.get(userId);
  const email = (user as { email?: string } | null)?.email ?? null;
  return isAdminEmail(email, parseAdminEmails(process.env.ADMIN_EMAILS));
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export type CreateClubResult = { ok: true; clubId: Id<'groups'>; code: string } | GroupFail;

export const create = mutation({
  args: {
    name: v.string(),
    country: v.string(),
    city: v.optional(v.string()),
    about: v.optional(v.string()),
    emblem: v.optional(v.string()),
    open: v.optional(v.boolean()),
    goalKm: v.optional(v.number()),
  },
  handler: async (ctx, a): Promise<CreateClubResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return fail('signed_out', 'Sign in to start a club.');
    const name = cleanClubName(a.name);
    if (!name.ok) return fail('invalid', name.message);
    if (!isCountryCode(a.country)) return fail('invalid', 'Pick the club’s country.');
    const city = cleanClubText(a.city, C.cityMax, 'city');
    if (!city.ok) return fail('invalid', city.message);
    const about = cleanClubText(a.about, C.aboutMax, 'description');
    if (!about.ok) return fail('invalid', about.message);

    const mine = await membershipsOf(ctx, userId);
    if (mine.length >= GROUP_LIMITS.maxGroupsPerUser) {
      return fail('too_many_groups', `You’re in ${GROUP_LIMITS.maxGroupsPerUser} clubs and groups already — leave one to start a club.`);
    }
    if ((await clubCount(ctx, mine)) >= C.maxClubsPerUser) {
      return fail('too_many_groups', `You’re in ${C.maxClubsPerUser} clubs already — leave one to start another.`);
    }
    const owned = await ctx.db
      .query('groups')
      .withIndex('by_owner', (q) => q.eq('ownerId', userId))
      .collect();
    if (owned.filter((g) => isClub(g)).length >= C.maxOwnedClubs) {
      return fail('too_many_groups', `You already run ${C.maxOwnedClubs} clubs — that’s the most one runner can start.`);
    }

    const code = await uniqueInviteCode(ctx);
    if (!code) return fail('busy', 'Couldn’t create the club just now — try again.');
    const now = Date.now();
    const clubId = await ctx.db.insert('groups', {
      name: name.value,
      ownerId: userId,
      code,
      createdAt: now,
      kind: 'club',
      country: a.country,
      city: city.value || undefined,
      about: about.value || undefined,
      emblem: emblemKey(parseEmblem(a.emblem) ?? DEFAULT_EMBLEM),
      open: a.open ?? true,
      goalKm: cleanGoalKm(a.goalKm) ?? undefined,
      memberCount: 1,
      hidden: false,
      reportCount: 0,
    });
    await ctx.db.insert('groupMembers', {
      groupId: clubId,
      userId,
      displayName: await displayNameFor(ctx, userId),
      joinedAt: now,
      role: 'owner',
    });
    const club = await ctx.db.get(clubId);
    if (club) await addMemberToClub(ctx, club, userId, now);
    return { ok: true, clubId, code };
  },
});

export type ClubActionResult = { ok: true } | GroupFail;

/** Owner only: change any of the club page fields (omitted = unchanged; goalKm null clears it). */
export const update = mutation({
  args: {
    clubId: v.id('groups'),
    name: v.optional(v.string()),
    country: v.optional(v.string()),
    city: v.optional(v.string()),
    about: v.optional(v.string()),
    emblem: v.optional(v.string()),
    open: v.optional(v.boolean()),
    goalKm: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, a): Promise<ClubActionResult> => {
    const owned = await ownedClub(ctx, a.clubId);
    if ('ok' in owned) return owned;
    const patch: Partial<Doc<'groups'>> = {};
    if (a.name !== undefined) {
      const name = cleanClubName(a.name);
      if (!name.ok) return fail('invalid', name.message);
      patch.name = name.value;
    }
    if (a.country !== undefined) {
      if (!isCountryCode(a.country)) return fail('invalid', 'Pick the club’s country.');
      patch.country = a.country;
    }
    if (a.city !== undefined) {
      const city = cleanClubText(a.city, C.cityMax, 'city');
      if (!city.ok) return fail('invalid', city.message);
      patch.city = city.value || undefined;
    }
    if (a.about !== undefined) {
      const about = cleanClubText(a.about, C.aboutMax, 'description');
      if (!about.ok) return fail('invalid', about.message);
      patch.about = about.value || undefined;
    }
    if (a.emblem !== undefined) {
      const emblem = parseEmblem(a.emblem);
      if (!emblem) return fail('invalid', 'Pick one of the emblems.');
      patch.emblem = emblemKey(emblem);
    }
    if (a.open !== undefined) patch.open = a.open;
    if (a.goalKm !== undefined) patch.goalKm = cleanGoalKm(a.goalKm) ?? undefined;
    await ctx.db.patch(a.clubId, patch);
    if (patch.country !== undefined && patch.country !== owned.club.country) {
      await syncClubMonthsMeta(ctx, { ...owned.club, ...patch });
    }
    return { ok: true };
  },
});

/** Owner only: a one-time URL to POST the new club photo to. */
export const photoUploadUrl = mutation({
  args: { clubId: v.id('groups') },
  handler: async (ctx, { clubId }): Promise<{ ok: true; url: string } | GroupFail> => {
    const owned = await ownedClub(ctx, clubId);
    if ('ok' in owned) return owned;
    return { ok: true, url: await ctx.storage.generateUploadUrl() };
  },
});

/** Owner only: attach a just-uploaded image as the club photo (replaces the old one). */
export const setPhoto = mutation({
  args: { clubId: v.id('groups'), storageId: v.id('_storage') },
  handler: async (ctx, { clubId, storageId }): Promise<ClubActionResult> => {
    const owned = await ownedClub(ctx, clubId);
    if ('ok' in owned) return owned;
    const meta = await ctx.db.system.get(storageId);
    if (!meta) return fail('not_found', 'The photo didn’t finish uploading — try again.');
    const inUse = await ctx.db
      .query('groups')
      .withIndex('by_photo', (q) => q.eq('photoId', storageId))
      .first();
    if (inUse) return inUse._id === clubId ? { ok: true } : fail('invalid', 'Pick a photo from your phone.');
    const fresh = Date.now() - meta._creationTime < UPLOAD_FRESH_MS;
    const okType = !!meta.contentType && PHOTO_TYPES.includes(meta.contentType.toLowerCase());
    if (!fresh || !okType || meta.size > C.photoMaxBytes) {
      if (fresh) await ctx.storage.delete(storageId);
      return fail(
        'invalid',
        meta.size > C.photoMaxBytes
          ? `That photo is too big — pick one under ${Math.round(C.photoMaxBytes / 1_000_000)} MB.`
          : 'Use a JPEG, PNG or HEIC photo.',
      );
    }
    const old = owned.club.photoId;
    await ctx.db.patch(clubId, { photoId: storageId });
    if (old && old !== storageId) await ctx.storage.delete(old).catch(() => {});
    return { ok: true };
  },
});

/** Owner only: back to the emblem. */
export const clearPhoto = mutation({
  args: { clubId: v.id('groups') },
  handler: async (ctx, { clubId }): Promise<ClubActionResult> => {
    const owned = await ownedClub(ctx, clubId);
    if ('ok' in owned) return owned;
    if (owned.club.photoId) {
      await ctx.db.patch(clubId, { photoId: undefined });
      await ctx.storage.delete(owned.club.photoId).catch(() => {});
    }
    return { ok: true };
  },
});

export type JoinClubResult = { ok: true; groupId: Id<'groups'>; alreadyMember: boolean } | GroupFail;

/** Join an open club from its page (invite-only clubs need groups.join with the code). */
export const joinOpen = mutation({
  args: { clubId: v.id('groups') },
  handler: async (ctx, { clubId }): Promise<JoinClubResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return fail('signed_out', 'Sign in to join a club.');
    const club = await ctx.db.get(clubId);
    if (!isClub(club)) return fail('not_found', 'That club no longer exists.');
    if (await membershipOf(ctx, clubId, userId)) return { ok: true, groupId: clubId, alreadyMember: true };
    if (club.hidden) return fail('not_found', 'This club isn’t available right now.');
    if (club.open === false) return fail('invalid', 'This club is invite-only — ask a member for the code.');
    return addMembership(ctx, club, userId);
  },
});

export type ReportClubResult = { ok: true; already: boolean } | GroupFail;

/** Report a club's name, photo or description. One report per runner per club. */
export const report = mutation({
  args: { clubId: v.id('groups'), reason: v.string(), note: v.optional(v.string()) },
  handler: async (ctx, { clubId, reason, note }): Promise<ReportClubResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return fail('signed_out', 'Sign in to report a club.');
    const club = await ctx.db.get(clubId);
    if (!isClub(club)) return fail('not_found', 'That club no longer exists.');
    if (club.ownerId === userId) return fail('invalid', 'You can’t report your own club.');
    if (!(REPORT_REASONS as readonly string[]).includes(reason)) return fail('invalid', 'Pick a reason.');
    const cleanNote = cleanClubText(note, C.reportNoteMax, 'note');
    const existing = await ctx.db
      .query('clubReports')
      .withIndex('by_club_user', (q) => q.eq('clubId', clubId).eq('userId', userId))
      .first();
    if (existing) return { ok: true, already: true };
    const now = Date.now();
    const recent = await ctx.db
      .query('clubReports')
      .withIndex('by_user', (q) => q.eq('userId', userId).gte('createdAt', now - DAY_MS))
      .take(C.reportsPerDay);
    if (recent.length >= C.reportsPerDay) return fail('rate_limited', 'You’ve sent a lot of reports today — try again tomorrow.');
    await ctx.db.insert('clubReports', {
      clubId,
      userId,
      reason,
      // a note that trips the word filter is still worth reading — keep it, trimmed
      note: (cleanNote.ok ? cleanNote.value : String(note ?? '').slice(0, C.reportNoteMax)) || undefined,
      createdAt: now,
      resolved: false,
    });
    const reportCount = (club.reportCount ?? 0) + 1;
    const hide = reportCount >= C.reportsToHide && !club.hidden;
    await ctx.db.patch(clubId, { reportCount, ...(hide ? { hidden: true } : {}) });
    if (hide) await syncClubMonthsMeta(ctx, { ...club, hidden: true });
    return { ok: true, already: false };
  },
});

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export interface ClubRankRow extends ClubFace {
  id: Id<'groups'>;
  name: string;
  memberCount: number;
  rank: number | null;
  /** rank counted only up to rankCountCap ("1000+") */
  capped: boolean;
  steps: number;
  runM: number;
  runSec: number;
  isMine: boolean;
}

export type RankingsResult =
  | { ok: true; month: string; metric: ClubMetric; country: string | null; rows: ClubRankRow[]; mine: ClubRankRow[] }
  | GroupFail;

function rankedQuery(ctx: Ctx, month: string, country: string | null, metric: ClubMetric) {
  const q = ctx.db.query('clubMonths');
  if (country) {
    if (metric === 'steps')
      return q.withIndex('by_country_steps', (i) => i.eq('country', country).eq('month', month).eq('listed', true).gt('steps', 0)).order('desc');
    if (metric === 'distance')
      return q.withIndex('by_country_run', (i) => i.eq('country', country).eq('month', month).eq('listed', true).gt('runM', 0)).order('desc');
    return q.withIndex('by_country_pace', (i) => i.eq('country', country).eq('month', month).eq('listed', true).lt('pace', NO_PACE)).order('asc');
  }
  if (metric === 'steps')
    return q.withIndex('by_month_steps', (i) => i.eq('month', month).eq('listed', true).gt('steps', 0)).order('desc');
  if (metric === 'distance')
    return q.withIndex('by_month_run', (i) => i.eq('month', month).eq('listed', true).gt('runM', 0)).order('desc');
  return q.withIndex('by_month_pace', (i) => i.eq('month', month).eq('listed', true).lt('pace', NO_PACE)).order('asc');
}

/** Clubs strictly ahead of `row` in this scope (up to the cap). */
async function aheadOf(ctx: Ctx, row: Doc<'clubMonths'>, country: string | null, metric: ClubMetric): Promise<number> {
  const q = ctx.db.query('clubMonths');
  const { month } = row;
  let ahead;
  if (metric === 'steps') {
    ahead = country
      ? q.withIndex('by_country_steps', (i) => i.eq('country', country).eq('month', month).eq('listed', true).gt('steps', row.steps))
      : q.withIndex('by_month_steps', (i) => i.eq('month', month).eq('listed', true).gt('steps', row.steps));
  } else if (metric === 'distance') {
    ahead = country
      ? q.withIndex('by_country_run', (i) => i.eq('country', country).eq('month', month).eq('listed', true).gt('runM', row.runM))
      : q.withIndex('by_month_run', (i) => i.eq('month', month).eq('listed', true).gt('runM', row.runM));
  } else {
    ahead = country
      ? q.withIndex('by_country_pace', (i) => i.eq('country', country).eq('month', month).eq('listed', true).lt('pace', row.pace))
      : q.withIndex('by_month_pace', (i) => i.eq('month', month).eq('listed', true).lt('pace', row.pace));
  }
  return (await ahead.take(C.rankCountCap)).length;
}

function hasValue(row: Doc<'clubMonths'>, metric: ClubMetric): boolean {
  if (metric === 'steps') return row.steps > 0;
  if (metric === 'distance') return row.runM > 0;
  return row.pace < NO_PACE;
}

/** A club's place in one scope, or null when it isn't ranked there. */
export async function clubRank(
  ctx: Ctx,
  row: Doc<'clubMonths'> | null,
  country: string | null,
  metric: ClubMetric,
): Promise<{ rank: number; capped: boolean } | null> {
  if (!row || !row.listed || !hasValue(row, metric)) return null;
  if (country && row.country !== country) return null;
  const ahead = await aheadOf(ctx, row, country, metric);
  return { rank: ahead + 1, capped: ahead >= C.rankCountCap };
}

async function rankRow(
  ctx: Ctx,
  club: Doc<'groups'>,
  m: Doc<'clubMonths'> | null,
  rank: { rank: number; capped: boolean } | null,
  isMine: boolean,
): Promise<ClubRankRow> {
  return {
    id: club._id,
    name: club.name,
    memberCount: club.memberCount ?? 1,
    rank: rank?.rank ?? null,
    capped: rank?.capped ?? false,
    steps: m?.steps ?? 0,
    runM: m?.runM ?? 0,
    runSec: m?.runSec ?? 0,
    isMine,
    ...(await clubFace(ctx, club)),
  };
}

/** Monthly club leaderboard: top 50 in a country (or worldwide) + where my clubs stand. */
export const rankings = query({
  args: {
    month: v.string(),
    country: v.optional(v.string()),
    metric: v.union(v.literal('steps'), v.literal('distance'), v.literal('pace')),
  },
  handler: async (ctx, { month, country, metric }): Promise<RankingsResult> => {
    if (!isServableMonth(month, Date.now())) return fail('invalid', 'That month isn’t available.');
    if (country !== undefined && !isCountryCode(country)) return fail('invalid', 'Unknown country.');
    const scope = country ?? null;
    const userId = await getAuthUserId(ctx);
    const myClubs: Doc<'groups'>[] = [];
    if (userId) {
      for (const m of await membershipsOf(ctx, userId)) {
        const g = await ctx.db.get(m.groupId);
        if (isClub(g)) myClubs.push(g);
      }
    }
    const mineIds = new Set(myClubs.map((c) => c._id));

    const top = await rankedQuery(ctx, month, scope, metric).take(C.rankingSize);
    const rows: ClubRankRow[] = [];
    for (const m of top) {
      const club = await ctx.db.get(m.clubId);
      if (!isClub(club) || club.hidden) continue;
      rows.push(await rankRow(ctx, club, m, { rank: rows.length + 1, capped: false }, mineIds.has(club._id)));
    }

    const mine: ClubRankRow[] = [];
    for (const club of myClubs) {
      const m = await clubMonthOf(ctx, club._id, month);
      const listedHere = !scope || (club.country ?? null) === scope;
      const rank = listedHere ? await clubRank(ctx, m, scope, metric) : null;
      mine.push(await rankRow(ctx, club, m, rank, true));
    }
    return { ok: true, month, metric, country: scope, rows, mine };
  },
});

export interface ClubProfile extends ClubFace {
  id: Id<'groups'>;
  name: string;
  about: string | null;
  open: boolean;
  goalKm: number | null;
  memberCount: number;
  createdAt: number;
  isMember: boolean;
  isOwner: boolean;
  /** members only */
  code: string | null;
  /** members only: hidden from public lists after reports */
  hidden: boolean;
  reportedByMe: boolean;
  stats: { steps: number; activeMin: number; runM: number; runSec: number };
  rankCountry: { rank: number; capped: boolean } | null;
  rankGlobal: { rank: number; capped: boolean } | null;
}

export type ClubProfileResult = { ok: true; club: ClubProfile } | GroupFail;

/** The club page: public face, this month's totals and step ranks; the code for members. */
export const profile = query({
  args: { clubId: v.id('groups'), month: v.string() },
  handler: async (ctx, { clubId, month }): Promise<ClubProfileResult> => {
    const club = await ctx.db.get(clubId);
    if (!isClub(club)) return fail('not_found', 'That club no longer exists.');
    const userId = await getAuthUserId(ctx);
    const member = userId ? await membershipOf(ctx, clubId, userId) : null;
    if (club.hidden && !member) return fail('not_found', 'This club isn’t available right now.');
    if (!isServableMonth(month, Date.now())) return fail('invalid', 'That month isn’t available.');
    const m = await clubMonthOf(ctx, clubId, month);
    const reported = userId
      ? await ctx.db
          .query('clubReports')
          .withIndex('by_club_user', (q) => q.eq('clubId', clubId).eq('userId', userId))
          .first()
      : null;
    return {
      ok: true,
      club: {
        id: club._id,
        name: club.name,
        about: club.about ?? null,
        open: club.open !== false,
        goalKm: club.goalKm ?? null,
        memberCount: club.memberCount ?? 1,
        createdAt: club.createdAt,
        isMember: !!member,
        isOwner: club.ownerId === userId,
        code: member ? club.code : null,
        hidden: !!member && !!club.hidden,
        reportedByMe: !!reported,
        stats: { steps: m?.steps ?? 0, activeMin: m?.activeMin ?? 0, runM: m?.runM ?? 0, runSec: m?.runSec ?? 0 },
        rankCountry: club.country ? await clubRank(ctx, m, club.country, 'steps') : null,
        rankGlobal: await clubRank(ctx, m, null, 'steps'),
        ...(await clubFace(ctx, club)),
      },
    };
  },
});

export type ClubSearchRow = ClubFace & { id: Id<'groups'>; name: string; memberCount: number; open: boolean; isMine: boolean };

/** Find clubs by name (listed clubs only), optionally within one country. */
export const search = query({
  args: { text: v.string(), country: v.optional(v.string()) },
  handler: async (ctx, { text, country }): Promise<{ ok: true; rows: ClubSearchRow[] }> => {
    const t = text.replace(/\s+/g, ' ').trim().slice(0, 40);
    if (t.length < 2) return { ok: true, rows: [] };
    const scope = country && isCountryCode(country) ? country : null;
    const hits = await ctx.db
      .query('groups')
      .withSearchIndex('search_name', (q) => {
        const base = q.search('name', t).eq('kind', 'club').eq('hidden', false);
        return scope ? base.eq('country', scope) : base;
      })
      .take(C.searchSize);
    const userId = await getAuthUserId(ctx);
    const rows: ClubSearchRow[] = [];
    for (const g of hits) {
      rows.push({
        id: g._id,
        name: g.name,
        memberCount: g.memberCount ?? 1,
        open: g.open !== false,
        isMine: userId ? !!(await membershipOf(ctx, g._id, userId)) : false,
        ...(await clubFace(ctx, g)),
      });
    }
    return { ok: true, rows };
  },
});

// ---------------------------------------------------------------------------
// Admin (ADMIN_EMAILS) — reported clubs
// ---------------------------------------------------------------------------

export interface ReportedClub {
  id: Id<'groups'>;
  name: string;
  about: string | null;
  photoUrl: string | null;
  hidden: boolean;
  reports: { reason: string; note: string | null; createdAt: number }[];
}

export const adminReported = query({
  args: {},
  handler: async (ctx): Promise<{ ok: true; clubs: ReportedClub[] } | GroupFail> => {
    if (!(await isAdmin(ctx))) return fail('not_owner', 'Admins only.');
    const open = await ctx.db
      .query('clubReports')
      .withIndex('by_resolved', (q) => q.eq('resolved', false))
      .order('desc')
      .take(200);
    const byClub = new Map<Id<'groups'>, ReportedClub>();
    for (const r of open) {
      let entry = byClub.get(r.clubId);
      if (!entry) {
        const club = await ctx.db.get(r.clubId);
        if (!isClub(club)) continue;
        entry = {
          id: club._id,
          name: club.name,
          about: club.about ?? null,
          photoUrl: club.photoId ? await ctx.storage.getUrl(club.photoId) : null,
          hidden: !!club.hidden,
          reports: [],
        };
        byClub.set(r.clubId, entry);
      }
      entry.reports.push({ reason: r.reason, note: r.note ?? null, createdAt: r.createdAt });
    }
    return { ok: true, clubs: [...byClub.values()] };
  },
});

/** Admin: keep the club hidden (or hide it) / restore it; resolves its open reports. */
export const adminReview = mutation({
  args: { clubId: v.id('groups'), hidden: v.boolean(), clearPhoto: v.optional(v.boolean()) },
  handler: async (ctx, { clubId, hidden, clearPhoto }): Promise<ClubActionResult> => {
    if (!(await isAdmin(ctx))) return fail('not_owner', 'Admins only.');
    const club = await ctx.db.get(clubId);
    if (!isClub(club)) return fail('not_found', 'That club no longer exists.');
    const patch: Partial<Doc<'groups'>> = { hidden, ...(hidden ? {} : { reportCount: 0 }) };
    if (clearPhoto && club.photoId) {
      patch.photoId = undefined;
      await ctx.storage.delete(club.photoId).catch(() => {});
    }
    await ctx.db.patch(clubId, patch);
    await syncClubMonthsMeta(ctx, { ...club, hidden });
    const open = await ctx.db
      .query('clubReports')
      .withIndex('by_club_user', (q) => q.eq('clubId', clubId))
      .collect();
    await Promise.all(open.filter((r) => !r.resolved).map((r) => ctx.db.patch(r._id, { resolved: true })));
    return { ok: true };
  },
});
