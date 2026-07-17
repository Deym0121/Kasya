import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { RootScreenProps } from '../navigation';
import { colors, spacing, fonts } from '../theme';
import { analyzeGait, makeSyntheticWalk, makeSyntheticRearWalk } from '../gait';
import { buildGaitReport, GaitReportRecord } from '../storage/reportRecord';
import { saveReport } from '../storage/reports';
import { syncReports } from '../sync/reportSync';
import { tagPendingVideo, clearPendingVideo } from '../viz/videoHolder';
import { successHaptic } from '../haptics';
import { Button } from '../components';

const RING_R = 40;
const RING_C = 2 * Math.PI * RING_R;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type Props = RootScreenProps<'Processing'>;

export default function ProcessingScreen({ navigation, route }: Props) {
  const { goal, frames, frontalFrames } = route.params;
  const [phase, setPhase] = useState<'working' | 'done' | 'failed'>('working');
  const [ringP, setRingP] = useState(0);
  const navigated = useRef(false);

  useEffect(() => {
    let mounted = true;
    let raf = 0;
    let navTimer: ReturnType<typeof setTimeout> | undefined;

    // The real work — analysis is fast; a small minimum hold keeps the moment
    // legible without faking progress steps.
    const work = (async (): Promise<GaitReportRecord> => {
      const simulated = !frames || frames.length === 0;
      const captured = simulated
        ? makeSyntheticWalk({ durationSec: 8, fps: 30, cadence: 150 + Math.round(Math.random() * 40) })
        : frames!;
      // Rear view: real second pass if captured; on the simulated path, synthesize
      // one too so the demo shows the full two-angle analysis.
      const rear =
        frontalFrames && frontalFrames.length > 0
          ? frontalFrames
          : simulated
            ? makeSyntheticRearWalk({ durationSec: 8, fps: 30, cadence: 160 })
            : undefined;
      const result = analyzeGait(captured);
      const id = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
      const record = buildGaitReport(result, goal, id, new Date().toISOString(), captured, rear);
      await saveReport(record);
      syncReports().catch(() => {}); // cloud push is fire-and-forget; local save is the source of truth
      // Bind any opt-in clip to THIS report so its Review can show it (never saved
      // with the report); a simulated scan never has one.
      if (simulated) clearPendingVideo();
      else tagPendingVideo(id);
      return record;
    })();

    (async () => {
      try {
        const [record] = await Promise.all([work, sleep(1200)]);
        if (!mounted) return;
        setPhase('done');
        successHaptic();
        // Draw the success ring (~450ms), then hand over to the report.
        let start = 0;
        const tick = (ts: number) => {
          if (!mounted) return;
          if (!start) start = ts;
          const p = Math.min(1, (ts - start) / 450);
          setRingP(p);
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        navTimer = setTimeout(() => {
          if (!navigated.current && mounted) {
            navigated.current = true;
            navigation.replace('Result', { report: record });
          }
        }, 1150);
      } catch {
        if (mounted) setPhase('failed');
      }
    })();

    return () => {
      mounted = false;
      cancelAnimationFrame(raf);
      if (navTimer) clearTimeout(navTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, goal]);

  if (phase === 'failed') {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.center}>
          <View style={[styles.ring, { backgroundColor: colors.warnSoft }]}>
            <Feather name="alert-triangle" size={34} color={colors.warn} />
          </View>
          <Text style={styles.title}>We couldn't finish your analysis</Text>
          <Text style={styles.step}>Something went wrong while reading that capture. Nothing was saved.</Text>
          <View style={styles.errorButtons}>
            {/* Processing replaced PoseScan, so goBack lands on CameraGuide — the right re-entry. */}
            <Button label="Try again" icon="refresh-ccw" onPress={() => navigation.goBack()} />
            <View style={{ height: spacing.md }} />
            <Button label="Home" variant="ghost" onPress={() => navigation.popToTop()} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.center}>
        <View style={styles.ring}>
          {phase === 'working' ? (
            <ActivityIndicator size="large" color={colors.accent} />
          ) : (
            <>
              <Svg width={96} height={96} viewBox="0 0 96 96" style={StyleSheet.absoluteFill}>
                <Circle
                  cx={48}
                  cy={48}
                  r={RING_R}
                  stroke={colors.accent}
                  strokeWidth={4}
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${RING_C}`}
                  strokeDashoffset={RING_C * (1 - ringP)}
                  transform="rotate(-90 48 48)"
                />
              </Svg>
              {ringP >= 1 && <Feather name="check" size={36} color={colors.accent} />}
            </>
          )}
        </View>
        <Text style={styles.title}>{phase === 'working' ? 'Analyzing your stride' : 'Done'}</Text>
        <Text style={styles.step}>
          {phase === 'working'
            ? 'Reading the motion we captured — this stays on your device.'
            : 'Building your report…'}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  ring: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: fonts.bold, fontSize: 22, color: colors.ink, marginTop: spacing.xl, letterSpacing: -0.3 },
  step: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  errorButtons: { alignSelf: 'stretch', marginTop: spacing.xxl },
});
