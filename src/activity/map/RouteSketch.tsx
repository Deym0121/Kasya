import { View, StyleSheet } from 'react-native';
import Svg, { Polyline, Circle, Line } from 'react-native-svg';
import { metresPerDegree } from '../geo';
import { colors } from '../../theme';

type LL = [number, number];

/**
 * A route drawn as plain SVG on the dark card — no map tiles. Used for list
 * thumbnails (free, instant, no map-SDK views in a scrolling list), on the
 * web, and as the fallback whenever the Mapbox map can't render.
 */
export function RouteSketch({
  segments,
  height = 120,
  strokeWidth = 3,
  markers = true,
  grid = false,
  live = false,
}: {
  /** one array of [lat, lon] per continuous segment */
  segments: LL[][];
  height?: number;
  strokeWidth?: number;
  markers?: boolean;
  grid?: boolean;
  /** live recording: the end marker pulses as "you are here" */
  live?: boolean;
}) {
  const all = segments.flat();
  const W = 320;
  const H = height;
  if (all.length < 2) {
    return <View style={[styles.box, { height }]} />;
  }
  // Equirectangular projection scaled by cos(lat) so shapes aren't squashed.
  const k = metresPerDegree(all[0][0]);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [la, lo] of all) {
    const x = lo * k.lon;
    const y = la * k.lat;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const pad = 14;
  const spanX = Math.max(maxX - minX, 30);
  const spanY = Math.max(maxY - minY, 30);
  const s = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanY);
  const ox = (W - spanX * s) / 2;
  const oy = (H - spanY * s) / 2;
  const px = ([la, lo]: LL) => {
    const x = ox + (lo * k.lon - minX) * s;
    const y = H - (oy + (la * k.lat - minY) * s);
    return [x, y] as const;
  };
  const first = px(all[0]);
  const last = px(all[all.length - 1]);

  return (
    <View style={[styles.box, { height }]}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        {grid &&
          Array.from({ length: 7 }, (_, i) => (
            <Line key={`v${i}`} x1={(i + 1) * (W / 8)} y1={0} x2={(i + 1) * (W / 8)} y2={H} stroke={colors.line} strokeWidth={1} />
          ))}
        {grid &&
          Array.from({ length: 3 }, (_, i) => (
            <Line key={`h${i}`} x1={0} y1={(i + 1) * (H / 4)} x2={W} y2={(i + 1) * (H / 4)} stroke={colors.line} strokeWidth={1} />
          ))}
        {segments.map((seg, i) =>
          seg.length > 1 ? (
            <Polyline
              key={i}
              points={seg.map((p) => px(p).map((v) => v.toFixed(1)).join(',')).join(' ')}
              fill="none"
              stroke={colors.accent}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null,
        )}
        {markers && <Circle cx={first[0]} cy={first[1]} r={strokeWidth + 2} fill={colors.success} stroke={colors.bg} strokeWidth={2} />}
        {markers && live && <Circle cx={last[0]} cy={last[1]} r={strokeWidth + 7} fill={colors.accent} opacity={0.25} />}
        {markers && <Circle cx={last[0]} cy={last[1]} r={strokeWidth + 2} fill={live ? colors.accent : colors.ink} stroke={colors.bg} strokeWidth={2} />}
      </Svg>
    </View>
  );
}

/** Split track points into per-segment [lat, lon] arrays (pauses break the line). */
export function segmentsOf(points: { lat: number; lon: number; seg: number }[]): LL[][] {
  const out: LL[][] = [];
  let cur: LL[] = [];
  let seg = points[0]?.seg ?? 0;
  for (const p of points) {
    if (p.seg !== seg) {
      if (cur.length) out.push(cur);
      cur = [];
      seg = p.seg;
    }
    cur.push([p.lat, p.lon]);
  }
  if (cur.length) out.push(cur);
  return out;
}

const styles = StyleSheet.create({
  box: { width: '100%', backgroundColor: colors.surfaceAlt, borderRadius: 14, overflow: 'hidden' },
});
