import { STICKER_SIZE } from './resultSticker';

/**
 * WEB sticker export: rasterize the SVG string on a canvas (transparency
 * preserved — we never paint a background), then Web Share when the browser
 * supports sharing files, else download the PNG.
 */
export async function exportSticker(svg: string, _viewRef: unknown): Promise<void> {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new window.Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not render the sticker image'));
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = STICKER_SIZE;
    canvas.height = STICKER_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(img, 0, 0, STICKER_SIZE, STICKER_SIZE);

    const png: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG export failed'))), 'image/png'),
    );

    const file = new File([png], 'kasya-result.png', { type: 'image/png' });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: 'My Kasya result' });
        return;
      } catch {
        // fall through to download if the user cancels or share fails
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(png);
    a.download = 'kasya-result.png';
    a.click();
    URL.revokeObjectURL(a.href);
  } finally {
    URL.revokeObjectURL(url);
  }
}
