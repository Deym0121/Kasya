import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ActivityRecord, ActivitySummary, ActivityTrack } from '../activity/types';
import { SPORTS } from '../activity/types';
import { packTrack, unpackTrack } from '../activity/pack';
import { writeTrackBlob, readTrackBlob, deleteTrackBlob } from '../activity/trackStore';

/**
 * On-device activity log. The index (summaries) lives in AsyncStorage; each
 * route lives in its own blob (a file on device). Activities — routes
 * especially — never leave the phone in this version: no cloud sync, so no
 * location data is "collected" in App Privacy terms. Apple Health is the
 * backup path (Kasya writes finished activities there when connected).
 */
const KEY = 'kasya:activities:v1';
const MAX = 2000;

function isUsable(a: unknown): a is ActivitySummary {
  if (!a || typeof a !== 'object') return false;
  const s = a as Partial<ActivitySummary>;
  return (
    typeof s.id === 'string' &&
    typeof s.startedAt === 'string' &&
    typeof s.endedAt === 'string' &&
    typeof s.distanceM === 'number' &&
    typeof s.movingSec === 'number' &&
    SPORTS.includes(s.sport as never) &&
    Array.isArray(s.preview)
  );
}

export async function listActivities(): Promise<ActivitySummary[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isUsable) : [];
  } catch {
    return [];
  }
}

const byNewest = (a: ActivitySummary, b: ActivitySummary) => Date.parse(b.startedAt) - Date.parse(a.startedAt);

async function writeIndex(all: ActivitySummary[]) {
  const sorted = all.sort(byNewest);
  await AsyncStorage.setItem(KEY, JSON.stringify(sorted.slice(0, MAX)));
  // trimmed past the cap → don't leave their route files behind
  for (const a of sorted.slice(MAX)) await deleteTrackBlob(a.id).catch(() => {});
}

/**
 * Index writes are read-modify-write; run them one at a time so a long Health
 * import and a save/delete happening together can't overwrite each other.
 */
let indexChain: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = indexChain.then(fn, fn);
  indexChain = run.catch(() => {});
  return run;
}

/** Save one or more activities (track first, so an index row never points at nothing). */
export function saveActivities(records: ActivityRecord[]): Promise<void> {
  if (records.length === 0) return Promise.resolve();
  return locked(async () => {
    for (const r of records) {
      if (r.track) await writeTrackBlob(r.summary.id, JSON.stringify(packTrack(r.track)));
    }
    const all = await listActivities();
    const ids = new Set(records.map((r) => r.summary.id));
    await writeIndex([...records.map((r) => ({ ...r.summary, hasTrack: !!r.track })), ...all.filter((a) => !ids.has(a.id))]);
  });
}

export async function saveActivity(record: ActivityRecord): Promise<void> {
  await saveActivities([record]);
}

export async function getActivity(id: string): Promise<ActivitySummary | null> {
  return (await listActivities()).find((a) => a.id === id) ?? null;
}

export async function getTrack(id: string): Promise<ActivityTrack | null> {
  try {
    const raw = await readTrackBlob(id);
    return raw ? unpackTrack(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** Edit the user-owned fields of an activity (name, sport, notes). */
export function updateActivity(
  id: string,
  patch: { name?: string; sport?: ActivitySummary['sport']; notes?: string },
): Promise<void> {
  return locked(async () => {
    const all = await listActivities();
    await writeIndex(
      all.map((a) => {
        if (a.id !== id) return a;
        const next = { ...a };
        if (patch.name !== undefined) next.name = patch.name.trim().slice(0, 60) || a.name;
        if (patch.sport && SPORTS.includes(patch.sport)) next.sport = patch.sport;
        if (patch.notes !== undefined) next.notes = patch.notes.trim().slice(0, 500) || undefined;
        return next;
      }),
    );
  });
}

export function renameActivity(id: string, name: string): Promise<void> {
  return updateActivity(id, { name });
}

export function deleteActivity(id: string, opts: { ignoreReimport?: boolean } = {}): Promise<void> {
  return locked(async () => {
    const all = await listActivities();
    const gone = all.find((a) => a.id === id);
    await writeIndex(all.filter((a) => a.id !== id));
    await deleteTrackBlob(id).catch(() => {});
    // A watch import the user deleted must not come back on the next Health sync.
    if (gone?.externalId && opts.ignoreReimport !== false) {
      const ignored = await listIgnoredImports();
      await AsyncStorage.setItem(IGNORED_KEY, JSON.stringify([gone.externalId, ...ignored].slice(0, 1000)));
    }
  });
}

const IGNORED_KEY = 'kasya:health:ignored:v1';

export async function listIgnoredImports(): Promise<string[]> {
  try {
    const parsed = JSON.parse((await AsyncStorage.getItem(IGNORED_KEY)) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
