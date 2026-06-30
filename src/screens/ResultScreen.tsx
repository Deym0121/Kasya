import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { colors, spacing, radius, type as T, fonts } from '../theme';
import { ScreenContainer, Button, Card, ConfidenceChip, IconBubble, Badge, Disclaimer } from '../components';
import { explainGait } from '../ai/explain';

type Props = NativeStackScreenProps<RootStackParamList, 'Result'>;

export default function ResultScreen({ navigation, route }: Props) {
  const { report } = route.params;
  const { result } = report;
  const q = result.captureQuality;

  // Show the built-in tip instantly; upgrade to the AI explanation if the
  // proxy is reachable. The app never blocks on or breaks without AI.
  const [tip, setTip] = useState(report.cadenceTip);
  const [aiOn, setAiOn] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    setAiLoading(true);
    explainGait(report, ctrl.signal)
      .then((t) => {
        setTip(t);
        setAiOn(true);
      })
      .catch(() => {})
      .finally(() => setAiLoading(false));
    return () => ctrl.abort();
  }, [report]);

  return (
    <ScreenContainer
      title="Your result"
      onBack={() => navigation.popToTop()}
      footer={
        <Button
          label="See shoe matches"
          icon="shopping-bag"
          onPress={() => navigation.navigate('ShoeMatches', { report })}
        />
      }
    >
      <View style={styles.hero}>
        <Text style={styles.kicker}>CADENCE</Text>
        <View style={styles.statRow}>
          <Text style={styles.big}>{Math.round(result.cadence.value)}</Text>
          <Text style={styles.unit}>spm</Text>
        </View>
        <ConfidenceChip confidence={result.cadence.confidence} />
      </View>

      <Card style={{ marginTop: spacing.lg }}>
        <View style={styles.head}>
          <IconBubble icon="message-circle" tint={colors.accentSoft} color={colors.accent} size={40} />
          <Text style={styles.cardTitle}>Coaching tip</Text>
          <View style={{ flex: 1 }} />
          {aiLoading ? (
            <ActivityIndicator color={colors.accent} />
          ) : aiOn ? (
            <Badge label="AI" tint={colors.ink} color="#fff" />
          ) : null}
        </View>
        <Text style={[T.body, { marginTop: spacing.md }]}>{tip}</Text>
      </Card>

      <Card style={{ marginTop: spacing.md }}>
        <View style={styles.head}>
          <IconBubble
            icon={q.ok ? 'check-circle' : 'alert-triangle'}
            tint={q.ok ? colors.successSoft : colors.warnSoft}
            color={q.ok ? colors.success : colors.warn}
            size={40}
          />
          <Text style={styles.cardTitle}>Capture quality</Text>
        </View>
        <Text style={[T.body, { marginTop: spacing.md }]}>
          {q.ok ? 'Good capture' : 'Could be better'} · {Math.round(q.visibilityScore * 100)}% visible ·{' '}
          {q.gaitCyclesDetected} cycles
        </Text>
        {q.issues.map((issue, i) => (
          <Text key={i} style={styles.issue}>
            • {issue}
          </Text>
        ))}
      </Card>

      <Disclaimer />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.ink, borderRadius: radius.lg, padding: spacing.xl },
  kicker: { fontFamily: fonts.semibold, fontSize: 12, letterSpacing: 1.4, color: colors.accent },
  statRow: { flexDirection: 'row', alignItems: 'baseline', marginVertical: spacing.sm },
  big: { fontFamily: fonts.extra, fontSize: 60, color: '#fff', letterSpacing: -1.5 },
  unit: { fontFamily: fonts.semibold, fontSize: 22, color: 'rgba(255,255,255,0.7)', marginLeft: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardTitle: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  issue: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.warn, marginTop: spacing.xs },
});
