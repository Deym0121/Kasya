import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline, Line as SvgLine, Circle } from 'react-native-svg';
import { colors, fonts, spacing } from '../theme';
import type { TrendPoint } from '../gait/progress';

/**
 * Progress-over-time chart for the History tab. Follows the GaitGraph house
 * conventions (320-wide viewBox, accent polyline, labels as RN Text outside the
 * Svg). X spacing is index-based — one even slot per scan — so sparse or
 * irregular scan dates never clump.
 */
export function TrendChart({
  points,
  height = 130,
  unit,
}: {
  points: TrendPoint[];
  height?: number;
  unit?: string;
}) {
  const W = 320;
  const H = height;
  const pad = 12;

  if (!points || points.length === 0) {
    return <Text style={styles.empty}>No scans to chart yet.</Text>;
  }

  const n = points.length;
  const values = points.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  // Flat-line / single-point guard: give the domain some air.
  const m = Math.max(2, 0.05 * (max - min));
  min -= m;
  max += m;

  const x = (i: number) => (n === 1 ? W / 2 : pad + (i / (n - 1)) * (W - 2 * pad));
  const y = (v: number) => H - pad - ((v - min) / (max - min)) * (H - 2 * pad);
  const pts = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString();

  return (
    <View>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <SvgLine x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke={colors.line} strokeWidth={1} />
        {n > 1 && <Polyline points={pts} fill="none" stroke={colors.accent} strokeWidth={2.5} />}
        {points.map((p, i) => (
          <Circle
            key={i}
            cx={x(i)}
            cy={y(p.value)}
            r={i === n - 1 ? 5 : 3.5}
            fill={i === n - 1 ? colors.accent : colors.ink}
          />
        ))}
      </Svg>
      <View style={styles.datesRow}>
        <Text style={styles.date}>{fmtDate(points[0].t)}</Text>
        {n > 1 ? <Text style={styles.date}>{fmtDate(points[n - 1].t)}</Text> : null}
      </View>
      {n === 1 ? (
        <Text style={styles.nudge}>Scan again to see your trend{unit ? ` in ${unit}` : ''}.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { fontFamily: fonts.regular, color: colors.muted, fontSize: 14 },
  datesRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  date: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  nudge: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, marginTop: spacing.sm },
});
