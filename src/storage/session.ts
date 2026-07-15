import AsyncStorage from '@react-native-async-storage/async-storage';

/** Mock local session (no real backend yet — Supabase auth lands in Phase 2). */
export interface MockUser {
  email: string;
  name: string;
  plan: 'free' | 'premium';
}

const ONBOARDED = 'kasya:onboarded:v1';
const USER = 'kasya:user:v1';

export async function getOnboarded(): Promise<boolean> {
  return (await AsyncStorage.getItem(ONBOARDED)) === '1';
}

export async function setOnboarded(value: boolean): Promise<void> {
  await AsyncStorage.setItem(ONBOARDED, value ? '1' : '0');
}

export async function getUser(): Promise<MockUser | null> {
  const raw = await AsyncStorage.getItem(USER);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MockUser;
  } catch {
    return null;
  }
}

export async function setUser(user: MockUser): Promise<void> {
  await AsyncStorage.setItem(USER, JSON.stringify(user));
}

export async function signOut(): Promise<void> {
  await AsyncStorage.multiRemove([USER, ONBOARDED]);
}
