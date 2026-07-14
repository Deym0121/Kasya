import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { RootScreenProps } from '../navigation';
import { colors, spacing, radius, type as T, fonts } from '../theme';
import {
  ScreenContainer,
  Button,
  Card,
  ConfidenceChip,
  IconBubble,
  Badge,
  Disclaimer,
  AnimatedNumber,
  Reveal,
  MetricGrid,
} from '../components';
import { explainGait } from '../ai/explain';
import { frontalSummary } from '../gait';
import { METRIC_INFO } from '../gait/metricInfo';

type Props = RootScreenProps<'Result'>;

export default function ResultScreen({ navigation, route }: Props) {
  const { report } = route.params;
  const { result } = report;
  const q = result.captureQuality;
  const frontal = report.frontal;
  const [cadenceInfo, setCadenceInfo] = useState(false);

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

  const qualityOk = q.ok && q.issues.length === 0;

  return (
    <ScreenContainer
      title="Your result"
      onBack={() => navigation.popToTop()}
      footer={
        <View style={styles.footerRow}>
          <View style={{ flex: 1 }}>
            <Button
              label="Shoe matches"
              icon="shopping-bag"
              onPress={() => navigation.navigate('ShoeMatches', { report })}
            />
          </View>
          <View style={{ width: spacing.sm }} />
          <View style={{ flex: 1 }}>
            <Button
              label="Share result"
              icon="share-2"
              variant="secondary"
              onPress={() => navigation.navigate('Share', { report })}
            />
          </View>
        </View>
      }
    >
      <Reveal>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <Text style={styles.kicker}>CADENCE</Text>
            <View style={styles.heroTopRight}>
              <Badge label={frontal ? 'Side + Rear' : 'Side view'} tint="rgba(255,255,255,0.14)" color="#fff" />
              <Pressable
                onPress={() => setCadenceInfo((v) => !v)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="What is cadence?"
                accessibilityState={{ expanded: cadenceInfo }}
                style={styles.infoBtn}
              >
                <Feather name="info" size={16} color={colors.onDarkMuted} />
              </Pressable>
            </View>
          </View>
          <View style={styles.statRow}>
            <AnimatedNumber value={Math.round(result.cadence.value)} delay={150} style={styles.big} />
            <Text style={styles.unit}>spm</Text>
          </View>
          <Text style={styles.unitCaption}>steps per minute</Text>
          <View style={{ height: spacing.sm }} />
          <ConfidenceChip confidence={result.cadence.confidence} />
        </View>
        {cadenceInfo && (
          <View style={styles.infoPanel}>
            <Text style={styles.infoTitle}>{METRIC_INFO.cadence.label}</Text>
            <Text style={[T.body, { marginTop: 2 }]}>{METRIC_INFO.cadence.plain}</Text>
            <Text style={[T.small, { marginTop: spacing.xs }]}>{METRIC_INFO.cadence.typical}</Text>
          </View>
        )}
      </Reveal>

      <Reveal delay={120}>
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
      </Reveal>

      {frontal ? (
        <Reveal delay={240}>
          <Card style={{ marginTop: spacing.md }}>
            <View style={styles.head}>
              <IconBubble icon="refresh-cw" tint={colors.accentSoft} color={colors.accent} size={40} />
              <Text style={styles.cardTitle}>Front & rear view</Text>
            </View>
            {frontal.quality.ok ? (
              <>
                <Text style={[T.body, { marginTop: spacing.md }]}>{frontalSummary(frontal.metrics)}</Text>
                <MetricGrid
                  columns={4}
                  items={[
                    { key: 'hipDrop', value: frontal.metrics.hipDropPct, unit: '' },
                    { key: 'baseWidth', value: frontal.metrics.stepWidthPct },
                    { key: 'sway', value: frontal.metrics.lateralSwayPct, unit: '' },
                    { key: 'rearSymmetry', value: frontal.metrics.symmetryPct },
                  ]}
                />
                {frontal.feedback.observations.map((o, i) => (
                  <Text key={i} style={styles.fObs}>
                    • {o}
                  </Text>
                ))}
              </>
            ) : (
              <Text style={[T.body, { marginTop: spacing.md, color: colors.warn }]}>
                {frontal.feedback.observations[0]}
              </Text>
            )}
          </Card>
        </Reveal>
      ) : null}

      <Reveal delay={frontal ? 360 : 240}>
        {qualityOk ? (
          <View style={styles.qualityRow}>
            <Feather name="check-circle" size={16} color={colors.success} />
            <Text style={styles.qualityText}>
              Good capture · {Math.round(q.visibilityScore * 100)}% visible · {q.gaitCyclesDetected} cycles
            </Text>
          </View>
        ) : (
          <Card style={{ marginTop: spacing.md }}>
            <View style={styles.head}>
              <IconBubble icon="alert-triangle" tint={colors.warnSoft} color={colors.warn} size={40} />
              <Text style={styles.cardTitle}>Capture quality</Text>
            </View>
            <Text style={[T.body, { marginTop: spacing.md }]}>
              Could be better · {Math.round(q.visibilityScore * 100)}% visible · {q.gaitCyclesDetected} cycles
            </Text>
            {q.issues.map((issue, i) => (
              <Text key={i} style={styles.issue}>
                • {issue}
              </Text>
            ))}
          </Card>
        )}
      </Reveal>

      <View style={{ height: spacing.lg }} />
      <Button
        label="Talk to your coach"
        icon="message-circle"
        onPress={() => navigation.navigate('Coach', { report })}
      />
      <View style={{ height: spacing.md }} />
      <Button
        label="Review & slow-mo"
        variant="secondary"
        icon="film"
        onPress={() => navigation.navigate('Review', { report })}
      />

      <Disclaimer />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  footerRow: { flexDirection: 'row', alignItems: 'center' },
  hero: { backgroundColor: colors.ink, borderRadius: radius.lg, padding: spacing.xl },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroTopRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  infoBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontFamily: fonts.semibold, fontSize: 12, letterSpacing: 1.4, color: colors.accent },
  statRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: spacing.sm },
  big: { fontFamily: fonts.extra, fontSize: 60, color: '#fff', letterSpacing: -1.5 },
  unit: { fontFamily: fonts.semibold, fontSize: 22, color: 'rgba(255,255,255,0.7)', marginLeft: 8 },
  unitCaption: { fontFamily: fonts.regular, fontSize: 13, color: colors.onDarkMuted, marginTop: 2 },
  infoPanel: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.sm,
  },
  infoTitle: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardTitle: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  issue: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.warn, marginTop: spacing.xs },
  fObs: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.inkSoft, marginTop: spacing.sm },
  qualityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.md,
  },
  qualityText: { fontFamily: fonts.medium, fontSize: 13, color: colors.inkSoft },
});
