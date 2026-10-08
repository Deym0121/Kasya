import AsyncStorage from '@react-native-async-storage/async-storage';

/** Web track blobs (localStorage via AsyncStorage). Native uses files — see trackStore.native.ts. */
const key = (id: string) => `kasya:track:v1:${id}`;

export async function writeTrackBlob(id: string, json: string): Promise<void> {
  await AsyncStorage.setItem(key(id), json);
}

export async function readTrackBlob(id: string): Promise<string | null> {
  return AsyncStorage.getItem(key(id));
}

export async function deleteTrackBlob(id: string): Promise<void> {
  await AsyncStorage.removeItem(key(id));
}
