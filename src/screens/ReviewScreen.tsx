import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { RootScreenProps } from '../navigation';
import { colors, spacing, radius, type as T, fonts } from '../theme';
import { ScreenContainer, Card, Button, IconBubble, Label, Disclaimer, MetricGrid } from '../components';
import { GaitGraph } from '../viz/GaitGraph';
import { SkeletonPlayer } from '../viz/SkeletonPlayer';
import { XraySkeleton } from '../viz/XraySkeleton';
import { VideoReplay } from '../viz/VideoReplay';
import { GaitCycleDiagram } from '../viz/GaitCycleDiagram';
import { LeftRightCompare } from '../viz/LeftRightCompare';
import { peekPendingVideo, clearPendingVideo } from '../viz/videoHolder';
import { typicalBand } from '../gait/metricInfo';
import { LANDMARK } from '../gait/types';

type Props = RootScreenProps<'Review'>;

/** Collapsible section header — conditional render, no LayoutAnimation (web-safe). */
function SectionToggle({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={{ marginTop: spacing.md }}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        style={styles.toggle}
      >
        <Text style={styles.toggleTitle}>{title}</Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.muted} />
      </Pressable>
      {open ? children : null}
    </View>
  );
}

export default function ReviewScreen({ navigation, route }: Props) {
  const { report } = route.params;
  const m = report.metrics;
  const fb = report.feedback;
  const g = report.graph;
  const frames = report.frames;
  const s = report.steps;
  const frontal = report.frontal;

  // Opt-in clip for THIS report (in memory only) — deleted when we leave Review.
  // Hooks live above the early return so they run on every render (rules of hooks).
  const [videoUri] = useState(() => peekPendingVideo(report.id));
  useEffect(() => () => clearPendingVideo(report.id), [report.id]);

  if (!frames || !frames.length || !m || !fb || !g) {
    return (
      <ScreenContainer title="Review" onBack={() => navigation.goBack()}>
        <Text style={[T.body, { marginTop: spacing.xl }]}>
          This scan doesn’t have motion data to review. Run a new scan to get the slow-mo replay,
          graph, and form feedback.
        </Text>
        <View style={{ height: spacing.xl }} />
        <Button label="Start a new scan" icon="camera" onPress={() => navigation.navigate('ScanSetup')} />
      </ScreenContainer>
    );
  }

  // Joints to glow in the X-ray replay — whatever the analysis flagged this scan.
  const flaggedJoints: number[] = [];
  const focusAreas: string[] = [];
  if (m.verticalOscillationPct >= 12) {
    flaggedJoints.push(LANDMARK.LEFT_HIP, LANDMARK.RIGHT_HIP);
    focusAreas.push('hips');
  }
  if (m.overstrideScore >= 65) {
    flaggedJoints.push(LANDMARK.LEFT_KNEE, LANDMARK.RIGHT_KNEE, LANDMARK.LEFT_ANKLE, LANDMARK.RIGHT_ANKLE);
    focusAreas.push('knees', 'ankles');
  }

  // The rear-view detail opens itself only when something there reads outside typical.
  const rearOutlier =
    !!frontal &&
    frontal.quality.ok &&
    (typicalBand('hipDrop', frontal.metrics.hipDropPct) === 'outside' ||
      typicalBand('baseWidth', frontal.metrics.stepWidthPct) === 'outside' ||
      typicalBand('sway', frontal.metrics.lateralSwayPct) === 'outside' ||
      typicalBand('rearSymmetry', frontal.metrics.symmetryPct) === 'outside');

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
      <Card>
        <View style={styles.head}>
          <IconBubble icon="eye" tint={colors.accentSoft} color={colors.accent} size={40} />
          <Text style={styles.cardTitle}>The big picture</Text>
        </View>
        {fb.observations.slice(0, 3).map((o, i) => (
          <Text key={i} style={styles.li}>
            • {o}
          </Text>
        ))}
        <Text style={styles.caption}>The full detail is below — tap any number for what it means.</Text>
      </Card>

      <View style={{ height: spacing.xl }} />
      <Label>{videoUri ? 'Your video · skeleton overlay' : 'Movement replay'}</Label>
      <View style={{ height: spacing.sm }} />
      {videoUri ? (
        <VideoReplay videoUri={videoUri} frames={frames} />
      ) : (
        <>
          <XraySkeleton frames={frames} flagged={flaggedJoints} />
          {focusAreas.length ? (
            <Text style={styles.caption}>
              The glowing joints ({focusAreas.join(', ')}) are where your movement stood out this scan — a spot to
              focus on, not a sign of injury.
            </Text>
          ) : (
            <Text style={styles.caption}>Your major joints are marked — this is a replay of the motion we captured.</Text>
          )}
        </>
      )}

      {report.walkthrough && report.walkthrough.length > 0 ? (
        <SectionToggle title="How your step works">
          <Card>
            {report.walkthrough.map((line, i) => (
              <Text key={i} style={styles.step}>
                {line}
              </Text>
            ))}
            <View style={{ height: spacing.lg }} />
            <GaitCycleDiagram />
          </Card>
        </SectionToggle>
      ) : null}

      <View style={{ height: spacing.xl }} />
      <Label>Your numbers</Label>
      <MetricGrid
        columns={3}
        items={[
          { key: 'cadence', value: Math.round(report.result.cadence.value) },
          ...(s ? [{ key: 'stepTime' as const, value: s.meanStepTimeSec.toFixed(2), raw: s.meanStepTimeSec }] : []),
          ...(s ? [{ key: 'stance' as const, value: s.stanceRatioPct }] : []),
          { key: 'bounce', value: m.verticalOscillationPct },
          { key: 'overstride', value: m.overstrideScore },
          { key: 'rhythm', value: m.rhythmRegularityPct },
          { key: 'symmetry', value: m.symmetryPct },
          { key: 'kneeBend', value: m.kneeFlexionRangeDeg },
        ]}
      />
      {s && s.leadFoot !== 'unknown' ? (
        <Text style={styles.caption}>Leading foot this scan: {s.leadFoot}.</Text>
      ) : null}

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

      {frontal && frontal.quality.ok ? (
        <SectionToggle title="Rear view · left & right" defaultOpen={rearOutlier}>
          {report.frontalFrames && report.frontalFrames.length ? (
            <>
              <View style={{ height: spacing.sm }} />
              <SkeletonPlayer frames={report.frontalFrames} alignment />
              <Text style={styles.caption}>The teal line is your left leg, coral is your right — how each tracks from behind.</Text>
            </>
          ) : null}
          {frontal.sides ? (
            <View style={{ marginTop: spacing.md }}>
              <LeftRightCompare sides={frontal.sides} />
            </View>
          ) : null}
          <View style={{ height: spacing.md }} />
          <MetricGrid
            columns={4}
            items={[
              { key: 'hipDrop', value: frontal.metrics.hipDropPct, unit: '' },
              { key: 'baseWidth', value: frontal.metrics.stepWidthPct },
              { key: 'sway', value: frontal.metrics.lateralSwayPct, unit: '' },
              { key: 'rearSymmetry', value: frontal.metrics.symmetryPct },
            ]}
          />
          <Card style={{ marginTop: spacing.md }}>
            <View style={styles.head}>
              <IconBubble icon="refresh-cw" tint={colors.accentSoft} color={colors.accent} size={40} />
              <Text style={styles.cardTitle}>From behind</Text>
            </View>
            {frontal.feedback.observations.map((o, i) => (
              <Text key={i} style={styles.li}>
                • {o}
              </Text>
            ))}
            {frontal.feedback.recommendations.map((r, i) => (
              <Text key={`r${i}`} style={styles.li}>
                • {r}
              </Text>
            ))}
          </Card>
        </SectionToggle>
      ) : null}

      <Disclaimer />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: colors.muted, marginTop: spacing.sm },
  step: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.inkSoft, marginTop: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardTitle: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  li: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.inkSoft, marginTop: spacing.sm },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    marginBottom: spacing.sm,
  },
  toggleTitle: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
});
