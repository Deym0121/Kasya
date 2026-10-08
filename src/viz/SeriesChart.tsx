import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Line as SvgLine, Defs, LinearGradient, Stop } from 'react-native-svg';
import { colors, fonts, spacing } from '../theme';

/**
 * Area chart over distance for the activity detail (pace, elevation). Same
 * house style as TrendChart: 320-wide viewBox, labels as RN Text outside the
 * Svg. `invert` puts smaller values higher — faster pace reads as "up".
 */
export function SeriesChart({
  values,
  totalKm,
  height = 120,
  invert = false,
  color = colors.accent,
  format,
  caption,
}: {
  values: (number | null)[];
  totalKm: number;
  height?: number;
  invert?: boolean;
  color?: string;
  format: (v: number) => string;
  caption: string;
}) {
  const W = 320;
  const H = height;
  const pad = 6;
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (nums.length < 2) return null;

  // Clip outliers (a GPS hiccup can make one pace sample absurd).
  const sorted = nums.slice().sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];
  let lo = q(0.03);
  let hi = q(0.97);
  if (hi - lo < 1e-6) {
    lo -= 1;
    hi += 1;
  }
  const m = (hi - lo) * 0.12;
  lo -= m;
  hi += m;

  const n = values.length;
  const x = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => {
    const c = Math.min(hi, Math.max(lo, v));
    const u = (c - lo) / (hi - lo);
    return pad + (invert ? u : 1 - u) * (H - 2 * pad);
  };

  let line = '';
  let first = -1;
  let lastI = -1;
  values.forEach((v, i) => {
    if (v == null || !Number.isFinite(v)) return;
    line += `${first === -1 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
    if (first === -1) first = i;
    lastI = i;
  });
  const area = `${line} L${x(lastI).toFixed(1)},${H} L${x(first).toFixed(1)},${H} Z`;
  // label the same clipped range the line is drawn in
  const best = invert ? q(0.03) : q(0.97);
  const worst = invert ? q(0.97) : q(0.03);
  const gid = `g${caption.replace(/\W/g, '')}`;

  return (
    <View>
      <View style={styles.head}>
        <Text style={styles.caption}>{caption}</Text>
        <Text style={styles.range}>
          {format(worst)} – {format(best)}
        </Text>
      </View>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={0.35} />
            <Stop offset="1" stopColor={color} stopOpacity={0.02} />
          </LinearGradient>
        </Defs>
        <SvgLine x1={0} y1={H - 0.5} x2={W} y2={H - 0.5} stroke={colors.line} strokeWidth={1} />
        <Path d={area} fill={`url(#${gid})`} />
        <Path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      </Svg>
      <View style={styles.axis}>
        <Text style={styles.tick}>0 km</Text>
        <Text style={styles.tick}>{(totalKm / 2).toFixed(1)}</Text>
        <Text style={styles.tick}>{totalKm.toFixed(1)} km</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: spacing.xs },
  caption: { fontFamily: fonts.semibold, fontSize: 13, color: colors.ink },
  range: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  tick: { fontFamily: fonts.regular, fontSize: 11, color: colors.muted },
});
