import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { fontMap, colors } from './src/theme';
import { RootStackParamList } from './src/navigation';
import { getOnboarded, getUser, setUser, setOnboarded } from './src/storage/session';
import { currentUserEmail } from './src/supabase/auth';
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

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.surface, primary: colors.accent },
};

export default function App() {
  const [fontsLoaded] = useFonts(fontMap);
  const [ready, setReady] = useState(false);
  const [initial, setInitial] = useState<'Onboarding' | 'Tabs'>('Onboarding');

  useEffect(() => {
    (async () => {
      const [ob, cloudEmail] = await Promise.all([getOnboarded(), currentUserEmail()]);
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
      setReady(true);
    })();
  }, []);

  if (!fontsLoaded || !ready) {
    return (
      <SafeAreaProvider>
        <View style={styles.splash}>
          <Text style={styles.brand}>Kasya</Text>
          <ActivityIndicator color={colors.accent} />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
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
});
