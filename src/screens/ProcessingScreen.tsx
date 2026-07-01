import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { colors, spacing, fonts } from '../theme';
import { analyzeGait, makeSyntheticWalk } from '../gait';
import { buildGaitReport } from '../storage/reportRecord';
import { saveReport } from '../storage/reports';

const STEPS = ['Detecting your body', 'Tracking your stride', 'Measuring cadence', 'Matching shoes'];

type Props = NativeStackScreenProps<RootStackParamList, 'Processing'>;

export default function ProcessingScreen({ navigation, route }: Props) {
  const { goal, frames } = route.params;
  const [step, setStep] = useState(0);
  const navigated = useRef(false);

  useEffect(() => {
    const ticker = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 600);
    (async () => {
      // Real captured frames if we have them; otherwise a synthetic walk so the
      // simulated path still produces a full report (metrics + graph + replay).
      const captured =
        frames && frames.length > 0
          ? frames
          : makeSyntheticWalk({ durationSec: 8, fps: 30, cadence: 150 + Math.round(Math.random() * 40) });
      const result = analyzeGait(captured);
      const id = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
      const record = buildGaitReport(result, goal, id, new Date().toISOString(), captured);
      await saveReport(record);
      setTimeout(() => {
        if (!navigated.current) {
          navigated.current = true;
          navigation.replace('Result', { report: record });
        }
      }, 1900);
    })();
    return () => clearInterval(ticker);
  }, [navigation, goal]);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.center}>
        <View style={styles.ring}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
        <Text style={styles.title}>Analyzing your stride</Text>
        <Text style={styles.step}>{STEPS[step]}…</Text>
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
  step: { fontFamily: fonts.regular, fontSize: 15, color: colors.muted, marginTop: spacing.sm },
});
