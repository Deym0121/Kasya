import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, fonts } from '../theme';
import type { FrontalSides } from '../gait/frontal';

const LEFT_TONE = '#1D9E75'; // teal — matches the left leg line
const RIGHT_TONE = '#FF5436'; // coral — matches the right leg line

function Side({ name, tone, liftPct, placementPct }: { name: string; tone: string; liftPct: number; placementPct: number }) {
  return (
    <View style={[styles.col, { borderColor: tone }]}>
      <View style={styles.head}>
        <View style={[styles.dot, { backgroundColor: tone }]} />
        <Text style={[styles.side, { color: tone }]}>{name}</Text>
      </View>
      <Text style={styles.val}>
        {liftPct}
        <Text style={styles.unit}> lift</Text>
      </Text>
      <Text style={styles.val}>
        {placementPct}
        <Text style={styles.unit}>% base</Text>
      </Text>
    </View>
  );
}

/** Honest left-vs-right rear read — foot lift + base placement. No pronation. */
export function LeftRightCompare({ sides }: { sides: FrontalSides }) {
  return (
    <View>
      <View style={styles.row}>
        <Side name="Left" tone={LEFT_TONE} liftPct={sides.left.liftPct} placementPct={sides.left.placementPct} />
        <View style={{ width: spacing.md }} />
        <Side name="Right" tone={RIGHT_TONE} liftPct={sides.right.liftPct} placementPct={sides.right.placementPct} />
      </View>
      <Text style={styles.caption}>
        Foot lift and base width are rough estimates from behind — comfort when you walk matters more than the
        exact numbers.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  col: { flex: 1, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  side: { fontFamily: fonts.bold, fontSize: 13, letterSpacing: 0.3 },
  val: { fontFamily: fonts.extra, fontSize: 20, color: colors.ink, marginTop: 2 },
  unit: { fontFamily: fonts.semibold, fontSize: 12, color: colors.muted },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: colors.muted, marginTop: spacing.md },
});
