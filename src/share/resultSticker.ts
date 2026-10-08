import { GaitReportRecord } from '../storage/reportRecord';
import { brandLockupSvg } from './brandLockup';

/**
 * The Strava-style shareable result sticker, built as a single SVG string so
 * ONE source of truth drives the in-app preview (SvgXml) AND the exported PNG
 * (web canvas / native view-shot).
 *
 * Two backgrounds:
 *  - 'brand'       — near-black card with an accent glow, ready to post as-is
 *  - 'transparent' — no background at all (Strava-sticker style): white text with
 *                    a soft shadow, made to overlay the user's own photo/video
 *
 * Pure module (no RN imports) so it is unit-tested in node. Wellness-framed:
 * numbers + hedge, never a medical claim.
 */

export const STICKER_SIZE = 1080;

export interface StickerOptions {
  background: 'brand' | 'transparent';
}

/** Escape user-influenced text for safe embedding in SVG/XML. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const FONT = 'Sora_800ExtraBold, Arial, Helvetica, sans-serif';
const FONT_MED = 'Sora_500Medium, Arial, Helvetica, sans-serif';

export function buildResultStickerSvg(report: GaitReportRecord, opts: StickerOptions): string {
  const S = STICKER_SIZE;
  const brand = opts.background === 'brand';
  const cadence = Math.round(report.result.cadence.value);
  const goal = esc(report.scanType.replace(/_/g, ' '));
  const date = new Date(report.createdAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });

  const m = report.metrics;
  const stats: { value: string; label: string }[] = [];
  if (m?.symmetryPct != null) stats.push({ value: `${Math.round(m.symmetryPct)}%`, label: 'symmetry' });
  if (m?.rhythmRegularityPct != null) stats.push({ value: `${Math.round(m.rhythmRegularityPct)}%`, label: 'rhythm' });
  stats.push({ value: String(report.result.stepCount), label: 'steps' });

  // On a photo overlay (transparent) the soft shadow keeps white text readable.
  const textFilter = brand ? '' : ' filter="url(#soft)"';

  const statCols = stats
    .map((s, i) => {
      const x = 90 + i * 300;
      return (
        `<text x="${x}" y="820" font-family="${FONT}" font-size="72" fill="#FFFFFF"${textFilter}>${s.value}</text>` +
        `<text x="${x}" y="868" font-family="${FONT_MED}" font-size="30" fill="rgba(255,255,255,0.72)"${textFilter}>${s.label}</text>`
      );
    })
    .join('\n  ');

  const background = brand
    ? `<rect id="sticker-bg" x="0" y="0" width="${S}" height="${S}" rx="56" fill="url(#ink)"/>
  <circle cx="920" cy="120" r="360" fill="url(#glow)"/>`
    : '';

  return `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="ink" x1="0" y1="0" x2="${S}" y2="${S}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#15161B"/>
      <stop offset="1" stop-color="#0B0C0E"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#FF4D0D" stop-opacity="0.34"/>
      <stop offset="1" stop-color="#FF4D0D" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="10" flood-color="#000000" flood-opacity="0.55"/>
    </filter>
  </defs>
  ${background}

  <!-- logo lockup: the real K runner mark + wordmark -->
  ${brandLockupSvg(84, 82, 72, { filter: brand ? undefined : 'url(#soft)' })}

  <text x="90" y="356" font-family="${FONT_MED}" font-size="34" letter-spacing="6" fill="#FF8A54"${textFilter}>${report.simulated ? 'DEMO · SAMPLE DATA' : 'AI GAIT SCAN'}</text>

  <!-- headline cadence -->
  <text x="82" y="620" font-family="${FONT}" font-size="290" letter-spacing="-10" fill="#FFFFFF"${textFilter}>${cadence}</text>
  <text x="${82 + String(cadence).length * 172}" y="620" font-family="${FONT}" font-size="72" fill="rgba(255,255,255,0.85)"${textFilter}>spm</text>
  <text x="90" y="680" font-family="${FONT_MED}" font-size="34" fill="rgba(255,255,255,0.72)"${textFilter}>steps per minute</text>

  ${statCols}

  <!-- footer -->
  <text x="90" y="990" font-family="${FONT_MED}" font-size="30" fill="rgba(255,255,255,0.78)"${textFilter}>${goal} · ${date}</text>
  <text x="${S - 90}" y="990" text-anchor="end" font-family="${FONT_MED}" font-size="26" fill="rgba(255,255,255,0.55)"${textFilter}>wellness estimate · kasya</text>
</svg>`;
}
