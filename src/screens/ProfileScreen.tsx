import { useCallback, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { TabScreenProps } from '../navigation';
import { colors, spacing, type as T, fonts } from '../theme';
import { ScreenContainer, Card, Badge, Chip, Label, Disclaimer } from '../components';
import { getUser, signOut, setOnboarded, MockUser } from '../storage/session';
import { clearReports } from '../storage/reports';
import { getReminderSettings, setReminderSettings, ReminderSettings } from '../storage/settings';
import { ReminderCadence } from '../storage/reminderDue';
import {
  ensureNotificationPermission,
  scheduleRescanReminder,
  cancelRescanReminder,
} from '../notifications/reminders';
import { isBillingLive, presentCustomerCenter } from '../monetization/entitlements';
import { signOutCloud } from '../convex/auth';
import { clearRemoteReports } from '../sync/reportSync';

type RowProps = { icon: ComponentProps<typeof Feather>['name']; label: string; onPress: () => void; danger?: boolean };
function Row({ icon, label, onPress, danger }: RowProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.96 }]}
    >
      <Feather name={icon} size={20} color={danger ? colors.danger : colors.ink} />
      <Text style={[styles.rowLabel, danger && { color: colors.danger }]}>{label}</Text>
      <Feather name="chevron-right" size={20} color={colors.muted} />
    </Pressable>
  );
}

const CADENCES: { key: ReminderCadence; label: string }[] = [
  { key: 'off', label: 'Off' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'biweekly', label: 'Every 2 weeks' },
  { key: 'monthly', label: 'Monthly' },
];

type Props = TabScreenProps<'Profile'>;

export default function ProfileScreen({ navigation }: Props) {
  const [user, setUser] = useState<MockUser | null>(null);
  const [settings, setSettings] = useState<ReminderSettings>({ cadence: 'off' });
  const [reminderNote, setReminderNote] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getUser().then((u) => active && setUser(u));
      getReminderSettings().then((s) => active && setSettings(s));
      return () => {
        active = false;
        if (confirmTimer.current) clearTimeout(confirmTimer.current);
      };
    }, []),
  );

  async function handleSignOut() {
    await signOutCloud(); // end the Supabase session too (no-op when cloud is off)
    await signOut();
    // Reset the ROOT stack (the tabs live inside it), not the tab navigator.
    navigation.getParent()?.reset({ index: 0, routes: [{ name: 'Onboarding' }] });
  }
  async function replayIntro() {
    await setOnboarded(false);
    navigation.getParent()?.reset({ index: 0, routes: [{ name: 'Onboarding' }] });
  }

  /** Two-tap inline confirm — Alert.alert is a no-op on react-native-web. */
  function handleClearHistory() {
    if (!confirmClear) {
      setConfirmClear(true);
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => setConfirmClear(false), 4000);
      return;
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setConfirmClear(false);
    clearReports();
    clearRemoteReports().catch(() => {}); // clear the cloud copies too (fire-and-forget)
  }

  async function pickCadence(cadence: ReminderCadence) {
    if (cadence === settings.cadence) return;
    if (cadence === 'off') {
      await cancelRescanReminder(settings.notificationId);
      const next: ReminderSettings = { cadence: 'off', notificationId: null };
      await setReminderSettings(next);
      setSettings(next);
      setReminderNote('');
      return;
    }
    let notificationId: string | null = null;
    let note: string;
    if (Platform.OS === 'web') {
      note = "On web, we'll remind you here in the app.";
    } else {
      const granted = await ensureNotificationPermission();
      if (granted) {
        notificationId = await scheduleRescanReminder(cadence, settings.notificationId);
        note = "You'll get a notification, and we'll remind you in the app too.";
      } else {
        note = "We'll remind you inside the app. Turn on notifications in system settings to also get a notification.";
      }
    }
    const next: ReminderSettings = { cadence, notificationId };
    await setReminderSettings(next);
    setSettings(next);
    setReminderNote(note);
  }

  const initials = (user?.name ?? 'R').slice(0, 1).toUpperCase();

  return (
    <ScreenContainer title="Profile" edges={['top']}>
      <Card>
        <View style={styles.acct}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: spacing.lg }}>
            <Text style={styles.name}>{user?.name ?? 'Runner'}</Text>
            <Text style={styles.email}>{user?.email ?? 'demo@kasya.app'}</Text>
          </View>
        </View>
        <View style={{ marginTop: spacing.lg }}>
          <Badge
            label={`${user?.plan ?? 'free'} plan`}
            tint={user?.plan === 'premium' ? colors.successSoft : colors.surfaceAlt}
            color={user?.plan === 'premium' ? colors.success : colors.muted}
          />
        </View>
      </Card>

      <View style={{ height: spacing.xl }} />
      <Card>
        <Label>Re-scan reminder</Label>
        <Text style={[T.small, { marginTop: spacing.xs, marginBottom: spacing.md }]}>
          A gentle nudge to re-scan so your trend stays fresh.
        </Text>
        <View style={styles.chips}>
          {CADENCES.map((c) => (
            <Chip key={c.key} label={c.label} selected={settings.cadence === c.key} onPress={() => pickCadence(c.key)} />
          ))}
        </View>
        {reminderNote ? <Text style={[T.small, { marginTop: spacing.sm }]}>{reminderNote}</Text> : null}
      </Card>

      <View style={{ height: spacing.xl }} />
      <Card style={styles.menu}>
        <Row icon="star" label="Upgrade to Premium" onPress={() => navigation.navigate('Paywall')} />
        {isBillingLive() && (
          <>
            <View style={styles.div} />
            <Row
              icon="credit-card"
              label="Manage subscription"
              onPress={async () => {
                // Customer Center handles cancel/refund/restore; falls back to the paywall.
                const shown = await presentCustomerCenter();
                if (!shown) navigation.navigate('Paywall');
                else getUser().then(setUser); // plan may have changed inside
              }}
            />
          </>
        )}
        <View style={styles.div} />
        <Row icon="refresh-ccw" label="Replay intro" onPress={replayIntro} />
        <View style={styles.div} />
        <Row
          icon="trash-2"
          label={confirmClear ? 'Tap again to clear all scans' : 'Clear scan history'}
          onPress={handleClearHistory}
          danger
        />
        <View style={styles.div} />
        <Row icon="log-out" label="Sign out" onPress={handleSignOut} danger />
      </Card>

      <Disclaimer />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  acct: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.bold, fontSize: 22, color: colors.bg },
  name: { fontFamily: fonts.bold, fontSize: 20, color: colors.ink },
  email: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  menu: { padding: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.lg, paddingHorizontal: spacing.md },
  rowLabel: { flex: 1, fontFamily: fonts.medium, fontSize: 16, color: colors.ink },
  div: { height: 1, backgroundColor: colors.line, marginHorizontal: spacing.md },
});
