import { describe, it, expect } from 'vitest';
import { buildResultStickerSvg, STICKER_SIZE } from '../resultSticker';
import { GaitReportRecord } from '../../storage/reportRecord';

const report = {
  id: 'r1',
  createdAt: '2026-07-06T10:00:00Z',
  scanType: 'running',
  result: {
    cadence: { value: 167.6, unit: 'spm', confidence: 'high' },
    stepCount: 27,
    durationSec: 10,
    captureQuality: { visibilityScore: 0.9, gaitCyclesDetected: 6, ok: true, issues: [] },
  },
  cadenceTip: 'tip',
  metrics: { verticalOscillationPct: 9, symmetryPct: 96, rhythmRegularityPct: 92 },
} as unknown as GaitReportRecord;

describe('buildResultStickerSvg', () => {
  it('is a complete SVG with fixed dimensions for rasterizing', () => {
    const svg = buildResultStickerSvg(report, { background: 'brand' });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    expect(svg).toContain(`width="${STICKER_SIZE}"`);
    expect(svg).toContain(`height="${STICKER_SIZE}"`);
  });

  it('carries the headline result and the app logo', () => {
    const svg = buildResultStickerSvg(report, { background: 'brand' });
    expect(svg).toContain('168'); // rounded cadence
    expect(svg).toContain('spm');
    expect(svg).toContain('Kasya');
    expect(svg).toContain('href="data:image/png;base64,'); // the real K mark, not a placeholder dot
  });

  it('brand mode paints a background, transparent mode paints none', () => {
    const brand = buildResultStickerSvg(report, { background: 'brand' });
    const transparent = buildResultStickerSvg(report, { background: 'transparent' });
    expect(brand).toContain('id="sticker-bg"');
    expect(transparent).not.toContain('id="sticker-bg"');
  });

  it('shows extra stats only when the scan captured them', () => {
    const svg = buildResultStickerSvg(report, { background: 'brand' });
    expect(svg).toContain('96'); // symmetry
    const bare = { ...report, metrics: undefined } as GaitReportRecord;
    const svgBare = buildResultStickerSvg(bare, { background: 'brand' });
    expect(svgBare).not.toContain('symmetry');
    expect(svgBare).toContain('168'); // cadence always
  });

  it('escapes the goal text so markup can never break or inject', () => {
    const weird = { ...report, scanType: 'running & <fun>' } as GaitReportRecord;
    const svg = buildResultStickerSvg(weird, { background: 'brand' });
    expect(svg).toContain('running &amp; &lt;fun&gt;');
    expect(svg).not.toContain('<fun>');
  });

  it('stays wellness-framed — no medical language, hedged footer', () => {
    const svg = buildResultStickerSvg(report, { background: 'brand' }).toLowerCase();
    expect(svg).not.toMatch(/injur|diagnos|pronat|abnormal|medical|disease/);
    expect(svg).toContain('estimate');
  });
});
