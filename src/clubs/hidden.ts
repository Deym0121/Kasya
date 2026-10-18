import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Clubs this runner hid from their own rankings and search ("block" for
 * App Review 1.2). Device-local: nothing is sent anywhere, and hiding doesn't
 * affect the club for anyone else — Report is the way to flag it to us.
 */
const KEY = 'kasya:clubs:hidden:v1';
const MAX = 500;

export async function getHiddenClubs(): Promise<Set<string>> {
  try {
    const raw = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export async function setClubHidden(clubId: string, hidden: boolean): Promise<Set<string>> {
  const set = await getHiddenClubs();
  if (hidden) set.add(clubId);
  else set.delete(clubId);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify([...set].slice(-MAX)));
  } catch {}
  return set;
}
