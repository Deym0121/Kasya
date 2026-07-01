import { View, Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { colors, spacing, type as T, fonts } from '../theme';
import { ScreenContainer, Card, Button, IconBubble, Label, Disclaimer } from '../components';
import { GaitGraph } from '../viz/GaitGraph';
import { SkeletonPlayer } from '../viz/SkeletonPlayer';

type Props = NativeStackScreenProps<RootStackParamList, 'Review'>;

function Metric({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricVal}>
        {value}
        {unit ? <Text style={styles.metricUnit}> {unit}</Text> : null}
      </Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

export default function ReviewScreen({ navigation, route }: Props) {
  const { report } = route.params;
  const m = report.metrics;
  const fb = report.feedback;
  const g = report.graph;
  const frames = report.frames;

  if (!frames || !frames.length || !m || !fb || !g) {
    return (
      <ScreenContainer title="Review" onBack={() => navigation.goBack()}>
        <Text style={[T.body, { marginTop: spacing.xl }]}>
          This scan doesn’t have motion data to review. Run a new scan to get the slow-mo replay,
          graph, and form feedback.
        </Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      title="Review & slow-mo"
      onBack={() => navigation.goBack()}
      footer={
        <Button
          label="See shoe matches"
          icon="shopping-bag"
          onPress={() => navigation.navigate('ShoeMatches', { report })}
        />
      }
    >
      <Label>Slow-mo replay</Label>
      <View style={{ height: spacing.sm }} />
      <SkeletonPlayer frames={frames} />

      <View style={{ height: spacing.xl }} />
      <Label>Your numbers</Label>
      <View style={styles.metrics}>
        <Metric label="Cadence" value={Math.round(report.result.cadence.value)} unit="spm" />
        <Metric label="Bounce" value={m.verticalOscillationPct} unit="%" />
        <Metric label="Overstride" value={m.overstrideScore} unit="/100" />
        <Metric label="Rhythm" value={m.rhythmRegularityPct} unit="%" />
        <Metric label="Symmetry" value={m.symmetryPct} unit="%" />
        <Metric label="Knee bend" value={m.kneeFlexionRangeDeg} unit="°" />
      </View>

      <Card style={{ marginTop: spacing.lg }}>
        <Label>Step rhythm graph</Label>
        <View style={{ height: spacing.sm }} />
        <GaitGraph signal={g.signal} steps={g.steps} />
        <Text style={styles.caption}>Each tick is a detected step — even spacing means steady rhythm.</Text>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <View style={styles.head}>
          <IconBubble icon="activity" tint={colors.accentSoft} color={colors.accent} size={40} />
          <Text style={styles.cardTitle}>What’s happening</Text>
        </View>
        <Text style={[T.body, { marginTop: spacing.md }]}>{fb.summary}</Text>
        {fb.observations.map((o, i) => (
          <Text key={i} style={styles.li}>
            • {o}
          </Text>
        ))}
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <View style={styles.head}>
          <IconBubble icon="target" tint={colors.successSoft} color={colors.success} size={40} />
          <Text style={styles.cardTitle}>Recommendations</Text>
        </View>
        {fb.recommendations.map((r, i) => (
          <Text key={i} style={styles.li}>
            • {r}
          </Text>
        ))}
      </Card>

      <Disclaimer />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  metrics: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm },
  metric: { width: '33.33%', paddingVertical: spacing.md },
  metricVal: { fontFamily: fonts.extra, fontSize: 24, color: colors.ink },
  metricUnit: { fontFamily: fonts.semibold, fontSize: 13, color: colors.muted },
  metricLabel: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted, marginTop: 2 },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: colors.muted, marginTop: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardTitle: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  li: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.inkSoft, marginTop: spacing.sm },
});
