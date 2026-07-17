import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { RootScreenProps } from '../navigation';
import { colors, spacing, radius, type as T, fonts } from '../theme';
import { Button, TextField, Disclaimer } from '../components';
import { getUser, setOnboarded, setUser } from '../storage/session';
import { isCloudEnabled, signUpWithEmail, signInWithEmail } from '../supabase/auth';
import { syncReports } from '../sync/reportSync';

type Props = RootScreenProps<'SignIn'>;
type Mode = 'signup' | 'login';

export default function SignInScreen({ navigation }: Props) {
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const cloud = isCloudEnabled();

  /** Mirror the identity locally and enter the app (works for cloud and guest). */
  async function enterApp(emailAddr: string) {
    const trimmed = emailAddr.trim() || 'demo@kasya.app';
    const name = trimmed.split('@')[0] || 'Runner';
    // Preserve an existing plan — re-login must never silently downgrade premium.
    const existing = await getUser();
    await setUser({ email: trimmed, name, plan: existing?.plan ?? 'free' });
    await setOnboarded(true);
    navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
  }

  /** Real Supabase auth when configured; the honest local demo otherwise. */
  async function proceed() {
    if (!cloud) return enterApp(email);
    const e = email.trim();
    if (!/.+@.+\..+/.test(e)) return setNotice({ tone: 'error', text: 'Enter a valid email address.' });
    if (password.length < 8) return setNotice({ tone: 'error', text: 'Password needs at least 8 characters.' });
    setBusy(true);
    setNotice(null);
    try {
      const res = mode === 'signup' ? await signUpWithEmail(e, password) : await signInWithEmail(e, password);
      if (!res.ok) {
        setNotice({ tone: 'error', text: res.error ?? 'Something went wrong — try again.' });
        return;
      }
      if (res.needsConfirmation) {
        setNotice({ tone: 'info', text: 'Almost there — tap the link in the email we just sent you, then log in here.' });
        setMode('login');
        return;
      }
      await enterApp(e);
      syncReports().catch(() => {}); // push any scans made before signing in
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <LinearGradient colors={[colors.ink, '#23252d']} style={styles.hero}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.back} accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="chevron-left" size={24} color={colors.onDark} />
        </Pressable>
        <View style={styles.brandRow}>
          <View style={styles.brandDot} />
          <Text style={styles.brand}>Kasya</Text>
        </View>
        <Text style={styles.heroTitle}>
          {mode === 'signup' ? 'Your stride,\nunderstood.' : 'Welcome\nback.'}
        </Text>
        <Text style={styles.heroSub}>
          {mode === 'signup' ? 'Create an account and take your first free gait scan.' : 'Log in to pick up where you left off.'}
        </Text>
      </LinearGradient>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetInner} keyboardShouldPersistTaps="handled">
          <View style={styles.segment} accessibilityRole="tablist">
            {(['signup', 'login'] as Mode[]).map((m) => (
              <Pressable
                key={m}
                onPress={() => setMode(m)}
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === m }}
                style={[styles.segmentBtn, mode === m && styles.segmentOn]}
              >
                <Text style={[styles.segmentText, mode === m && styles.segmentTextOn]}>
                  {m === 'signup' ? 'Create account' : 'Log in'}
                </Text>
              </Pressable>
            ))}
          </View>

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

          {notice && (
            <Text style={[styles.notice, notice.tone === 'error' ? { color: colors.danger } : { color: colors.success }]}>
              {notice.text}
            </Text>
          )}

          <Button
            label={busy ? 'One moment…' : mode === 'signup' ? 'Create account' : 'Log in'}
            variant="accent"
            loading={busy}
            onPress={proceed}
          />
          <View style={{ height: spacing.sm }} />
          <Button label="Continue as guest" variant="ghost" onPress={() => enterApp('')} />

          <View style={styles.demoNote}>
            <Feather name="info" size={14} color={colors.muted} style={{ marginTop: 2 }} />
            <Text style={styles.demoText}>
              {cloud
                ? 'Accounts back up your scan numbers only — never video. Guest mode keeps everything on this device.'
                : "Demo mode — any email works and the password isn't checked. Real accounts come later."}
            </Text>
          </View>

          <Disclaimer />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  hero: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  back: { width: 36, height: 36, justifyContent: 'center', marginLeft: -8 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.xs },
  brandDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  brand: { fontFamily: fonts.extra, fontSize: 18, color: colors.onDark, letterSpacing: -0.3 },
  heroTitle: {
    fontFamily: fonts.extra,
    fontSize: 34,
    lineHeight: 40,
    color: colors.onDark,
    letterSpacing: -0.7,
    marginTop: spacing.xl,
  },
  heroSub: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.onDarkMuted, marginTop: spacing.sm },
  sheet: {
    flex: 1,
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    marginTop: -radius.xl,
  },
  sheetInner: { padding: spacing.xl, paddingBottom: spacing.xxl },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    padding: 4,
    marginBottom: spacing.xl,
  },
  segmentBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentOn: { backgroundColor: colors.ink },
  segmentText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.muted },
  segmentTextOn: { color: colors.onDark },
  notice: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20, marginBottom: spacing.md },
  demoNote: { flexDirection: 'row', gap: 8, marginTop: spacing.lg },
  demoText: { flex: 1, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: colors.muted },
});
