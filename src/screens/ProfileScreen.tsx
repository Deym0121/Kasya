import { useCallback, useState } from 'react';
import type { ComponentProps } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { colors, spacing, radius, type as T, fonts } from '../theme';
import { ScreenContainer, Card, Badge, Disclaimer } from '../components';
import { getUser, signOut, setOnboarded, MockUser } from '../storage/session';

type RowProps = { icon: ComponentProps<typeof Feather>['name']; label: string; onPress: () => void; danger?: boolean };
function Row({ icon, label, onPress, danger }: RowProps) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.96 }]}>
      <Feather name={icon} size={20} color={danger ? colors.danger : colors.ink} />
      <Text style={[styles.rowLabel, danger && { color: colors.danger }]}>{label}</Text>
      <Feather name="chevron-right" size={20} color={colors.muted} />
    </Pressable>
  );
}

type Props = NativeStackScreenProps<RootStackParamList, 'Profile'>;

export default function ProfileScreen({ navigation }: Props) {
  const [user, setUser] = useState<MockUser | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getUser().then((u) => active && setUser(u));
      return () => {
        active = false;
      };
    }, []),
  );

  async function handleSignOut() {
    await signOut();
    navigation.reset({ index: 0, routes: [{ name: 'Onboarding' }] });
  }
  async function restartOnboarding() {
    await setOnboarded(false);
    navigation.reset({ index: 0, routes: [{ name: 'Onboarding' }] });
  }

  const initials = (user?.name ?? 'R').slice(0, 1).toUpperCase();

  return (
    <ScreenContainer title="Profile" onBack={() => navigation.goBack()}>
      <Card>
        <View style={styles.acct}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: spacing.lg }}>
            <Text style={styles.name}>{user?.name ?? 'Runner'}</Text>
            <Text style={styles.email}>{user?.email ?? 'demo@stridefit.app'}</Text>
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
      <Card style={styles.menu}>
        <Row icon="star" label="Upgrade to Premium" onPress={() => navigation.navigate('Paywall')} />
        <View style={styles.div} />
        <Row icon="refresh-ccw" label="Restart onboarding" onPress={restartOnboarding} />
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
  avatarText: { fontFamily: fonts.bold, fontSize: 22, color: '#fff' },
  name: { fontFamily: fonts.bold, fontSize: 20, color: colors.ink },
  email: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted, marginTop: 2 },
  menu: { padding: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.lg, paddingHorizontal: spacing.md },
  rowLabel: { flex: 1, fontFamily: fonts.medium, fontSize: 16, color: colors.ink },
  div: { height: 1, backgroundColor: colors.line, marginHorizontal: spacing.md },
});
