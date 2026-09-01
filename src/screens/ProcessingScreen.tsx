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
import { rescheduleAfterScan } from '../notifications/reminders';
import { successHaptic } from '../haptics';
import { Button } from '../components';

const RING_R = 40;
const RING_C = 2 * Math.PI * RING_R;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type Props = RootScreenProps<'Processing'>;

export default function ProcessingScreen({ navigation, route }: Props) {
  const { goal, frames, frontalFrames } = route.params;
  // No side capture means a demo run — the copy below must say so, and the
  // report is built from synthetic frames.
  const simulated = !frames || frames.length === 0;
  const [phase, setPhase] = useState<'working' | 'done' | 'failed'>('working');
  const [ringP, setRingP] = useState(0);
  const navigated = useRef(false);

  useEffect(() => {
    let mounted = true;
    let raf = 0;
    let navTimer: ReturnType<typeof setTimeout> | undefined;

    // The real work — analysis is fast; a small minimum hold keeps the moment
    // legible without faking progress steps. Nothing persists until the hold
    // has elapsed, so it doubles as the back-out window.
    const hold = sleep(1200);
    const work = (async (): Promise<GaitReportRecord> => {
      const hasRear = !!frontalFrames && frontalFrames.length > 0;
      // A rear pass with no side capture shouldn't be reachable — if it is,
      // fail honestly rather than pairing the real rear view with an invented
      // side walk presented as real.
      if (simulated && hasRear) throw new Error('rear view without a side capture');
      const captured = simulated
        ? makeSyntheticWalk({ durationSec: 8, fps: 30, cadence: 150 + Math.round(Math.random() * 40) })
        : frames!;
      // Rear view: real second pass if captured; on the simulated path, synthesize
      // one too so the demo shows the full two-angle analysis.
      const rear = hasRear
        ? frontalFrames
        : simulated
          ? makeSyntheticRearWalk({ durationSec: 8, fps: 30, cadence: 160 })
          : undefined;
      const result = analyzeGait(captured);
      const id = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
      const record = buildGaitReport(result, goal, id, new Date().toISOString(), captured, rear, simulated);
      await hold;
      if (!mounted) {
        // Backed out during the hold — a cancelled Processing saves nothing.
        clearPendingVideo();
        throw new Error('cancelled');
      }
      await saveReport(record);
      syncReports().catch(() => {}); // cloud push is fire-and-forget; local save is the source of truth
      rescheduleAfterScan().catch(() => {}); // also fire-and-forget — a reminder hiccup must not fail the scan
      // Bind any opt-in clip to THIS report so its Review can show it (never saved
      // with the report); a simulated scan never has one.
      if (simulated) clearPendingVideo();
      else tagPendingVideo(id);
      return record;
    })();

    (async () => {
      try {
        const record = await work; // the minimum hold is folded into work
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
            // Rebase the stack under the report so back from Result lands on
            // Tabs, not the mid-flow capture screens.
            navigation.reset({ index: 1, routes: [{ name: 'Tabs' }, { name: 'Result', params: { report: record } }] });
          }
        }, 1150);
      } catch {
        // A failed (or cancelled) run must not leave a clip waiting to attach
        // to some later report.
        clearPendingVideo();
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
        <Text style={styles.title}>
          {phase === 'working' ? (simulated ? 'Preparing your demo' : 'Analyzing your stride') : 'Done'}
        </Text>
        <Text style={styles.step}>
          {phase === 'working'
            ? simulated
              ? 'Building a sample report from demo walking data — it will be marked DEMO, not a reading of your own gait.'
              : 'Reading the motion we captured — this stays on your device.'
            : 'Opening your report'}
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
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.line,
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
