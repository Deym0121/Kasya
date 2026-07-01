import { Text, StyleSheet } from 'react-native';
import Svg, { Polyline, Line as SvgLine } from 'react-native-svg';
import { colors, fonts } from '../theme';

/**
 * The saved gait graph: the ankle-separation signal over time with a tick at
 * each detected step. Even spacing = steady rhythm. Drawn from saved data (no video).
 */
export function GaitGraph({
  signal,
  steps,
  height = 130,
}: {
  signal: number[];
  steps: number[];
  height?: number;
}) {
  const W = 320;
  const H = height;
  const pad = 10;
  if (!signal || signal.length < 2) {
    return <Text style={styles.empty}>No motion data to graph.</Text>;
  }
  const n = signal.length;
  const x = (i: number) => pad + (i / (n - 1)) * (W - 2 * pad);
  const y = (v: number) => H - pad - Math.max(0, Math.min(1, v)) * (H - 2 * pad);
  const pts = signal.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <SvgLine x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke={colors.line} strokeWidth={1} />
      {steps.map((si, k) => (
        <SvgLine
          key={k}
          x1={x(si)}
          y1={H - pad}
          x2={x(si)}
          y2={y(signal[si] ?? 0)}
          stroke={colors.ink}
          strokeWidth={1.5}
        />
      ))}
      <Polyline points={pts} fill="none" stroke={colors.accent} strokeWidth={2.5} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  empty: { fontFamily: fonts.regular, color: colors.muted, fontSize: 14 },
});
