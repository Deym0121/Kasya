import { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { RootScreenProps } from '../navigation';
import { colors, spacing, type as T, fonts } from '../theme';
import { ScreenContainer, Button, TextField, Disclaimer } from '../components';
import { getLastEmail, getPlanFor, setOnboarded, setUser } from '../storage/session';
import { clearReports } from '../storage/reports';
import { resetAiUsage } from '../storage/aiQuota';
import { getReminderSettings, setReminderSettings } from '../storage/settings';
import { cancelRescanReminder } from '../notifications/reminders';

type Props = RootScreenProps<'SignIn'>;

export default function SignInScreen({ navigation }: Props) {
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function proceed() {
    const trimmed = email.trim() || 'demo@stridefit.app';
    const name = trimmed.split('@')[0] || 'Runner';
    // A different account shouldn't inherit the last user's scans, AI
    // allowance or reminder schedule — clear them. The same person returning
    // (any capitalization) keeps everything.
    const last = await getLastEmail();
    if (last && last.toLowerCase() !== trimmed.toLowerCase()) {
      const reminders = await getReminderSettings();
      await cancelRescanReminder(reminders.notificationId);
      await Promise.all([
        clearReports(),
        resetAiUsage(),
        setReminderSettings({ cadence: 'off', notificationId: null }),
      ]);
    }
    // Restore this email's plan from the entitlement map (it survives
    // sign-out) — re-login must never silently downgrade premium.
    const plan = await getPlanFor(trimmed);
    await setUser({ email: trimmed, name, plan });
    await setOnboarded(true);
    navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
  }

  return (
    <ScreenContainer
      onBack={() => navigation.goBack()}
      footer={
        <Button
          label={mode === 'signup' ? 'Create account' : 'Log in'}
          variant="accent"
          onPress={proceed}
        />
      }
    >
      <Text style={styles.brand}>StrideFit</Text>
      <Text style={[T.h1, { marginTop: spacing.sm }]}>
        {mode === 'signup' ? 'Create your account' : 'Welcome back'}
      </Text>
      <Text style={[T.bodyMuted, { marginTop: spacing.xs, marginBottom: spacing.xl }]}>
        {mode === 'signup' ? 'Start with a free gait scan.' : 'Log in to pick up where you left off.'}
      </Text>

      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="you@email.com"
        keyboardType="email-address"
        autoCapitalize="none"
        icon="mail"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        placeholder="••••••••"
        secureTextEntry
        icon="lock"
      />
      <Text style={styles.demoNote}>
        Demo mode — any email works and the password isn't checked. Real accounts come later.
      </Text>

      <Button label="Continue as guest" variant="ghost" onPress={proceed} />

      <Pressable onPress={() => setMode(mode === 'signup' ? 'login' : 'signup')} style={styles.switch}>
        <Text style={styles.switchText}>
          {mode === 'signup' ? 'Already have an account? Log in' : 'New here? Create an account'}
        </Text>
      </Pressable>

      <Disclaimer />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  brand: { fontFamily: fonts.extra, fontSize: 18, color: colors.accent, letterSpacing: -0.3 },
  demoNote: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: colors.muted, marginBottom: spacing.lg },
  switch: { marginTop: spacing.lg, alignItems: 'center' },
  switchText: { fontFamily: fonts.medium, fontSize: 15, color: colors.ink },
});
