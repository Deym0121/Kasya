import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The one Supabase client for the app, created lazily from the public env pair
 * (URL + anon key — safe to ship; RLS protects the data). When the env is not
 * set, `getSupabase()` returns null and the app runs fully local, exactly as
 * before — cloud is an upgrade, never a requirement.
 *
 * Session storage (audit requirement — refresh tokens must not sit in plain
 * AsyncStorage on device):
 *  - web:    localStorage (browser-sandboxed)
 *  - native: "LargeSecureStore" — a random 256-bit AES key lives in the
 *    Keychain/Keystore (expo-secure-store), the encrypted session blob lives in
 *    AsyncStorage. SecureStore alone can't hold Supabase's >2KB session JSON.
 */

const URL = ((globalThis as any)?.process?.env?.EXPO_PUBLIC_SUPABASE_URL as string | undefined)?.trim();
const ANON = ((globalThis as any)?.process?.env?.EXPO_PUBLIC_SUPABASE_ANON_KEY as string | undefined)?.trim();

export function isCloudEnabled(): boolean {
  return !!(URL && ANON);
}

/** AES-CTR encrypt/decrypt with the key hex-stored in SecureStore, blob in AsyncStorage. */
function largeSecureStore() {
  const SecureStore = require('expo-secure-store');
  require('react-native-get-random-values'); // crypto.getRandomValues polyfill for key generation
  const aes = require('aes-js');

  async function keyFor(name: string, create: boolean): Promise<Uint8Array | null> {
    const id = 'kasya.sess.' + name.replace(/[^A-Za-z0-9._-]/g, '_');
    const hex = await SecureStore.getItemAsync(id);
    if (hex) return aes.utils.hex.toBytes(hex);
    if (!create) return null;
    const fresh = new Uint8Array(32);
    crypto.getRandomValues(fresh);
    await SecureStore.setItemAsync(id, aes.utils.hex.fromBytes(fresh));
    return fresh;
  }

  return {
    async getItem(name: string): Promise<string | null> {
      const [key, blob] = await Promise.all([keyFor(name, false), AsyncStorage.getItem('kasya.sessdata.' + name)]);
      if (!key || !blob) return null;
      try {
        const cipher = new aes.ModeOfOperation.ctr(key, new aes.Counter(1));
        return aes.utils.utf8.fromBytes(cipher.decrypt(aes.utils.hex.toBytes(blob)));
      } catch {
        return null; // corrupted/rotated — treat as signed out
      }
    },
    async setItem(name: string, value: string): Promise<void> {
      const key = (await keyFor(name, true))!;
      const cipher = new aes.ModeOfOperation.ctr(key, new aes.Counter(1));
      const blob = aes.utils.hex.fromBytes(cipher.encrypt(aes.utils.utf8.toBytes(value)));
      await AsyncStorage.setItem('kasya.sessdata.' + name, blob);
    },
    async removeItem(name: string): Promise<void> {
      await AsyncStorage.removeItem('kasya.sessdata.' + name);
      const SecureStoreDel = require('expo-secure-store');
      await SecureStoreDel.deleteItemAsync('kasya.sess.' + name.replace(/[^A-Za-z0-9._-]/g, '_')).catch(() => {});
    },
  };
}

let client: SupabaseClient | null = null;
let tried = false;

export function getSupabase(): SupabaseClient | null {
  if (tried) return client;
  tried = true;
  if (!URL || !ANON) return null;
  try {
    const { createClient } = require('@supabase/supabase-js');
    client = createClient(URL, ANON, {
      auth: {
        storage: Platform.OS === 'web' ? undefined : largeSecureStore(),
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  } catch {
    client = null; // never let cloud setup break the local app
  }
  return client;
}
