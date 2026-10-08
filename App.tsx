import { Component, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Platform, Pressable } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import * as SecureStore from 'expo-secure-store';
import { fontMap, colors } from './src/theme';
import { RootStackParamList } from './src/navigation';
import { getOnboarded, getUser, setUser, setOnboarded } from './src/storage/session';
import { getConvex } from './src/convex/client';
import { AuthActionsBridge } from './src/convex/authBridge';
import { currentUserEmail } from './src/convex/auth';
import { syncReports } from './src/sync/reportSync';
import MainTabs from './src/MainTabs';
import OnboardingScreen from './src/screens/OnboardingScreen';
import SignInScreen from './src/screens/SignInScreen';
import ScanSetupScreen from './src/screens/ScanSetupScreen';
import CameraGuideScreen from './src/screens/CameraGuideScreen';
import PoseScanScreen from './src/screens/PoseScanScreen';
import ProcessingScreen from './src/screens/ProcessingScreen';
import ResultScreen from './src/screens/ResultScreen';
import ReviewScreen from './src/screens/ReviewScreen';
import CoachScreen from './src/screens/CoachScreen';
import ShoeMatchesScreen from './src/screens/ShoeMatchesScreen';
import ShareCardScreen from './src/screens/ShareCardScreen';
import PaywallScreen from './src/screens/PaywallScreen';
import RaceDetailScreen from './src/screens/RaceDetailScreen';
import RaceSubmitScreen from './src/screens/RaceSubmitScreen';
import RaceAdminScreen from './src/screens/RaceAdminScreen';
import RecordScreen from './src/screens/RecordScreen';
import ActivityDetailScreen from './src/screens/ActivityDetailScreen';
import ActivityShareScreen from './src/screens/ActivityShareScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.surface, primary: colors.accent },
};

// Convex Auth session storage: OS keychain on device, localStorage on web.
const secureStorage = {
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  removeItem: SecureStore.deleteItemAsync,
};

/**
 * Last-resort boundary around the whole app: any render-time throw shows a
 * branded retry screen instead of a black void (App Review 2.1(a) — build #8
 * black-screened when the Convex client threw during the first render).
 * Deliberately styled with plain values only — theme/font loading may be the
 * very thing that failed.
 */
class RootErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown) {
    console.warn('[Kasya] root render error', error);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.crash}>
          <Text style={styles.crashBrand}>Kasya</Text>
          <Text style={styles.crashText}>Something went wrong while starting up.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => this.setState({ error: null })}
            style={styles.crashBtn}
          >
            <Text style={styles.crashBtnText}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function Root() {
  return (
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  );
}

function App() {
  const [fontsLoaded, fontError] = useFonts(fontMap);
  const [fontTimedOut, setFontTimedOut] = useState(false);
  const [ready, setReady] = useState(false);
  const [initial, setInitial] = useState<'Onboarding' | 'Tabs'>('Onboarding');

  useEffect(() => {
    (async () => {
      // Demo tour helper (web only): opening the site with ?demo=1 seeds a
      // premium account with a finished two-angle scan, so the whole app can be
      // toured from any phone browser — no camera, no devtools console needed.
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location.search.includes('demo=1')) {
        try {
          const res = await fetch('/demo-report.seed.json');
          if (res.ok) {
            window.localStorage.setItem('kasya:reports:v1', await res.text());
            window.localStorage.setItem('kasya:onboarded:v1', '1');
            window.localStorage.setItem(
              'kasya:user:v1',
              JSON.stringify({ email: 'demo@kasya.app', name: 'Demo', plan: 'premium' }),
            );
          }
        } catch {
          // no seed available — fall through to the normal boot
        }
        window.location.replace(window.location.pathname); // drop the param and reboot seeded
        return;
      }
      try {
        // The cloud session read must never hold the splash hostage: if Convex
        // is slow/unreachable, proceed as a local session after 4s — the claim
        // logic re-runs on the next boot.
        const cloudEmailWithTimeout = Promise.race<string | null>([
          currentUserEmail(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
        ]);
        const [ob, cloudEmail] = await Promise.all([getOnboarded(), cloudEmailWithTimeout]);
        // A live cloud session (e.g. returning from the Google/Apple redirect on a
        // fresh browser) walks straight in — claim it locally first.
        if (cloudEmail && !ob) {
          const existing = await getUser();
          await setUser({
            email: cloudEmail,
            name: cloudEmail.split('@')[0] || 'Runner',
            plan: existing?.plan ?? 'free',
          });
          await setOnboarded(true);
        }
        if (cloudEmail) syncReports().catch(() => {});
        setInitial(ob || cloudEmail ? 'Tabs' : 'Onboarding');
      } catch {
        setInitial('Onboarding'); // unreadable session → start fresh
      } finally {
        setReady(true); // the splash must never wait on a failed read
      }
    })();
  }, []);

  // Never hang the splash on fonts: proceed with system fonts after 5s.
  useEffect(() => {
    const t = setTimeout(() => setFontTimedOut(true), 5000);
    return () => clearTimeout(t);
  }, []);

  // Loaded, failed, or timed out all count as settled — a broken font file
  // should degrade to system fonts, not block the whole app.
  const fontsSettled = fontsLoaded || !!fontError || fontTimedOut;

  // With cloud configured the whole app lives inside ConvexAuthProvider so the
  // session restores/attaches to the shared client; without it, plain local app.
  const convex = getConvex();
  const withProviders = (children: ReactNode) => {
    // On web, keep the app a centered phone-width column instead of stretching
    // across the desktop — every screen and the tab bar stay phone-shaped.
    const framed =
      Platform.OS === 'web' ? (
        <View style={styles.webFrame}>
          <View style={styles.webColumn}>{children}</View>
        </View>
      ) : (
        children
      );
    return convex ? (
      <ConvexAuthProvider client={convex} storage={Platform.OS === 'web' ? undefined : secureStorage}>
        <AuthActionsBridge />
        {framed}
      </ConvexAuthProvider>
    ) : (
      <>{framed}</>
    );
  };

  if (!fontsSettled || !ready) {
    return withProviders(
      <SafeAreaProvider>
        <View style={styles.splash}>
          <Text style={styles.brand}>Kasya</Text>
          <ActivityIndicator color={colors.accent} />
        </View>
      </SafeAreaProvider>,
    );
  }

  return withProviders(
    <SafeAreaProvider>
      <NavigationContainer theme={navTheme}>
        <StatusBar style="light" />
        <Stack.Navigator
          initialRouteName={initial}
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
          <Stack.Screen name="SignIn" component={SignInScreen} />
          <Stack.Screen name="Tabs" component={MainTabs} />
          <Stack.Screen name="ScanSetup" component={ScanSetupScreen} />
          <Stack.Screen name="CameraGuide" component={CameraGuideScreen} />
          <Stack.Screen name="PoseScan" component={PoseScanScreen} options={{ animation: 'fade' }} />
          <Stack.Screen name="Processing" component={ProcessingScreen} options={{ animation: 'fade' }} />
          <Stack.Screen name="Result" component={ResultScreen} />
          <Stack.Screen name="Review" component={ReviewScreen} />
          <Stack.Screen name="Coach" component={CoachScreen} />
          <Stack.Screen name="ShoeMatches" component={ShoeMatchesScreen} />
          <Stack.Screen name="Share" component={ShareCardScreen} options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="Paywall" component={PaywallScreen} options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="RaceDetail" component={RaceDetailScreen} />
          <Stack.Screen name="RaceSubmit" component={RaceSubmitScreen} />
          <Stack.Screen name="RaceAdmin" component={RaceAdminScreen} />
          <Stack.Screen
            name="Record"
            component={RecordScreen}
            // no swipe-to-dismiss mid-run: leaving is an explicit tap (and keeps recording)
            options={{ animation: 'slide_from_bottom', gestureEnabled: false }}
          />
          <Stack.Screen name="ActivityDetail" component={ActivityDetailScreen} />
          <Stack.Screen name="ActivityShare" component={ActivityShareScreen} options={{ animation: 'slide_from_bottom' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    gap: 14,
  },
  brand: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  webFrame: { flex: 1, backgroundColor: colors.bg, alignItems: 'center' },
  webColumn: { flex: 1, width: '100%', maxWidth: 480 },
  // Crash screen: plain literals only — never depend on theme/font loading here.
  crash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B0C0E', padding: 32, gap: 12 },
  crashBrand: { fontSize: 26, fontWeight: '800', color: '#F3F4F6', letterSpacing: -0.5 },
  crashText: { fontSize: 15, color: '#9CA3AF', textAlign: 'center' },
  crashBtn: { marginTop: 8, paddingVertical: 12, paddingHorizontal: 28, borderRadius: 999, backgroundColor: '#FF4D0D' },
  crashBtnText: { fontSize: 15, fontWeight: '700', color: '#0B0C0E' },
});
