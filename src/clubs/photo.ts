import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * Club photos: pick a square photo, shrink it to 640 px JPEG, hand back a
 * local URI ready to upload. Needs the image picker + manipulator native
 * modules, which ship from app build 1.3.0 (34) on — older binaries running
 * this code over the air report `false` from canPickPhoto() and clubs use
 * their emblem until the app is updated. Both modules are required lazily so
 * a binary without them never evaluates their top-level native lookups.
 */

const SIZE = 640;

export function canPickPhoto(): boolean {
  if (Platform.OS === 'web') return true;
  try {
    return !!requireOptionalNativeModule('ExponentImagePicker') && !!requireOptionalNativeModule('ExpoImageManipulator');
  } catch {
    return false;
  }
}

export interface PickedPhoto {
  uri: string;
  mimeType: string;
}

/** Opens the photo library (square crop). null when cancelled or unavailable. */
export async function pickClubPhoto(): Promise<PickedPhoto | null> {
  if (!canPickPhoto()) return null;
  const Picker = require('expo-image-picker') as typeof import('expo-image-picker');
  const res = await Picker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.9 });
  const asset = res.canceled ? null : res.assets?.[0];
  if (!asset?.uri) return null;
  try {
    const { ImageManipulator, SaveFormat } = require('expo-image-manipulator') as typeof import('expo-image-manipulator');
    const ctx = ImageManipulator.manipulate(asset.uri);
    // Square-crop whatever came back (Android crops to `aspect`, the web picker doesn't crop at all).
    const w = asset.width || 0;
    const h = asset.height || 0;
    if (w > 0 && h > 0 && w !== h) {
      const side = Math.min(w, h);
      ctx.crop({ originX: Math.round((w - side) / 2), originY: Math.round((h - side) / 2), width: side, height: side });
    }
    ctx.resize({ width: SIZE, height: SIZE });
    const image = await ctx.renderAsync();
    const out = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.82 });
    return { uri: out.uri, mimeType: 'image/jpeg' };
  } catch {
    // Couldn't shrink it: upload the picked file if it's small enough (the server checks too).
    return { uri: asset.uri, mimeType: asset.mimeType || 'image/jpeg' };
  }
}
