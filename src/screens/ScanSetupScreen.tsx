import { useCallback, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../navigation';
import { colors, fonts, radius, spacing, type as T } from '../theme';
import { ScreenContainer, Button, Chip, Label } from '../components';
import { getPlan } from '../monetization/entitlements';
import { freeScansLeft, FREE_SCANS_PER_WEEK } from '../monetization/limits';
import { listReports } from '../storage/reports';

import { GOALS } from '../goals';

type Props = NativeStackScreenProps<RootStackParamList, 'ScanSetup'>;

export default function ScanSetupScreen({ navigation }: Props) {
  const [goal, setGoal] = useState('running');
  // null = still checking (or Premium): no banner, no gate
  const [allowance, setAllowance] = useState<{ left: number; nextFreeAt: Date | null } | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const plan = await getPlan().catch(() => 'free' as const);
        if (plan === 'premium') {
          if (alive) setAllowance(null);
          return;
        }
        const reports = await listReports().catch(() => []);
        if (alive) setAllowance(freeScansLeft(reports, new Date()));
      })();
      return () => {
        alive = false;
      };
    }, []),
  );

  const outOfScans = allowance?.left === 0;

  return (
    <ScreenContainer
      title="New scan"
      onBack={() => navigation.goBack()}
      footer={
        outOfScans ? (
          <Button label="Unlock unlimited scans" icon="unlock" variant="accent" onPress={() => navigation.navigate('Paywall')} />
        ) : (
          <Button
            label="Continue"
            iconRight="arrow-right"
            onPress={() => navigation.navigate('CameraGuide', { goal, view: 'side' })}
          />
        )
      }
    >
      <Label>Step 1 of 2 · Your goal</Label>
      <Text style={[T.h1, { marginTop: 4 }]}>What will you mostly use your shoes for?</Text>
      <Text style={[T.bodyMuted, { marginTop: spacing.xs, marginBottom: spacing.xl }]}>
        We tailor your shoe matches to this goal. Next: a quick 30-second camera scan of how you
        walk or run — no video is saved.
      </Text>

      {allowance && (
        <View style={[styles.allowance, outOfScans && styles.allowanceOut]}>
          <Text style={styles.allowanceTitle}>
            {outOfScans
              ? `You've used this week's ${FREE_SCANS_PER_WEEK} free scans`
              : `${allowance.left} of ${FREE_SCANS_PER_WEEK} free scans left this week`}
          </Text>
          <Text style={T.small}>
            {outOfScans
              ? `Your next free scan unlocks ${
                  allowance.nextFreeAt
                    ? allowance.nextFreeAt.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
                    : 'soon'
                } — or go Premium for unlimited scans.`
              : 'Premium includes unlimited scans.'}
          </Text>
        </View>
      )}

      <View style={styles.chips}>
        {GOALS.map((g) => (
          <Chip
            key={g.key}
            label={g.label}
            icon={g.icon}
            selected={goal === g.key}
            onPress={() => setGoal(g.key)}
          />
        ))}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  allowance: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: 2,
  },
  allowanceOut: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  allowanceTitle: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
});
