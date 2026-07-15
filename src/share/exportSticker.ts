/**
 * NATIVE sticker export: snapshot the on-screen preview (react-native-view-shot,
 * transparent PNG) and open the system share sheet (expo-sharing). Metro picks
 * exportSticker.web.ts on web, where we rasterize the SVG string instead.
 *
 * Native modules are lazy-required (same pattern as notifications/reminders) so
 * nothing native loads until the user actually shares.
 */
export async function exportSticker(_svg: string, viewRef: unknown): Promise<void> {
  const { captureRef } = require('react-native-view-shot');
  const uri: string = await captureRef(viewRef as any, { format: 'png', quality: 1 });
  const Sharing = require('expo-sharing');
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your Kasya result' });
  }
}
