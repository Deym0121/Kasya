import { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import type * as RNMB from '@rnmapbox/maps';
import { RouteSketch, segmentsOf } from './RouteSketch';
import { bounds, haversine } from '../geo';
import { colors } from '../../theme';
import type { RouteMapProps } from './types';

/**
 * Native route map on Mapbox (dark style, accent route, start/finish dots).
 * Mapbox is required lazily and only when a public token is configured
 * (EXPO_PUBLIC_MAPBOX_TOKEN); otherwise — or if the native module is missing —
 * it degrades to the SVG RouteSketch rather than crashing or showing a blank.
 */
const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';
const STYLE = 'mapbox://styles/mapbox/dark-v11';

let mb: typeof RNMB | null | undefined;
function mapbox(): typeof RNMB | null {
  if (mb === undefined) {
    mb = null;
    if (TOKEN.startsWith('pk.')) {
      try {
        const m = require('@rnmapbox/maps') as typeof RNMB;
        m.default.setAccessToken(TOKEN);
        // No usage telemetry to Mapbox — the map only fetches tiles.
        m.default.setTelemetryEnabled(false);
        mb = m;
      } catch {
        mb = null;
      }
    }
  }
  return mb;
}

export const mapTilesAvailable = TOKEN.startsWith('pk.');

export function RouteMap({ points, height = 240, live, center, interactive }: RouteMapProps) {
  const M = mapbox();
  const segs = useMemo(() => segmentsOf(points), [points]);

  const shape = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: segs
        .filter((s) => s.length > 1)
        .map((s) => ({
          type: 'Feature' as const,
          properties: {},
          geometry: { type: 'LineString' as const, coordinates: s.map(([la, lo]) => [lo, la]) },
        })),
    }),
    [segs],
  );

  const ends = useMemo(() => {
    const all = segs.flat();
    if (all.length === 0) return null;
    const a = all[0];
    const b = all[all.length - 1];
    return {
      type: 'FeatureCollection' as const,
      features: [
        { type: 'Feature' as const, properties: { kind: 'start' }, geometry: { type: 'Point' as const, coordinates: [a[1], a[0]] } },
        { type: 'Feature' as const, properties: { kind: live ? 'here' : 'end' }, geometry: { type: 'Point' as const, coordinates: [b[1], b[0]] } },
      ],
    };
  }, [segs, live]);

  // Stable camera targets: an inline object would be a new prop every render
  // and snap a panned/zoomed map back. Tiny spans (a few metres) get a fixed
  // zoom instead of fitting bounds to near-nothing.
  const all = useMemo(() => segs.flat(), [segs]);
  const b = useMemo(() => bounds(all), [all]);
  const tiny = !!b && haversine(b.minLat, b.minLon, b.maxLat, b.maxLon) < 60;
  const fit = useMemo(
    () =>
      b && !tiny
        ? {
            ne: [b.maxLon, b.maxLat] as [number, number],
            sw: [b.minLon, b.minLat] as [number, number],
            paddingTop: 36,
            paddingBottom: 36,
            paddingLeft: 28,
            paddingRight: 28,
          }
        : null,
    [b, tiny],
  );
  const last = all[all.length - 1] ?? center ?? null;
  const centre = useMemo(() => (last ? ([last[1], last[0]] as [number, number]) : null), [last?.[0], last?.[1]]);

  if (!M) {
    if (segs.flat().length < 2 && center) return <RouteSketch segments={[[center, center]]} height={height} grid live />;
    return <RouteSketch segments={segs} height={height} strokeWidth={4} grid live={live} />;
  }

  const { MapView, Camera, ShapeSource, LineLayer, CircleLayer } = M;

  return (
    <View style={[styles.wrap, { height }]}>
      <MapView
        style={StyleSheet.absoluteFill}
        styleURL={STYLE}
        scaleBarEnabled={false}
        compassEnabled={false}
        logoPosition={{ bottom: 6, left: 8 }}
        attributionPosition={{ bottom: 6, right: 8 }}
        scrollEnabled={!!interactive}
        zoomEnabled={!!interactive}
        pitchEnabled={!!interactive}
        rotateEnabled={!!interactive}
      >
        {live && centre ? (
          <Camera centerCoordinate={centre} zoomLevel={16} maxZoomLevel={18} animationDuration={600} animationMode="easeTo" />
        ) : fit ? (
          <Camera bounds={fit} maxZoomLevel={17} animationDuration={0} />
        ) : centre ? (
          <Camera centerCoordinate={centre} zoomLevel={16} maxZoomLevel={17} animationDuration={0} />
        ) : null}

        {shape.features.length > 0 && (
          <ShapeSource id="kasya-route" shape={shape}>
            <LineLayer
              id="kasya-route-casing"
              style={{ lineColor: colors.bg, lineWidth: 8, lineCap: 'round', lineJoin: 'round', lineOpacity: 0.6 }}
            />
            <LineLayer
              id="kasya-route-line"
              aboveLayerID="kasya-route-casing"
              style={{ lineColor: colors.accent, lineWidth: 4.5, lineCap: 'round', lineJoin: 'round' }}
            />
          </ShapeSource>
        )}
        {ends && (
          <ShapeSource id="kasya-ends" shape={ends}>
            <CircleLayer
              id="kasya-ends-dot"
              style={{
                circleRadius: ['match', ['get', 'kind'], 'here', 8, 6],
                circleColor: ['match', ['get', 'kind'], 'start', colors.success, 'here', colors.accent, colors.ink],
                circleStrokeColor: colors.bg,
                circleStrokeWidth: 2.5,
              }}
            />
          </ShapeSource>
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
});
