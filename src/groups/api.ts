import { getConvex } from '../convex/client';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import type { StepDay } from './types';
import type { DayRange } from './levels';
import { GROUP_LIMITS, prepareStepDays } from './rules';

/**
 * App-side seam for Groups + leaderboards. EVERY call is fail-soft: no Convex
 * (web demo / no URL), functions not deployed yet, offline, or a slow network
 * all resolve to a calm result — screens never see a throw. Convex queries
 * wait for a connection forever, so each call is time-boxed.
 *
 * Privacy: step totals leave the phone ONLY through syncStepDays, and only
 * for a signed-in user who is in at least one group. Leaving your last group
 * deletes everything you uploaded (deleteMine).
 */

const TIMEOUT_MS = 8000;

function timeBoxed<T>(p: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

const UNAVAILABLE = 'Groups aren’t available right now — please try again later.';
const OFFLINE = 'That didn’t go through — check your connection and try again.';

export type GroupsAvailability = 'no_cloud' | 'signed_out' | 'unavailable' | 'ready';

export interface MyGroup {
  id: string;
  name: string;
  code: string;
  role: 'owner' | 'member';
  memberCount: number;
  /** my rank for the range passed to loadMyGroups (null = unknown) */
  myRank: number | null;
  joinedAt: number;
}

export interface LeaderboardMember {
  userId: string;
  displayName: string;
  role: 'owner' | 'member';
  joinedAt: number;
  rank: number;
  steps: number;
  activeMin: number;
  kcal: number;
  daysWithData: number;
  lifetimeSteps: number;
  isMe: boolean;
}

export interface Leaderboard {
  group: { id: string; name: string; code: string; memberCount: number; isOwner: boolean; createdAt: number };
  members: LeaderboardMember[];
}

export type LeaderboardLoad =
  | { status: 'ready'; board: Leaderboard }
  | { status: 'no_cloud' | 'signed_out' | 'not_member' | 'unavailable'; message: string };

export interface ActionResult {
  ok: boolean;
  message: string;
}

type ServerFail = { ok: false; reason: string; message: string };

// ----------------------------- reads ---------------------------------------

/** Availability + my groups + lifetime steps (for the level card), in one fail-soft call. */
export async function loadMyGroups(
  range: DayRange,
): Promise<{ availability: GroupsAvailability; groups: MyGroup[]; lifetimeSteps: number }> {
  const none = { groups: [] as MyGroup[], lifetimeSteps: 0 };
  const convex = getConvex();
  if (!convex) return { availability: 'no_cloud', ...none };
  const [me, mine] = await Promise.allSettled([
    timeBoxed(convex.query(api.users.me, {})),
    timeBoxed(convex.query(api.groups.mine, { fromDay: range.fromDay, toDay: range.toDay })),
  ]);
  if (me.status === 'fulfilled' && !me.value) return { availability: 'signed_out', ...none };
  if (mine.status === 'rejected') return { availability: 'unavailable', ...none }; // not deployed / offline
  if (!mine.value.signedIn) return { availability: 'signed_out', ...none };
  return {
    availability: 'ready',
    groups: mine.value.groups as MyGroup[],
    lifetimeSteps: mine.value.lifetimeSteps,
  };
}

export async function loadLeaderboard(groupId: string, range: DayRange): Promise<LeaderboardLoad> {
  const convex = getConvex();
  if (!convex) return { status: 'no_cloud', message: 'Groups need a Kasya account, which this version doesn’t support yet.' };
  try {
    const res = await timeBoxed(
      convex.query(api.groups.leaderboard, {
        groupId: groupId as Id<'groups'>,
        fromDay: range.fromDay,
        toDay: range.toDay,
      }),
    );
    if (res.ok) return { status: 'ready', board: res as unknown as Leaderboard };
    if (res.reason === 'signed_out') return { status: 'signed_out', message: res.message };
    if (res.reason === 'not_member') return { status: 'not_member', message: res.message };
    return { status: 'unavailable', message: res.message };
  } catch {
    return { status: 'unavailable', message: 'We couldn’t load the leaderboard just now.' };
  }
}

// ----------------------------- writes --------------------------------------

export type CreateResult = { ok: true; groupId: string; code: string } | { ok: false; message: string };
export type JoinResult = { ok: true; groupId: string; alreadyMember: boolean } | { ok: false; message: string };

export async function createGroup(name: string): Promise<CreateResult> {
  const convex = getConvex();
  if (!convex) return { ok: false, message: UNAVAILABLE };
  try {
    const res = await timeBoxed(convex.mutation(api.groups.create, { name }));
    if (!res.ok) return { ok: false, message: (res as ServerFail).message };
    void resyncStepDays(); // now in a group: share today's totals right away
    return { ok: true, groupId: res.groupId, code: res.code };
  } catch {
    return { ok: false, message: OFFLINE };
  }
}

export async function joinGroup(code: string): Promise<JoinResult> {
  const convex = getConvex();
  if (!convex) return { ok: false, message: UNAVAILABLE };
  try {
    const res = await timeBoxed(convex.mutation(api.groups.join, { code }));
    if (!res.ok) return { ok: false, message: (res as ServerFail).message };
    void resyncStepDays();
    return { ok: true, groupId: res.groupId, alreadyMember: res.alreadyMember };
  } catch {
    return { ok: false, message: OFFLINE };
  }
}

/** Leave a group; leaving the LAST one also deletes every step total you uploaded. */
export async function leaveGroup(groupId: string): Promise<ActionResult> {
  const convex = getConvex();
  if (!convex) return { ok: false, message: UNAVAILABLE };
  try {
    const res = await timeBoxed(convex.mutation(api.groups.leave, { groupId: groupId as Id<'groups'> }));
    if (!res.ok) return { ok: false, message: (res as ServerFail).message };
    if (res.remainingGroups === 0) await deleteMyStepData();
    return { ok: true, message: 'You left the group.' };
  } catch {
    return { ok: false, message: OFFLINE };
  }
}

export async function deleteGroup(groupId: string): Promise<ActionResult> {
  const convex = getConvex();
  if (!convex) return { ok: false, message: UNAVAILABLE };
  try {
    const res = await timeBoxed(convex.mutation(api.groups.remove, { groupId: groupId as Id<'groups'> }));
    if (!res.ok) return { ok: false, message: (res as ServerFail).message };
    await cleanUpIfGroupless();
    return { ok: true, message: 'Group deleted.' };
  } catch {
    return { ok: false, message: OFFLINE };
  }
}

export async function removeMember(groupId: string, userId: string): Promise<ActionResult> {
  const convex = getConvex();
  if (!convex) return { ok: false, message: UNAVAILABLE };
  try {
    const res = await timeBoxed(
      convex.mutation(api.groups.removeMember, { groupId: groupId as Id<'groups'>, userId: userId as Id<'users'> }),
    );
    if (!res.ok) return { ok: false, message: (res as ServerFail).message };
    return { ok: true, message: 'Removed from the group.' };
  } catch {
    return { ok: false, message: OFFLINE };
  }
}

export async function renameGroup(groupId: string, name: string): Promise<ActionResult> {
  const convex = getConvex();
  if (!convex) return { ok: false, message: UNAVAILABLE };
  try {
    const res = await timeBoxed(convex.mutation(api.groups.rename, { groupId: groupId as Id<'groups'>, name }));
    if (!res.ok) return { ok: false, message: (res as ServerFail).message };
    return { ok: true, message: 'Group renamed.' };
  } catch {
    return { ok: false, message: OFFLINE };
  }
}

/** Delete every step total + lifetime stat this account uploaded. Never throws. */
export async function deleteMyStepData(): Promise<boolean> {
  lastUpload = null; // a later join must upload again
  const convex = getConvex();
  if (!convex) return false;
  try {
    return (await timeBoxed(convex.mutation(api.steps.deleteMine, {}))).ok;
  } catch {
    return false; // the server also purges on its own when you're left in no group
  }
}

async function cleanUpIfGroupless(): Promise<void> {
  try {
    const count = await timeBoxed(getConvex()!.query(api.groups.myGroupCount, {}));
    if (count === 0) await deleteMyStepData();
  } catch {
    // best effort — the server schedules the same purge itself
  }
}

// ----------------------------- step sync -----------------------------------

export type SyncOutcome =
  | 'uploaded'
  /** identical to the last upload a moment ago — skipped */
  | 'unchanged'
  /** nothing valid to send */
  | 'nothing'
  | 'no_cloud'
  /** guest / signed out — nothing leaves the phone */
  | 'signed_out'
  /** signed in but in zero groups — nothing leaves the phone */
  | 'no_groups'
  | 'failed';

/** Re-uploading the same payload within this window is skipped. */
const DEDUPE_MS = 5 * 60_000;

/** The latest days the dashboard handed us — memory only, never persisted. */
let lastDays: StepDay[] | null = null;
let lastUpload: { key: string; at: number } | null = null;
let queue: Promise<unknown> = Promise.resolve();

async function runSync(days: StepDay[], force: boolean): Promise<SyncOutcome> {
  const clean = prepareStepDays(days, GROUP_LIMITS.maxDaysPerSync);
  if (clean.length === 0) return 'nothing';
  lastDays = clean;
  const convex = getConvex();
  if (!convex) return 'no_cloud';
  const key = JSON.stringify(clean);
  if (!force && lastUpload && lastUpload.key === key && Date.now() - lastUpload.at < DEDUPE_MS) return 'unchanged';
  try {
    // Gate BEFORE sending anything: guests and group-less users upload nothing.
    const count = await timeBoxed(convex.query(api.groups.myGroupCount, {}));
    if (count === null) return 'signed_out';
    if (count === 0) return 'no_groups';
    const res = await timeBoxed(convex.mutation(api.steps.sync, { days: clean }));
    if (!res.ok) return res.reason === 'signed_out' ? 'signed_out' : res.reason === 'no_groups' ? 'no_groups' : 'failed';
    lastUpload = { key, at: Date.now() };
    return 'uploaded';
  } catch {
    return 'failed';
  }
}

function enqueue(run: () => Promise<SyncOutcome>): Promise<SyncOutcome> {
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

/**
 * Called by the steps dashboard after it loads daily totals (local days).
 * Uploads at most the most recent 62 days, ONLY when the user is signed in
 * AND in at least one group; otherwise a no-op. Never throws; calls run one
 * at a time and an identical payload within 5 minutes is skipped.
 */
export function syncStepDays(days: StepDay[]): Promise<SyncOutcome> {
  return enqueue(() => runSync(days, false));
}

/**
 * Re-send the days the dashboard last handed us (e.g. right after joining a
 * group, or before showing a leaderboard). 'nothing' if the dashboard hasn't
 * loaded totals in this app session.
 */
export function resyncStepDays(opts: { force?: boolean } = {}): Promise<SyncOutcome> {
  return enqueue(async () => (lastDays ? runSync(lastDays, opts.force ?? true) : 'nothing'));
}

/** Test seam: forget the in-memory sync state. */
export function __resetGroupSyncForTests(): void {
  lastDays = null;
  lastUpload = null;
  queue = Promise.resolve();
}
