import { brandLockupSvg } from './brandLockup';
import { metresPerDegree, simplify } from '../activity/geo';
import { formatDuration, formatKm, formatPace, formatSpeed, paceOf, usesSpeed, SPORT_LABEL } from '../activity/format';
import type { ActivitySummary, ActivityTrack } from '../activity/types';

/**
 * Strava-style share image for a recorded activity: the route, the headline
 * numbers and the Kasya logo, built as ONE SVG string that drives both the
 * in-app preview (SvgXml) and the exported PNG — same pattern as the gait
 * resultSticker. Pure (no RN imports), unit-tested in node.
 *
 *  - background 'brand'       — dark card with an accent glow, post as-is
 *  - background 'transparent' — sticker to lay over your own photo/video
 *  - format 'square' (1080×1080 feed) or 'story' (1080×1920 IG/FB/TikTok story)
 *
 * Privacy: the image shows only the route's SHAPE (no map tiles, no street
 * names, no coordinates) — though a recognisable loop near home can still
 * hint where someone lives, which the share screen says plainly.
 */

export type ShareFormat = 'square' | 'story';
export type ShareBackground = 'brand' | 'transparent';

export const SHARE_SIZE: Record<ShareFormat, { w: number; h: number }> = {
  square: { w: 1080, h: 1080 },
  story: { w: 1080, h: 1920 },
};

const FONT = 'Sora_800ExtraBold, Arial, Helvetica, sans-serif';
const FONT_MED = 'Sora_500Medium, Arial, Helvetica, sans-serif';
const ACCENT = '#FF4D0D';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

type LL = [number, number];

/** Rough advance width of a string in em for Sora ExtraBold (digits ≈ 0.62em). */
function emWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += ch === ':' || ch === '.' || ch === ' ' ? 0.32 : ch === '/' ? 0.4 : 0.64;
  return w;
}

/** Largest font size ≤ max that fits `value` + its smaller unit into `width`. */
function fitSize(value: string, unit: string, max: number, width: number): number {
  const em = emWidth(value) + (unit ? emWidth(` ${unit}`) * 0.4 : 0);
  return Math.max(28, Math.min(max, Math.floor(width / em)));
}

/** Route segments (pauses break the line), simplified for a compact SVG. */
export function routeSegments(a: ActivitySummary, track: ActivityTrack | null): LL[][] {
  if (track && track.points.length > 1) {
    const segs: LL[][] = [];
    let cur: LL[] = [];
    let seg = track.points[0].seg;
    for (const p of track.points) {
      if (p.seg !== seg) {
        if (cur.length > 1) segs.push(cur);
        cur = [];
        seg = p.seg;
      }
      cur.push([p.lat, p.lon]);
    }
    if (cur.length > 1) segs.push(cur);
    // ~3 m tolerance keeps the shape; cap the total so the SVG stays small
    const total = segs.reduce((n, s) => n + s.length, 0);
    const tol = total > 4000 ? 8 : total > 1500 ? 5 : 3;
    return segs.map((s) => simplify(s, tol)).filter((s) => s.length > 1);
  }
  return a.preview.length > 1 ? [a.preview] : [];
}

/** Project segments into a box, preserving aspect (cos-lat corrected). */
function projectRoute(segs: LL[][], box: { x: number; y: number; w: number; h: number }): string[] {
  const all = segs.flat().filter(([la, lo]) => Number.isFinite(la) && Number.isFinite(lo));
  if (all.length < 2) return [];
  const k = metresPerDegree(all[0][0]);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [la, lo] of all) {
    const x = lo * k.lon;
    const y = la * k.lat;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  // a minimum span keeps a tiny/degenerate route from being blown up to noise
  const spanX = Math.max(maxX - minX, 40);
  const spanY = Math.max(maxY - minY, 40);
  const s = Math.min(box.w / spanX, box.h / spanY);
  const cx = (maxX + minX) / 2;
  const cy = (maxY + minY) / 2;
  return segs
    .map((seg) =>
      seg
        .filter(([la, lo]) => Number.isFinite(la) && Number.isFinite(lo))
        .map(([la, lo]) => {
          const px = box.x + box.w / 2 + (lo * k.lon - cx) * s;
          const py = box.y + box.h / 2 - (la * k.lat - cy) * s;
          return `${px.toFixed(1)},${py.toFixed(1)}`;
        })
        .join(' '),
    )
    .filter((p) => p.includes(' '));
}

export function buildActivityStickerSvg(
  a: ActivitySummary,
  track: ActivityTrack | null,
  opts: { background: ShareBackground; format: ShareFormat },
): string {
  const { w: W, h: H } = SHARE_SIZE[opts.format];
  const brand = opts.background === 'brand';
  const story = opts.format === 'story';
  const tf = brand ? '' : ' filter="url(#soft)"';

  const speed = usesSpeed(a.sport);
  const pace = paceOf(a.distanceM, a.movingSec);
  const stats = [
    { value: formatKm(a.distanceM), unit: 'km', label: 'Distance' },
    speed
      ? { value: formatSpeed(a.distanceM, a.movingSec), unit: 'km/h', label: 'Avg speed' }
      : { value: formatPace(pace), unit: '/km', label: 'Avg pace' },
    { value: formatDuration(a.movingSec), unit: '', label: 'Time' },
  ];
  const date = new Date(a.startedAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
  const kicker = a.demo ? 'DEMO · SIMULATED GPS' : `${SPORT_LABEL[a.sport].toUpperCase()} · ${date.toUpperCase()}`;
  const title = esc(a.name.length > 28 ? `${a.name.slice(0, 27)}…` : a.name);

  // Layout boxes
  const pad = 84;
  const routeBox = story
    ? { x: pad, y: 480, w: W - 2 * pad, h: 760 }
    : { x: pad + 20, y: 330, w: W - 2 * pad - 40, h: 400 };
  const lines = projectRoute(routeSegments(a, track), routeBox);
  const first = lines[0]?.split(' ')[0]?.split(',').map(Number);
  const lastLine = lines[lines.length - 1]?.split(' ');
  const last = lastLine?.[lastLine.length - 1]?.split(',').map(Number);

  const route = lines.length
    ? lines
        .map(
          (pts) =>
            `<polyline points="${pts}" fill="none" stroke="${brand ? '#0B0C0E' : 'rgba(0,0,0,0.35)'}" stroke-width="${story ? 30 : 24}" stroke-linecap="round" stroke-linejoin="round"/>` +
            `<polyline points="${pts}" fill="none" stroke="${ACCENT}" stroke-width="${story ? 16 : 13}" stroke-linecap="round" stroke-linejoin="round"${tf}/>`,
        )
        .join('\n  ') +
      (first && last
        ? `\n  <circle cx="${first[0]}" cy="${first[1]}" r="${story ? 17 : 14}" fill="#2FBF8F" stroke="#0B0C0E" stroke-width="6"/>` +
          `\n  <circle cx="${last[0]}" cy="${last[1]}" r="${story ? 17 : 14}" fill="#FFFFFF" stroke="#0B0C0E" stroke-width="6"/>`
        : '')
    : `<text x="${W / 2}" y="${routeBox.y + routeBox.h / 2}" text-anchor="middle" font-family="${FONT_MED}" font-size="40" fill="rgba(255,255,255,0.55)"${tf}>Indoor · no GPS route</text>`;

  // Stats. Font sizes are fitted to the column so long values ("1:02:03",
  // "123.4") never run into the next column.
  const statText = (st: (typeof stats)[number], x: number, y: number, max: number, colW: number, labelSize: number) => {
    const size = fitSize(st.value, st.unit, max, colW * 0.94);
    return (
      `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" letter-spacing="-2" fill="#FFFFFF"${tf}>${esc(st.value)}` +
      (st.unit ? `<tspan font-family="${FONT_MED}" font-size="${Math.round(size * 0.4)}" fill="rgba(255,255,255,0.72)"> ${st.unit}</tspan>` : '') +
      `</text>` +
      `<text x="${x}" y="${y + Math.round(labelSize * 1.6)}" font-family="${FONT_MED}" font-size="${labelSize}" fill="rgba(255,255,255,0.68)"${tf}>${st.label}</text>`
    );
  };
  let statCols: string;
  let statsBottom: number;
  if (story) {
    // hero distance, then pace/speed + time underneath (Strava/NRC story style)
    const colW = (W - 2 * pad) / 2;
    statCols =
      statText(stats[0], pad, 1480, 200, W - 2 * pad, 36) +
      '\n  ' +
      statText(stats[1], pad, 1680, 96, colW, 34) +
      '\n  ' +
      statText(stats[2], pad + colW, 1680, 96, colW, 34);
    statsBottom = 1680 + 54;
  } else {
    const colW = (W - 2 * pad) / 3;
    const y = 870;
    statCols = stats.map((st, i) => statText(st, pad + i * colW, y, 78, colW, 29)).join('\n  ');
    statsBottom = y + 46;
  }

  const extra: string[] = [];
  if (a.elevGainM != null && a.elevGainM > 0) extra.push(`${a.elevGainM} m climb`);
  if (a.avgCadence != null) extra.push(`${a.avgCadence} spm cadence`);
  if (a.avgHr != null) extra.push(`${a.avgHr} bpm avg HR`);
  const extraLine = extra.length
    ? `<text x="${pad}" y="${statsBottom + (story ? 80 : 66)}" font-family="${FONT_MED}" font-size="${story ? 34 : 28}" fill="rgba(255,255,255,0.6)"${tf}>${esc(extra.join('  ·  '))}</text>`
    : '';

  const background = brand
    ? `<rect id="sticker-bg" x="0" y="0" width="${W}" height="${H}" rx="56" fill="url(#ink)"/>
  <circle cx="${W - 140}" cy="140" r="${story ? 520 : 380}" fill="url(#glow)"/>`
    : '';

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="ink" x1="0" y1="0" x2="${W}" y2="${H}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#15161B"/>
      <stop offset="1" stop-color="#0B0C0E"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.30"/>
      <stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="10" flood-color="#000000" flood-opacity="0.55"/>
    </filter>
  </defs>
  ${background}

  ${brandLockupSvg(pad, story ? 120 : 82, story ? 84 : 70, { filter: brand ? undefined : 'url(#soft)' })}

  <text x="${pad}" y="${story ? 330 : 236}" font-family="${FONT_MED}" font-size="${story ? 34 : 28}" letter-spacing="5" fill="#FF8A54"${tf}>${esc(kicker)}</text>
  <text x="${pad}" y="${story ? 400 : 292}" font-family="${FONT}" font-size="${story ? 58 : 46}" letter-spacing="-1" fill="#FFFFFF"${tf}>${title}</text>

  <!-- route -->
  ${route}

  <!-- stats -->
  ${statCols}
  ${extraLine}

  <text x="${W - pad}" y="${H - (story ? 90 : 52)}" text-anchor="end" font-family="${FONT_MED}" font-size="${story ? 28 : 24}" fill="rgba(255,255,255,0.5)"${tf}>Tracked with Kasya</text>
</svg>`;
}
