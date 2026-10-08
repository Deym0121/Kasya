import { Directory, File, Paths } from 'expo-file-system';

/**
 * Track blobs on device: one JSON file per activity in the app's document
 * directory. Kept out of AsyncStorage on purpose — Android caps that store at
 * ~6 MB total and a single long ride can be ~1 MB. The web build uses the
 * AsyncStorage variant (trackStore.ts).
 */
const dir = () => new Directory(Paths.document, 'activities');
const fileFor = (id: string) => new File(dir(), `${id.replace(/[^a-zA-Z0-9_-]/g, '')}.json`);

export async function writeTrackBlob(id: string, json: string): Promise<void> {
  const d = dir();
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  const f = fileFor(id);
  if (!f.exists) f.create();
  f.write(json);
}

export async function readTrackBlob(id: string): Promise<string | null> {
  const f = fileFor(id);
  if (!f.exists) return null;
  return f.text();
}

export async function deleteTrackBlob(id: string): Promise<void> {
  const f = fileFor(id);
  if (f.exists) f.delete();
}
