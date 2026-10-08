/**
 * NATIVE sticker export: snapshot the on-screen preview (react-native-view-shot,
 * transparent PNG) and open the system share sheet (expo-sharing). Metro picks
 * exportSticker.web.ts on web, where we rasterize the SVG string instead.
 *
 * Native modules are lazy-required (same pattern as notifications/reminders) so
 * nothing native loads until the user actually shares.
 */
export interface ExportOptions {
  /** output size in pixels (defaults to the 1080 square sticker) */
  width?: number;
  height?: number;
  fileName?: string;
  title?: string;
}

export async function exportSticker(_svg: string, viewRef: unknown, opts: ExportOptions = {}): Promise<void> {
  const { captureRef } = require('react-native-view-shot');
  // Render at the full share size (1080 wide), not the on-screen preview size.
  const uri: string = await captureRef(viewRef as any, {
    format: 'png',
    quality: 1,
    ...(opts.width && opts.height ? { width: opts.width, height: opts.height } : {}),
  });
  const Sharing = require('expo-sharing');
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: opts.title ?? 'Share your Kasya result' });
  }
}
