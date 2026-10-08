import { v } from 'convex/values';
import { internalAction, internalMutation, internalQuery, mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { getAuthUserId } from '@convex-dev/auth/server';
import { proStatusFor } from './entitlements';
import { callOpenRouter } from './openrouter';
import {
  SUBMISSION_LIMITS,
  addDaysIso,
  buildVerifyMessages,
  classifyFetchStatus,
  cleanReviewNote,
  communityEventId,
  htmlToText,
  isAdminEmail,
  isLikelySameRace,
  isSafePublicUrl,
  pageMentionsDate,
  pageMentionsName,
  parseAdminEmails,
  parseAiVerdict,
  proGateAllows,
  SERVER_DATE_SLACK_DAYS,
  summarizeVerification,
  utcTodayIso,
  validateReportReason,
  validateSubmission,
} from '../src/races/submission';
import type { AiVerdict, FetchClass, SubmissionErrors } from '../src/races/submission';

/**
 * Community race submissions — Kasya Pro runners propose races; NOTHING is
 * published until an admin approves.
 *
 *   submitRace (Pro, signed in) ─▶ raceSubmissions 'pending'
 *        └─ scheduler ─▶ verifySubmission: fetch the official page, look for
 *           the name + date, ask OpenRouter for a strict JSON verdict.
 *           Unreachable page ⇒ 'auto_rejected'; otherwise stays 'pending'.
 *   approveSubmission (admin) ─▶ raceEvents row, source 'community'
 *   rejectSubmission (admin)  ─▶ 'rejected' + note shown to the runner
 *
 * All rules live in the pure, tested module src/races/submission.ts (shared
 * with the app's inline validation).
 *
 * Env (npx convex env set …):
 *   ADMIN_EMAILS        comma-separated admin account emails (required for review)
 *   OPENROUTER_API_KEY  optional — enables the AI verdict (already set for the coach)
 *   RACES_STRICT_PRO=1  optional — also refuse users with no LINKED server
 *                       entitlement (only once the app calls Purchases.logIn)
 *
 * Expected failures are RETURNED as { ok: false, message } instead of thrown:
 * production deployments redact thrown error messages.
 */

const DAY_MS = 86_400_000;
const L = SUBMISSION_LIMITS;

type Ctx = QueryCtx | MutationCtx;

/** The caller + whether their account email is in ADMIN_EMAILS. */
async function caller(ctx: Ctx): Promise<{ userId: Id<'users'>; isAdmin: boolean } | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  const user = await ctx.db.get(userId);
  const email = (user as { email?: string } | null)?.email ?? null;
  return { userId, isAdmin: isAdminEmail(email, parseAdminEmails(process.env.ADMIN_EMAILS)) };
}

async function adminId(ctx: Ctx): Promise<Id<'users'> | null> {
  const c = await caller(ctx);
  return c?.isAdmin ? c.userId : null;
}

/** Calendar rows within ±1 day of a date (duplicate checks). */
async function eventsNear(ctx: Ctx, dateStart: string): Promise<Doc<'raceEvents'>[]> {
  const lo = addDaysIso(dateStart, -1);
  const hi = addDaysIso(dateStart, 1);
  return ctx.db
    .query('raceEvents')
    .withIndex('by_date', (q) => q.gte('dateStart', lo).lte('dateStart', hi))
    .collect();
}

/** A raceEvents row in the same public shape races:list returns. */
function publicEvent(row: Doc<'raceEvents'>) {
  const { _id, _creationTime, updatedAt, ...event } = row;
  return event;
}

/** What the runner sees under a status chip. */
function runnerReason(s: Doc<'raceSubmissions'>): string {
  switch (s.status) {
    case 'pending':
      return s.verification
        ? 'Official page checked — waiting for the Kasya team.'
        : 'Checking the official page…';
    case 'approved':
      return s.reviewNote || 'Live in the race calendar.';
    case 'rejected':
      return s.reviewNote || 'The Kasya team couldn’t verify this race.';
    default:
      return s.reviewNote || 'We couldn’t open the official page.';
  }
}

// ---------------------------------------------------------------------------
// Runner-facing
// ---------------------------------------------------------------------------

export type SubmitRaceResult =
  | { ok: true; id: Id<'raceSubmissions'> }
  | {
      ok: false;
      code:
        | 'signed_out'
        | 'not_pro'
        | 'invalid'
        | 'too_many_pending'
        | 'daily_limit'
        | 'duplicate_event'
        | 'duplicate_pending';
      message: string;
      errors?: SubmissionErrors;
    };

export const submitRace = mutation({
  args: {
    name: v.string(),
    dateStart: v.string(),
    dateEnd: v.optional(v.string()),
    city: v.string(),
    country: v.string(),
    distances: v.array(v.string()),
    officialUrl: v.string(),
    registrationUrl: v.optional(v.string()),
    organizer: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<SubmitRaceResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { ok: false, code: 'signed_out', message: 'Sign in to submit a race.' };

    // Same server-truth signals as the AI coach gate (http.ts → entitlements.mine).
    const strict = process.env.RACES_STRICT_PRO === '1';
    if (!proGateAllows(await proStatusFor(ctx, userId), strict)) {
      return { ok: false, code: 'not_pro', message: 'Submitting races is a Kasya Pro feature.' };
    }

    const now = Date.now();
    const check = validateSubmission(args, utcTodayIso(now), { slackDays: SERVER_DATE_SLACK_DAYS });
    if (!check.ok) {
      return { ok: false, code: 'invalid', message: 'Some details need fixing.', errors: check.errors };
    }
    const sub = check.value;

    const mine = await ctx.db
      .query('raceSubmissions')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    if (mine.filter((s) => s.status === 'pending').length >= L.maxPendingPerUser) {
      return {
        ok: false,
        code: 'too_many_pending',
        message: `You already have ${L.maxPendingPerUser} races waiting for review — we’ll get to them soon.`,
      };
    }
    if (mine.filter((s) => s.createdAt > now - DAY_MS).length >= L.maxSubmissionsPerDay) {
      return { ok: false, code: 'daily_limit', message: 'That’s a lot of races for one day — try again tomorrow.' };
    }

    const twin = (await eventsNear(ctx, sub.dateStart)).find((e) => isLikelySameRace(e, sub));
    if (twin) {
      return { ok: false, code: 'duplicate_event', message: `It’s already in the calendar as “${twin.name}”.` };
    }
    const lo = addDaysIso(sub.dateStart, -1);
    const hi = addDaysIso(sub.dateStart, 1);
    const pendingNear = await ctx.db
      .query('raceSubmissions')
      .withIndex('by_status_date', (q) => q.eq('status', 'pending').gte('dateStart', lo).lte('dateStart', hi))
      .collect();
    if (pendingNear.some((p) => isLikelySameRace(p, sub))) {
      return {
        ok: false,
        code: 'duplicate_pending',
        message: 'Someone already submitted this race — it’s being reviewed now.',
      };
    }

    const id = await ctx.db.insert('raceSubmissions', { userId, status: 'pending', ...sub, createdAt: now });
    await ctx.scheduler.runAfter(0, internal.raceSubmissions.verifySubmission, { id });
    return { ok: true, id };
  },
});

/** The caller's submissions, newest first ([] when signed out). */
export const mySubmissions = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query('raceSubmissions')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .order('desc')
      .take(50);
    return rows.map((s) => ({
      id: s._id,
      name: s.name,
      dateStart: s.dateStart,
      dateEnd: s.dateEnd ?? null,
      city: s.city,
      country: s.country,
      distances: s.distances,
      status: s.status,
      reason: runnerReason(s),
      createdAt: s.createdAt,
      publishedEventId: s.publishedEventId ?? null,
    }));
  },
});

/** "Report wrong info" — any signed-in user, max 5 per rolling 24h. */
export const reportRace = mutation({
  args: { eventId: v.string(), reason: v.string() },
  handler: async (ctx, args): Promise<{ ok: boolean; message: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { ok: false, message: 'Sign in to report a problem.' };
    if (!/^[a-z0-9-]{1,100}$/.test(args.eventId)) return { ok: false, message: 'We couldn’t find that race.' };
    const reason = validateReportReason(args.reason);
    if (!reason) return { ok: false, message: 'Tell us what’s wrong — a few words is enough.' };
    const now = Date.now();
    const recent = await ctx.db
      .query('raceReports')
      .withIndex('by_user', (q) => q.eq('userId', userId).gt('createdAt', now - DAY_MS))
      .collect();
    if (recent.some((r) => r.eventId === args.eventId && !r.resolved)) {
      return { ok: true, message: 'Thanks — we already have your report for this race.' };
    }
    if (recent.length >= L.reportsPerDay) {
      return { ok: false, message: 'You’ve sent a lot of reports today — thank you! Try again tomorrow.' };
    }
    await ctx.db.insert('raceReports', { eventId: args.eventId, userId, reason, createdAt: now, resolved: false });
    return { ok: true, message: 'Thanks — we’ll check it against the official page.' };
  },
});

// ---------------------------------------------------------------------------
// Admin (emails in the ADMIN_EMAILS env var)
// ---------------------------------------------------------------------------

export const amIAdmin = query({
  args: {},
  handler: async (ctx) => (await adminId(ctx)) !== null,
});

/** Review queue, oldest first. [] for non-admins. */
export const listPendingSubmissions = query({
  args: {},
  handler: async (ctx) => {
    if (!(await adminId(ctx))) return [];
    const rows = await ctx.db
      .query('raceSubmissions')
      .withIndex('by_status_date', (q) => q.eq('status', 'pending'))
      .take(100);
    return rows
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((s) => ({
        id: s._id,
        name: s.name,
        dateStart: s.dateStart,
        dateEnd: s.dateEnd ?? null,
        city: s.city,
        country: s.country,
        distances: s.distances,
        officialUrl: s.officialUrl,
        registrationUrl: s.registrationUrl ?? null,
        organizer: s.organizer ?? null,
        createdAt: s.createdAt,
        verification: s.verification ?? null,
      }));
  },
});

type AdminResult = { ok: boolean; message: string; eventId?: string };

export const approveSubmission = mutation({
  args: { id: v.id('raceSubmissions') },
  handler: async (ctx, { id }): Promise<AdminResult> => {
    if (!(await adminId(ctx))) return { ok: false, message: 'Admins only.' };
    const sub = await ctx.db.get(id);
    if (!sub) return { ok: false, message: 'Submission not found.' };
    if (sub.status !== 'pending') return { ok: false, message: 'Already reviewed.' };
    const now = Date.now();

    const all = await ctx.db.query('raceEvents').collect();
    const twin = all.find((e) => isLikelySameRace(e, sub));
    if (twin) {
      // The weekly routine (or another approval) got there first — link, don't duplicate.
      await ctx.db.patch(id, {
        status: 'approved',
        reviewedAt: now,
        reviewNote: 'Already in the race calendar.',
        publishedEventId: twin.id,
      });
      return { ok: true, eventId: twin.id, message: `Already listed as “${twin.name}” — linked, no duplicate.` };
    }

    const taken = new Set(all.map((e) => e.id));
    const eventId = communityEventId(sub.name, sub.dateStart, (x) => taken.has(x), id);
    await ctx.db.insert('raceEvents', {
      id: eventId,
      name: sub.name,
      country: sub.country,
      city: sub.city,
      dateStart: sub.dateStart,
      ...(sub.dateEnd ? { dateEnd: sub.dateEnd } : {}),
      distances: sub.distances,
      major: false,
      ...(sub.registrationUrl ? { regUrl: sub.registrationUrl } : {}),
      officialUrl: sub.officialUrl,
      ...(sub.organizer ? { organizer: sub.organizer } : {}),
      sourceUrl: sub.officialUrl,
      source: 'community',
      updatedAt: now,
    });
    await ctx.db.patch(id, { status: 'approved', reviewedAt: now, publishedEventId: eventId });
    return { ok: true, eventId, message: 'Published to the race calendar.' };
  },
});

export const rejectSubmission = mutation({
  args: { id: v.id('raceSubmissions'), note: v.string() },
  handler: async (ctx, { id, note }): Promise<AdminResult> => {
    if (!(await adminId(ctx))) return { ok: false, message: 'Admins only.' };
    const sub = await ctx.db.get(id);
    if (!sub) return { ok: false, message: 'Submission not found.' };
    if (sub.status !== 'pending') return { ok: false, message: 'Already reviewed.' };
    const reviewNote = cleanReviewNote(note);
    await ctx.db.patch(id, {
      status: 'rejected',
      reviewedAt: Date.now(),
      ...(reviewNote ? { reviewNote } : {}),
    });
    return { ok: true, message: 'Rejected — the runner will see your note.' };
  },
});

/** Re-run the official-page check (e.g. the site was down, or AI was off). */
export const recheckSubmission = mutation({
  args: { id: v.id('raceSubmissions') },
  handler: async (ctx, { id }): Promise<AdminResult> => {
    if (!(await adminId(ctx))) return { ok: false, message: 'Admins only.' };
    const sub = await ctx.db.get(id);
    if (!sub || sub.status !== 'pending') return { ok: false, message: 'Only pending submissions can be re-checked.' };
    await ctx.scheduler.runAfter(0, internal.raceSubmissions.verifySubmission, { id });
    return { ok: true, message: 'Re-checking the official page…' };
  },
});

/** Open "Report wrong info" reports, newest first, with the race if it still exists. */
export const listOpenReports = query({
  args: {},
  handler: async (ctx) => {
    if (!(await adminId(ctx))) return [];
    const rows = await ctx.db
      .query('raceReports')
      .withIndex('by_resolved', (q) => q.eq('resolved', false))
      .order('desc')
      .take(50);
    const out = [];
    for (const r of rows) {
      const event = await ctx.db
        .query('raceEvents')
        .withIndex('by_event_id', (q) => q.eq('id', r.eventId))
        .first();
      out.push({
        id: r._id,
        eventId: r.eventId,
        reason: r.reason,
        createdAt: r.createdAt,
        event: event ? publicEvent(event) : null,
      });
    }
    return out;
  },
});

export const resolveReport = mutation({
  args: { id: v.id('raceReports') },
  handler: async (ctx, { id }): Promise<AdminResult> => {
    if (!(await adminId(ctx))) return { ok: false, message: 'Admins only.' };
    const row = await ctx.db.get(id);
    if (!row) return { ok: false, message: 'Report not found.' };
    await ctx.db.patch(id, { resolved: true });
    return { ok: true, message: 'Marked resolved.' };
  },
});

// ---------------------------------------------------------------------------
// Verification (internal)
// ---------------------------------------------------------------------------

export const getForVerification = internalQuery({
  args: { id: v.id('raceSubmissions') },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

export const recordVerification = internalMutation({
  args: {
    id: v.id('raceSubmissions'),
    status: v.union(v.literal('pending'), v.literal('auto_rejected')),
    verification: v.object({
      checkedAt: v.float64(),
      urlReachable: v.boolean(),
      nameFound: v.boolean(),
      dateFound: v.boolean(),
      aiVerdict: v.union(v.literal('legit'), v.literal('doubtful'), v.literal('unavailable')),
      aiSummary: v.string(),
    }),
    reviewNote: v.optional(v.string()),
  },
  handler: async (ctx, { id, status, verification, reviewNote }) => {
    const sub = await ctx.db.get(id);
    if (!sub || sub.status !== 'pending') return; // an admin already decided
    await ctx.db.patch(id, {
      status,
      verification,
      ...(status === 'auto_rejected' ? { reviewedAt: verification.checkedAt } : {}),
      ...(reviewNote ? { reviewNote } : {}),
    });
  },
});

const FETCH_TIMEOUT_MS = 10_000;
const MAX_PAGE_BYTES = 1_000_000;
const TOO_SLOW = 'the site took too long to respond';

interface PageFetch {
  fetchClass: FetchClass;
  status?: number;
  detail?: string;
  textual: boolean;
  html?: string;
  finalUrl: string;
}

function cancelBody(res: Response): void {
  try {
    res.body?.cancel().catch(() => {});
  } catch {
    // body already consumed/locked — nothing to release
  }
}

/** Read at most maxBytes of the body as text (size cap for hostile pages). */
async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const body = res.body;
  if (!body || typeof body.getReader !== 'function') return (await res.text()).slice(0, maxBytes);
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let out = '';
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    bytes += value.byteLength;
    out += decoder.decode(value, { stream: true });
    if (bytes >= maxBytes) {
      reader.cancel().catch(() => {});
      break;
    }
  }
  return out;
}

/** GET the official page: timeout, size cap, text only, public hosts only. */
async function fetchOfficialPage(url: string): Promise<PageFetch> {
  if (!isSafePublicUrl(url)) {
    return { fetchClass: 'unreachable', detail: 'the link is not a public https page', textual: false, finalUrl: url };
  }
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => {
      ctrl.abort();
      resolve('timeout');
    }, FETCH_TIMEOUT_MS);
  });
  const work = (async (): Promise<PageFetch> => {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; KasyaRaceCheck/1.0; +https://kasya.app)',
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
        'Accept-Language': 'en',
      },
    });
    const finalUrl = res.url || url;
    if (!isSafePublicUrl(finalUrl, { allowHttp: true })) {
      cancelBody(res);
      return { fetchClass: 'unreachable', detail: 'it redirected to an address we can’t check', textual: false, finalUrl };
    }
    const fetchClass = classifyFetchStatus(res.status);
    const type = (res.headers.get('content-type') || '').toLowerCase();
    const textual = !type || /text\/|html|xml/.test(type);
    if (fetchClass !== 'ok' || !textual) {
      cancelBody(res);
      return { fetchClass, status: res.status, textual, finalUrl };
    }
    return { fetchClass, status: res.status, textual, html: await readCapped(res, MAX_PAGE_BYTES), finalUrl };
  })();
  work.catch(() => {}); // a late rejection after the timeout won must not go unhandled
  try {
    const out = await Promise.race([work, timeout]);
    return out === 'timeout' ? { fetchClass: 'unreachable', detail: TOO_SLOW, textual: false, finalUrl: url } : out;
  } catch {
    const detail = ctrl.signal.aborted ? TOO_SLOW : 'the site did not respond';
    return { fetchClass: 'unreachable', detail, textual: false, finalUrl: url };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const verifySubmission = internalAction({
  args: { id: v.id('raceSubmissions') },
  handler: async (ctx, { id }): Promise<void> => {
    const sub: Doc<'raceSubmissions'> | null = await ctx.runQuery(internal.raceSubmissions.getForVerification, { id });
    if (!sub || sub.status !== 'pending') return;

    const page = await fetchOfficialPage(sub.officialUrl);
    const aiConfigured = !!process.env.OPENROUTER_API_KEY;
    let nameFound = false;
    let dateFound = false;
    let ai: AiVerdict | null = null;
    if (page.fetchClass === 'ok' && page.html) {
      const { title, text } = htmlToText(page.html);
      const hay = `${title} ${text}`;
      nameFound = pageMentionsName(hay, sub.name);
      dateFound = pageMentionsDate(hay, sub.dateStart);
      if (aiConfigured && hay.trim()) {
        try {
          const out = await callOpenRouter(buildVerifyMessages(sub, { url: page.finalUrl, title, text }), 600, 0);
          if (out.ok) ai = parseAiVerdict(out.text);
          else console.error(`race verify: OpenRouter ${out.status}: ${out.detail}`);
        } catch (e) {
          console.error('race verify: AI call failed', e);
        }
      }
    }

    const result = summarizeVerification({
      now: Date.now(),
      fetchClass: page.fetchClass,
      httpStatus: page.status,
      fetchDetail: page.detail,
      textual: page.textual,
      nameFound,
      dateFound,
      aiConfigured,
      ai,
    });
    await ctx.runMutation(internal.raceSubmissions.recordVerification, {
      id,
      status: result.status,
      verification: result.verification,
      ...(result.reviewNote ? { reviewNote: result.reviewNote } : {}),
    });
  },
});
