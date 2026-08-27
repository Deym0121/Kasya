import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { RootScreenProps } from '../navigation';
import { colors, spacing, radius, fonts } from '../theme';
import { Button, TextField } from '../components';
import { getLastEmail, getPlanFor, setOnboarded, setUser } from '../storage/session';
import {
  isCloudEnabled,
  signUpWithEmail,
  signInWithEmail,
  signInWithProvider,
  currentUserEmail,
  OAuthProvider,
} from '../convex/auth';
import { syncReports } from '../sync/reportSync';
import { clearReports } from '../storage/reports';
import { resetAiUsage } from '../storage/aiQuota';
import { getReminderSettings, setReminderSettings } from '../storage/settings';
import { cancelRescanReminder } from '../notifications/reminders';

type Props = RootScreenProps<'SignIn'>;
type Mode = 'signup' | 'login';

// Social sign-in is STAGED on Convex Auth — flip these once the Google/Apple
// providers are configured in convex/auth.ts. Apple must be '1' on iOS builds
// that ship social login (App Review guideline 4.8).
// Literal process.env.EXPO_PUBLIC_* reads — Expo inlines exactly this dot form
// at bundle time; indirect reads are undefined in production builds.
const GOOGLE_SIGNIN_ENABLED = process.env.EXPO_PUBLIC_GOOGLE_SIGNIN === '1';
const APPLE_SIGNIN_ENABLED = process.env.EXPO_PUBLIC_APPLE_SIGNIN === '1';

export default function SignInScreen({ navigation }: Props) {
  // On narrow phones the walker art and the 34px title can't share the hero
  // width — scale both down so the title never wraps mid-word.
  const { width } = useWindowDimensions();
  const compact = width < 420;
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const cloud = isCloudEnabled();

  /** Mirror the identity locally and enter the app (works for cloud and guest). */
  async function enterApp(emailAddr: string) {
    // 'demo@kasya.app' is the guest SENTINEL (a storage key — changing it
    // would orphan existing guests' local data); users only ever see "Guest".
    const trimmed = emailAddr.trim() || 'demo@kasya.app';
    const name = trimmed === 'demo@kasya.app' ? 'Guest' : trimmed.split('@')[0] || 'Runner';
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

  // Completes the web OAuth return (and any restored session): if Supabase
  // already has a signed-in user when this screen mounts, walk straight in.
  useEffect(() => {
    if (!cloud) return;
    let active = true;
    currentUserEmail().then((e) => {
      if (active && e) enterApp(e).then(() => syncReports().catch(() => {}));
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Google / Apple via Convex Auth. On web, Google navigates away and back. */
  async function social(provider: OAuthProvider) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await signInWithProvider(provider);
      if (!res.ok) {
        // Empty error = the user cancelled the sheet/browser — say nothing.
        if (res.error) setNotice({ tone: 'error', text: res.error });
        return;
      }
      // Native resolves with a live session; web resolves by redirecting away.
      const e = (await currentUserEmail()) ?? res.email ?? null;
      if (e) {
        await enterApp(e);
        syncReports().catch(() => {});
      }
    } finally {
      setBusy(false);
    }
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
      <LinearGradient colors={[colors.surfaceAlt, '#101114']} style={styles.hero}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.back} accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="chevron-left" size={24} color={colors.onDark} />
        </Pressable>
        <View style={styles.brandRow}>
          <View style={styles.brandDot} />
          <Text style={styles.brand}>Kasya</Text>
        </View>
        <View style={styles.heroText}>
          <Text style={[styles.heroTitle, compact && styles.heroTitleCompact]}>
            {mode === 'signup' ? 'Your stride,\nunderstood.' : 'Welcome\nback.'}
          </Text>
          <Text style={styles.heroSub}>
            {mode === 'signup' ? 'Create an account and take your first free gait scan.' : 'Log in to pick up where you left off.'}
          </Text>
        </View>
        <View style={styles.heroGlow} pointerEvents="none" />
        <Image
          source={require('../../assets/art/auth-hero.webp')}
          style={[styles.heroArt, compact && styles.heroArtCompact]}
          resizeMode="contain"
          accessible={false}
        />
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

          {/* App Review 4.8: on iOS, Google may only ship when Apple sign-in
              also ships — the coupling lives HERE, not in the env flags. Apple
              is iOS-only (native sheet); Google alone is fine on Android/web.
              The Apple button follows the HIG: Apple logo glyph, no other
              icons, "Continue with Apple" wording. */}
          {cloud &&
            (() => {
              const showApple = Platform.OS === 'ios' && APPLE_SIGNIN_ENABLED;
              const showGoogle = GOOGLE_SIGNIN_ENABLED && (Platform.OS !== 'ios' || showApple);
              if (!showApple && !showGoogle) return null;
              return (
                <>
                  {showApple && (
                    <Pressable
                      onPress={() => social('apple')}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityLabel="Continue with Apple"
                      style={({ pressed }) => [styles.socialBtn, styles.socialApple, pressed && { opacity: 0.9 }]}
                    >
                      <Text style={styles.appleLogo}></Text>
                      <Text style={[styles.socialText, { color: '#FFFFFF' }]}>Continue with Apple</Text>
                    </Pressable>
                  )}
                  {showGoogle && (
                    <Pressable
                      onPress={() => social('google')}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityLabel="Continue with Google"
                      style={({ pressed }) => [styles.socialBtn, pressed && { opacity: 0.9 }]}
                    >
                      <Text style={styles.socialG}>G</Text>
                      <Text style={styles.socialText}>Continue with Google</Text>
                    </Pressable>
                  )}
                  <View style={styles.orRow}>
                    <View style={styles.orLine} />
                    <Text style={styles.orText}>or use email</Text>
                    <View style={styles.orLine} />
                  </View>
                </>
              );
            })()}

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

          <Image
            source={require('../../assets/art/auth-footer.webp')}
            style={styles.footArt}
            resizeMode="contain"
            accessible={false}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  hero: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.xxl + spacing.md, overflow: 'hidden' },
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
  /** text column stays clear of the walker art anchored to the right */
  heroText: { maxWidth: '58%' },
  heroTitleCompact: { fontSize: 28, lineHeight: 34, letterSpacing: -0.5 },
  heroArt: {
    position: 'absolute',
    right: 18,
    // keep the walker's feet + glow trail clear of the sheet's rounded top,
    // which overlaps the hero by radius.xl
    bottom: radius.xl + 6,
    width: 216,
    height: 176, // art is 569x463 — keep its ratio (RNW ignores aspectRatio here)
    pointerEvents: 'none',
  },
  heroArtCompact: { width: 150, height: 122 },
  heroGlow: {
    position: 'absolute',
    right: -50,
    bottom: -50,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(255,77,13,0.10)',
  },
  footArt: { width: '100%', height: 150, marginTop: spacing.lg },
  sheet: {
    flex: 1,
    backgroundColor: colors.surface,
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
  segmentTextOn: { color: colors.bg },
  notice: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20, marginBottom: spacing.md },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    // Deliberate literal: Google-brand white button on a dark theme (dark text set below).
    backgroundColor: '#FFFFFF',
    marginBottom: spacing.sm,
  },
  // Deliberate literals: Apple HIG mandates a white sign-in button with black
  // logo/text on dark backgrounds (fg overridden inline to #000000).
  // HIG "Sign in with Apple" black style: black fill, white logo + label.
  socialApple: { backgroundColor: '#000000', borderColor: '#000000' },
  appleLogo: { fontSize: 18, color: '#FFFFFF', marginTop: -2 },
  socialG: { fontFamily: fonts.extra, fontSize: 17, color: '#4285F4' },
  socialText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.bg },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginVertical: spacing.lg },
  orLine: { flex: 1, height: 1, backgroundColor: colors.line },
  orText: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.8 },
});
