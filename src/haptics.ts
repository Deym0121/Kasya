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
