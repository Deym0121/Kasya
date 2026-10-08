import { getConvex } from '../convex/client';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { getPlan } from '../monetization/entitlements';
import type { RaceEvent } from './types';
import type { RaceSubmissionInput, SubmissionErrors, SubmissionStatus } from './submission';

/**
 * App-side seam for community race submissions. EVERY call is fail-soft:
 * no Convex (web demo / no URL), functions not deployed yet, offline, or a
 * slow network all resolve to a calm result — screens never see a throw.
 * Convex queries wait for a connection forever, so each call is time-boxed.
 */

const TIMEOUT_MS = 8000;

function timeBoxed<T>(p: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/** Where the runner stands before they can submit. */
export type SubmitAvailability = 'no_cloud' | 'signed_out' | 'unavailable' | 'ready';

export interface MySubmission {
  id: string;
  name: string;
  dateStart: string;
  dateEnd: string | null;
  city: string;
  country: string;
  distances: string[];
  status: SubmissionStatus;
  reason: string;
  createdAt: number;
  publishedEventId: string | null;
}

export interface PendingSubmission {
  id: string;
  name: string;
  dateStart: string;
  dateEnd: string | null;
  city: string;
  country: string;
  distances: string[];
  officialUrl: string;
  registrationUrl: string | null;
  organizer: string | null;
  createdAt: number;
  verification: {
    checkedAt: number;
    urlReachable: boolean;
    nameFound: boolean;
    dateFound: boolean;
    aiVerdict: 'legit' | 'doubtful' | 'unavailable';
    aiSummary: string;
  } | null;
}

export interface OpenReport {
  id: string;
  eventId: string;
  reason: string;
  createdAt: number;
  event: RaceEvent | null;
}

export type SubmitResult =
  | { ok: true }
  | { ok: false; message: string; errors?: SubmissionErrors; notPro?: boolean; signedOut?: boolean };

export interface ActionResult {
  ok: boolean;
  message: string;
}

const UNAVAILABLE = 'Race submissions aren’t available right now — please try again later.';

/** Signed-in check that never hangs ('unknown' = couldn't tell: offline/slow). */
export async function signedInState(): Promise<'no_cloud' | 'signed_in' | 'signed_out' | 'unknown'> {
  const convex = getConvex();
  if (!convex) return 'no_cloud';
  try {
    const me = await timeBoxed(convex.query(api.users.me, {}));
    return me ? 'signed_in' : 'signed_out';
  } catch {
    return 'unknown';
  }
}

/** Are the race-submission functions deployed + reachable? (cheap probe) */
async function backendReady(): Promise<boolean> {
  const convex = getConvex();
  if (!convex) return false;
  try {
    await timeBoxed(convex.query(api.raceSubmissions.amIAdmin, {}));
    return true;
  } catch {
    return false; // not deployed yet ("Could not find public function") / offline
  }
}

/**
 * Where the Races tab's "Submit a race" goes: the paywall only for a
 * signed-in free runner while submissions are actually live; everyone else
 * lands on RaceSubmit, which explains sign-in / "opening soon" itself. Never
 * sell Pro for a feature the backend can't serve yet.
 */
export async function submitEntryRoute(): Promise<'RaceSubmit' | 'Paywall'> {
  if ((await signedInState()) !== 'signed_in' || !(await backendReady())) return 'RaceSubmit';
  try {
    return (await getPlan()) === 'premium' ? 'RaceSubmit' : 'Paywall';
  } catch {
    return 'RaceSubmit';
  }
}

/** "Report wrong info" shows only for signed-in runners on a live backend. */
export async function canReportRaces(): Promise<boolean> {
  return (await signedInState()) === 'signed_in' && (await backendReady());
}

/** Availability + the runner's own submissions, in one fail-soft call. */
export async function loadMySubmissions(): Promise<{ availability: SubmitAvailability; submissions: MySubmission[] }> {
  const state = await signedInState();
  if (state === 'no_cloud') return { availability: 'no_cloud', submissions: [] };
  if (state === 'signed_out') return { availability: 'signed_out', submissions: [] };
  if (state === 'unknown') return { availability: 'unavailable', submissions: [] };
  try {
    const rows = await timeBoxed(getConvex()!.query(api.raceSubmissions.mySubmissions, {}));
    return { availability: 'ready', submissions: rows as MySubmission[] };
  } catch {
    return { availability: 'unavailable', submissions: [] }; // not deployed yet / offline
  }
}

export async function submitRace(input: RaceSubmissionInput): Promise<SubmitResult> {
  const convex = getConvex();
  if (!convex) return { ok: false, message: UNAVAILABLE };
  try {
    const res = await timeBoxed(convex.mutation(api.raceSubmissions.submitRace, input));
    if (res.ok) return { ok: true };
    return {
      ok: false,
      message: res.message,
      errors: res.errors,
      notPro: res.code === 'not_pro',
      signedOut: res.code === 'signed_out',
    };
  } catch {
    return { ok: false, message: UNAVAILABLE };
  }
}

export async function reportRace(eventId: string, reason: string): Promise<ActionResult> {
  const convex = getConvex();
  if (!convex) return { ok: false, message: 'Reporting isn’t available in this version.' };
  try {
    return await timeBoxed(convex.mutation(api.raceSubmissions.reportRace, { eventId, reason }));
  } catch {
    return { ok: false, message: 'Couldn’t send that just now — try again in a bit.' };
  }
}

// --------------------------- admin -----------------------------------------

/** False on any doubt — the admin UI simply stays hidden. */
export async function amIAdmin(): Promise<boolean> {
  const convex = getConvex();
  if (!convex) return false;
  try {
    return (await timeBoxed(convex.query(api.raceSubmissions.amIAdmin, {}))) === true;
  } catch {
    return false;
  }
}

/** null = couldn't load (not deployed / offline). */
export async function listPendingSubmissions(): Promise<PendingSubmission[] | null> {
  const convex = getConvex();
  if (!convex) return null;
  try {
    return (await timeBoxed(convex.query(api.raceSubmissions.listPendingSubmissions, {}))) as PendingSubmission[];
  } catch {
    return null;
  }
}

export async function listOpenReports(): Promise<OpenReport[] | null> {
  const convex = getConvex();
  if (!convex) return null;
  try {
    return (await timeBoxed(convex.query(api.raceSubmissions.listOpenReports, {}))) as OpenReport[];
  } catch {
    return null;
  }
}

async function adminCall(run: () => Promise<ActionResult>): Promise<ActionResult> {
  if (!getConvex()) return { ok: false, message: UNAVAILABLE };
  try {
    return await timeBoxed(run());
  } catch {
    return { ok: false, message: 'That didn’t go through — check your connection and try again.' };
  }
}

export const approveSubmission = (id: string) =>
  adminCall(() => getConvex()!.mutation(api.raceSubmissions.approveSubmission, { id: id as Id<'raceSubmissions'> }));

export const rejectSubmission = (id: string, note: string) =>
  adminCall(() =>
    getConvex()!.mutation(api.raceSubmissions.rejectSubmission, { id: id as Id<'raceSubmissions'>, note }),
  );

export const recheckSubmission = (id: string) =>
  adminCall(() => getConvex()!.mutation(api.raceSubmissions.recheckSubmission, { id: id as Id<'raceSubmissions'> }));

export const resolveReport = (id: string) =>
  adminCall(() => getConvex()!.mutation(api.raceSubmissions.resolveReport, { id: id as Id<'raceReports'> }));
