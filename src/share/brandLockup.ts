import { MARK_PNG, MARK_RATIO } from './brandAssets';

/**
 * The Kasya logo lockup for share images: the real orange K runner mark
 * (embedded PNG, so it renders identically in the in-app SvgXml preview, the
 * native view-shot export and the web canvas export) + the "Kasya" wordmark.
 * Pure — no RN imports.
 */
const FONT = 'Sora_800ExtraBold, Arial, Helvetica, sans-serif';

export function brandLockupSvg(
  x: number,
  y: number,
  height: number,
  opts: { filter?: string; wordmark?: boolean; anchor?: 'start' | 'end' } = {},
): string {
  const w = Math.round(height * MARK_RATIO);
  const fontSize = Math.round(height * 0.78);
  const gap = Math.round(height * 0.28);
  const wordW = Math.round(fontSize * 2.75); // "Kasya" in Sora ExtraBold ≈ 2.75em
  const total = w + (opts.wordmark === false ? 0 : gap + wordW);
  const left = opts.anchor === 'end' ? x - total : x;
  const filter = opts.filter ? ` filter="${opts.filter}"` : '';
  const mark = `<image x="${left}" y="${y}" width="${w}" height="${height}" href="${MARK_PNG}" preserveAspectRatio="xMidYMid meet"${filter}/>`;
  if (opts.wordmark === false) return mark;
  const baseline = y + Math.round(height * 0.8);
  return (
    mark +
    `<text x="${left + w + gap}" y="${baseline}" font-family="${FONT}" font-size="${fontSize}" letter-spacing="-1" fill="#FFFFFF"${filter}>Kasya</text>`
  );
}
