import { Platform } from 'react-native';

/**
 * Success haptic for milestone moments (scan complete). No-op on web; never
 * throws — a missing haptic must not break a flow.
 */
export async function successHaptic(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const Haptics = await import('expo-haptics');
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // haptics unavailable (simulator, permissions) — silently skip
  }
}

/** A light tap for in-run moments (each km split, auto-pause). Same no-throw rules. */
export async function tapHaptic(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const Haptics = await import('expo-haptics');
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch {
    // unavailable — skip
  }
}
