import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline, Circle, G } from 'react-native-svg';
import { colors, fonts, spacing, radius } from '../theme';

/**
 * Educational diagram of one walking gait cycle — the phases every step moves
 * through. General biomechanics, not a per-user measurement. Each phase draws a
 * little leg pose (hip → knee → ankle → toe) so it reads like a walk sequence.
 */

// Per-phase joint offsets from the hip (x right, y down), in glyph units.
const PHASES = [
  { label: 'Heel strike', knee: [6, 34], ankle: [14, 66], toe: [22, 60], stance: true },
  { label: 'Foot flat', knee: [2, 34], ankle: [6, 68], toe: [20, 70], stance: true },
  { label: 'Midstance', knee: [0, 34], ankle: [0, 68], toe: [14, 70], stance: true },
  { label: 'Push-off', knee: [-6, 34], ankle: [-12, 64], toe: [2, 72], stance: true },
  { label: 'Swing', knee: [9, 30], ankle: [3, 52], toe: [16, 54], stance: false },
];

const COL_W = 68;
const H = 96;
const HIP_Y = 12;
const W = COL_W * PHASES.length;

export function GaitCycleDiagram() {
  return (
    <View>
      <View style={styles.bar}>
        <View style={[styles.seg, styles.stanceSeg, { flex: 62 }]}>
          <Text style={styles.segText}>Stance ~60%</Text>
        </View>
        <View style={[styles.seg, styles.swingSeg, { flex: 38 }]}>
          <Text style={[styles.segText, { color: colors.accentInk }]}>Swing ~40%</Text>
        </View>
      </View>

      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        {PHASES.map((p, i) => {
          const cx = i * COL_W + COL_W / 2;
          const hx = cx;
          const stroke = p.stance ? colors.accent : colors.accentInk;
          const pts = `${hx},${HIP_Y} ${hx + p.knee[0]},${HIP_Y + p.knee[1]} ${hx + p.ankle[0]},${HIP_Y + p.ankle[1]} ${hx + p.toe[0]},${HIP_Y + p.toe[1]}`;
          return (
            <G key={p.label}>
              <Polyline points={pts} fill="none" stroke={stroke} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
              <Circle cx={hx} cy={HIP_Y} r={3} fill={colors.ink} />
              <Circle cx={hx + p.knee[0]} cy={HIP_Y + p.knee[1]} r={2.5} fill={colors.ink} />
              <Circle cx={hx + p.ankle[0]} cy={HIP_Y + p.ankle[1]} r={2.5} fill={colors.ink} />
            </G>
          );
        })}
      </Svg>

      <View style={styles.labels}>
        {PHASES.map((p) => (
          <Text key={p.label} style={styles.label}>
            {p.label}
          </Text>
        ))}
      </View>

      <Text style={styles.caption}>
        Every step cycles through these phases — a rough map of what's happening, not a measurement of your walk.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', height: 26, borderRadius: radius.sm, overflow: 'hidden', marginBottom: spacing.md },
  seg: { alignItems: 'center', justifyContent: 'center' },
  stanceSeg: { backgroundColor: colors.surfaceAlt },
  swingSeg: { backgroundColor: colors.accentSoft },
  segText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.muted },
  labels: { flexDirection: 'row', marginTop: spacing.xs },
  label: { flex: 1, textAlign: 'center', fontFamily: fonts.medium, fontSize: 10, color: colors.muted },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: colors.muted, marginTop: spacing.md },
});
