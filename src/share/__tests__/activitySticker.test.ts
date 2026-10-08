import { describe, it, expect } from 'vitest';
import { buildActivityStickerSvg, routeSegments, trimRouteEnds, SHARE_SIZE } from '../activitySticker';
import { haversine } from '../../activity/geo';
import { Recorder } from '../../activity/recorder';
import { simulateFixes } from '../../activity/sim';
import { finalizeRecording } from '../../activity/finalize';

function recorded(sport: 'run' | 'ride' = 'run') {
  const r = new Recorder(sport, Date.UTC(2026, 9, 7, 22, 0, 0));
  simulateFixes({ durationSec: 1500, speedMps: sport === 'ride' ? 7 : 3.2, noiseM: 3 }).forEach((f) => r.addFix(f));
  r.finish();
  return finalizeRecording(r, { endedAt: r.startedAt + 1_510_000, steps: 4300, id: 'a1' });
}

describe('activity share image', () => {
  it('is a fixed-size SVG per format with the real logo, route and headline stats', () => {
    const { summary, track } = recorded();
    for (const format of ['square', 'story'] as const) {
      const svg = buildActivityStickerSvg(summary, track, { background: 'brand', format });
      const { w, h } = SHARE_SIZE[format];
      expect(svg).toContain(`width="${w}"`);
      expect(svg).toContain(`height="${h}"`);
      expect(svg).toContain('href="data:image/png;base64,'); // K mark
      expect(svg).toContain('Kasya');
      expect(svg).toContain('<polyline');
      expect(svg).toContain('/km');
      expect(svg).not.toMatch(/NaN|Infinity|undefined/);
    }
  });

  it('rides show speed instead of pace', () => {
    const { summary, track } = recorded('ride');
    const svg = buildActivityStickerSvg(summary, track, { background: 'brand', format: 'square' });
    expect(svg).toContain('km/h');
    expect(svg).not.toContain('/km<');
  });

  it('transparent mode paints no background; brand mode does', () => {
    const { summary, track } = recorded();
    expect(buildActivityStickerSvg(summary, track, { background: 'brand', format: 'square' })).toContain('id="sticker-bg"');
    expect(buildActivityStickerSvg(summary, track, { background: 'transparent', format: 'square' })).not.toContain('id="sticker-bg"');
  });

  it('handles indoor activities with no route, and escapes the name', () => {
    const { summary } = recorded();
    const svg = buildActivityStickerSvg({ ...summary, preview: [], hasTrack: false, name: 'Run <b>& "fun"' }, null, {
      background: 'brand',
      format: 'story',
    });
    expect(svg).toContain('Indoor');
    expect(svg).toContain('Run &lt;b&gt;&amp; &quot;fun&quot;');
    expect(svg).not.toContain('<b>');
    expect(svg).not.toMatch(/NaN|Infinity/);
  });

  it('labels demo activities and keeps the route compact', () => {
    const { summary, track } = recorded();
    const svg = buildActivityStickerSvg({ ...summary, demo: true }, track, { background: 'brand', format: 'square' });
    expect(svg).toContain('DEMO');
    const pts = routeSegments(summary, track).flat().length;
    expect(pts).toBeLessThan(track!.points.length);
    expect(svg.length).toBeLessThan(120_000);
  });

  it('survives a single-point or identical-point route', () => {
    const { summary } = recorded();
    const one = buildActivityStickerSvg({ ...summary, preview: [[14.55, 121.05]] }, null, { background: 'brand', format: 'square' });
    const same = buildActivityStickerSvg({ ...summary, preview: [[14.55, 121.05], [14.55, 121.05]] }, null, {
      background: 'brand',
      format: 'square',
    });
    expect(one).not.toMatch(/NaN|Infinity/);
    expect(same).not.toMatch(/NaN|Infinity/);
  });
});

describe('privacy trim', () => {
  it('drops ~200 m at both ends of the route, measured along the path', () => {
    const { summary, track } = recorded();
    const segs = routeSegments(summary, track);
    const trimmed = trimRouteEnds(segs, 200);
    const first = segs[0][0];
    const kept = trimmed[0][0];
    // the first kept point is at least ~150 m (straight line) from the true start
    expect(haversine(first[0], first[1], kept[0], kept[1])).toBeGreaterThan(150);
    const svgHidden = buildActivityStickerSvg(summary, track, { background: 'brand', format: 'square', hideEndsM: 200 });
    expect(svgHidden).toContain('<polyline');
  });

  it('hides a route that is too short to trim and says why', () => {
    const { summary } = recorded();
    const short = { ...summary, preview: [[14.55, 121.05], [14.5505, 121.05], [14.551, 121.05]] as [number, number][] };
    const svg = buildActivityStickerSvg(short, null, { background: 'brand', format: 'square', hideEndsM: 200 });
    expect(svg).toContain('Route hidden for privacy');
    expect(svg).not.toContain('<polyline');
  });
});
