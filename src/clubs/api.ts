import { getConvex } from '../convex/client';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { resyncStepDays, timeBoxed, type ActionResult, type ClubFace } from '../groups/api';
import type { ClubMetric, ReportReason } from './rules';
import type { PickedPhoto } from './photo';

/**
 * App-side seam for running clubs. Fail-soft like groups/api.ts: no Convex,
 * not deployed yet, offline or slow → a calm result, never a throw.
 */

const UNAVAILABLE = 'Clubs aren’t available right now — please try again later.';
const OFFLINE = 'That didn’t go through — check your connection and try again.';

type ServerFail = { ok: false; reason: string; message: string };

export interface ClubRankRow extends ClubFace {
  id: string;
  name: string;
  memberCount: number;
  rank: number | null;
  capped: boolean;
  steps: number;
  runM: number;
  runSec: number;
  isMine: boolean;
}

export type RankingsLoad =
  | { status: 'ready'; rows: ClubRankRow[]; mine: ClubRankRow[] }
  | { status: 'no_cloud' | 'unavailable'; message: string };

export interface ClubProfile extends ClubFace {
  id: string;
  name: string;
  about: string | null;
  open: boolean;
  goalKm: number | null;
  memberCount: number;
  createdAt: number;
  isMember: boolean;
  isOwner: boolean;
  code: string | null;
  hidden: boolean;
  reportedByMe: boolean;
  stats: { steps: number; activeMin: number; runM: number; runSec: number };
  rankCountry: { rank: number; capped: boolean } | null;
  rankGlobal: { rank: number; capped: boolean } | null;
}

export type ProfileLoad =
  | { status: 'ready'; club: ClubProfile }
  | { status: 'not_found' | 'no_cloud' | 'unavailable'; message: string };

export interface ClubSearchRow extends ClubFace {
  id: string;
  name: string;
  memberCount: number;
  open: boolean;
  isMine: boolean;
}

export interface ClubFields {
  name: string;
  country: string;
  city: string;
  about: string;
  emblem: string;
  open: boolean;
  goalKm: number | null;
}

// ----------------------------- reads ---------------------------------------

export async function loadRankings(month: string, country: string | null, metric: ClubMetric): Promise<RankingsLoad> {
  const convex = getConvex();
  if (!convex) return { status: 'no_cloud', message: UNAVAILABLE };
  try {
    const res = await timeBoxed(
      convex.query(api.clubs.rankings, { month, metric, ...(country ? { country } : {}) }),
    );
    if (!res.ok) return { status: 'unavailable', message: res.message };
    return { status: 'ready', rows: res.rows as ClubRankRow[], mine: res.mine as ClubRankRow[] };
  } catch {
    return { status: 'unavailable', message: 'We couldn’t load the club rankings just now.' };
  }
}

export async function loadClubProfile(clubId: string, month: string): Promise<ProfileLoad> {
  const convex = getConvex();
  if (!convex) return { status: 'no_cloud', message: UNAVAILABLE };
  try {
    const res = await timeBoxed(convex.query(api.clubs.profile, { clubId: clubId as Id<'groups'>, month }));
    if (res.ok) return { status: 'ready', club: res.club as ClubProfile };
    return { status: res.reason === 'not_found' ? 'not_found' : 'unavailable', message: res.message };
  } catch {
    return { status: 'unavailable', message: 'We couldn’t load this club just now.' };
  }
}

export async function searchClubs(text: string, country: string | null): Promise<ClubSearchRow[] | null> {
  const convex = getConvex();
  if (!convex) return null;
  try {
    const res = await timeBoxed(convex.query(api.clubs.search, { text, ...(country ? { country } : {}) }));
    return res.rows as ClubSearchRow[];
  } catch {
    return null;
  }
}

// ----------------------------- writes --------------------------------------

export type CreateClubResult = { ok: true; clubId: string; code: string } | { ok: false; message: string };

export async function createClub(f: ClubFields): Promise<CreateClubResult> {
  const convex = getConvex();
  if (!convex) return { ok: false, message: UNAVAILABLE };
  try {
    const res = await timeBoxed(
      convex.mutation(api.clubs.create, {
        name: f.name,
        country: f.country,
        city: f.city,
        about: f.about,
        emblem: f.emblem,
        open: f.open,
        ...(f.goalKm ? { goalKm: f.goalKm } : {}),
      }),
    );
    if (!res.ok) return { ok: false, message: (res as ServerFail).message };
    void resyncStepDays(); // now in a club: share today's totals right away
    return { ok: true, clubId: res.clubId, code: res.code };
  } catch {
    return { ok: false, message: OFFLINE };
  }
}

export async function updateClub(clubId: string, f: Partial<ClubFields>): Promise<ActionResult> {
  const convex = getConvex();
  if (!convex) return { ok: false, message: UNAVAILABLE };
  try {
    const res = await timeBoxed(convex.mutation(api.clubs.update, { clubId: clubId as Id<'groups'>, ...f }));
    if (!res.ok) return { ok: false, message: (res as ServerFail).message };
    return { ok: true, message: 'Club updated.' };
  } catch {
    return { ok: false, message: OFFLINE };
  }
}

export type JoinClubResult = { ok: true; alreadyMember: boolean } | { ok: false; message: string };

export async function joinOpenClub(clubId: string): Promise<JoinClubResult> {
  const convex = getConvex();
  if (!convex) return { ok: false, message: UNAVAILABLE };
  try {
    const res = await timeBoxed(convex.mutation(api.clubs.joinOpen, { clubId: clubId as Id<'groups'> }));
    if (!res.ok) return { ok: false, message: (res as ServerFail).message };
    void resyncStepDays();
    return { ok: true, alreadyMember: res.alreadyMember };
  } catch {
    return { ok: false, message: OFFLINE };
  }
}

export async function reportClub(clubId: string, reason: ReportReason, note: string): Promise<ActionResult> {
  const convex = getConvex();
  if (!convex) return { ok: false, message: UNAVAILABLE };
  try {
    const res = await timeBoxed(
      convex.mutation(api.clubs.report, { clubId: clubId as Id<'groups'>, reason, ...(note.trim() ? { note } : {}) }),
    );
    if (!res.ok) return { ok: false, message: (res as ServerFail).message };
    return {
      ok: true,
      message: res.already ? 'You already reported this club — thanks.' : 'Thanks — we’ll review this club.',
    };
  } catch {
    return { ok: false, message: OFFLINE };
  }
}

/** Upload a picked photo and make it the club photo. */
export async function uploadClubPhoto(clubId: string, photo: PickedPhoto): Promise<ActionResult> {
  const convex = getConvex();
  if (!convex) return { ok: false, message: UNAVAILABLE };
  try {
    const target = await timeBoxed(convex.mutation(api.clubs.photoUploadUrl, { clubId: clubId as Id<'groups'> }));
    if (!target.ok) return { ok: false, message: (target as ServerFail).message };
    const blob = await (await fetch(photo.uri)).blob();
    const put = await fetch(target.url, {
      method: 'POST',
      headers: { 'Content-Type': photo.mimeType || blob.type || 'image/jpeg' },
      body: blob,
    });
    if (!put.ok) return { ok: false, message: 'The photo didn’t upload — try again.' };
    const { storageId } = (await put.json()) as { storageId: string };
    const res = await timeBoxed(
      convex.mutation(api.clubs.setPhoto, { clubId: clubId as Id<'groups'>, storageId: storageId as Id<'_storage'> }),
    );
    if (!res.ok) return { ok: false, message: (res as ServerFail).message };
    return { ok: true, message: 'Club photo updated.' };
  } catch {
    return { ok: false, message: OFFLINE };
  }
}

export async function removeClubPhoto(clubId: string): Promise<ActionResult> {
  const convex = getConvex();
  if (!convex) return { ok: false, message: UNAVAILABLE };
  try {
    const res = await timeBoxed(convex.mutation(api.clubs.clearPhoto, { clubId: clubId as Id<'groups'> }));
    if (!res.ok) return { ok: false, message: (res as ServerFail).message };
    return { ok: true, message: 'Photo removed.' };
  } catch {
    return { ok: false, message: OFFLINE };
  }
}
