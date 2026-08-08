import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { RootScreenProps } from '../navigation';
import { colors, spacing, radius, type as T, fonts } from '../theme';
import { ScreenContainer, Button, IconBubble } from '../components';
import { getUser, setUser } from '../storage/session';
import { DAILY_AI_LIMIT } from '../storage/aiQuota';

// Honest list: only what Premium actually gates today, plus clearly-labeled
// forward-looking access. Scans and history stay free for everyone.
const FEATURES = [
  `AI coach chat — up to ${DAILY_AI_LIMIT} chats a day`,
  'Coaching that answers questions about your own scan',
  'Early access to new features as they land',
];

type Props = RootScreenProps<'Paywall'>;

export default function PaywallScreen({ navigation }: Props) {
  const [premium, setPremium] = useState(false);

  useEffect(() => {
    let active = true;
    getUser().then((u) => active && setPremium(u?.plan === 'premium'));
    return () => {
      active = false;
    };
  }, []);

  /** DEMO entitlement: flips the local plan — no money moves, and the UI says so. */
  async function activate() {
    const u = await getUser();
    await setUser({
      email: u?.email ?? 'demo@stridefit.app',
      name: u?.name ?? 'Runner',
      plan: 'premium',
    });
    setPremium(true);
  }

  if (premium) {
    return (
      <ScreenContainer title="Premium" onBack={() => navigation.goBack()}>
        <View style={styles.successWrap}>
          <IconBubble icon="check-circle" tint={colors.successSoft} color={colors.success} size={72} />
          <Text style={[T.h1, { marginTop: spacing.xl, textAlign: 'center' }]}>Premium unlocked</Text>
          <Text style={[T.bodyMuted, { marginTop: spacing.sm, textAlign: 'center' }]}>
            Demo entitlement — no payment was made. The live AI coach chat is now open — up to {DAILY_AI_LIMIT}{' '}
            chats a day.
          </Text>
          <View style={{ height: spacing.xl, alignSelf: 'stretch' }} />
          <View style={{ alignSelf: 'stretch' }}>
            <Button label="Done" onPress={() => navigation.goBack()} />
          </View>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer title="Premium" onBack={() => navigation.goBack()}>
      <Text style={[T.h1, { marginTop: spacing.sm }]}>Unlock your full stride</Text>
      <Text style={[T.bodyMuted, { marginTop: spacing.xs }]}>
        Everything you need to dial in your form and your shoes.
      </Text>

      <View style={styles.plan}>
        <Text style={styles.planName}>StrideFit Premium</Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>₱299</Text>
          <Text style={styles.per}>/ month</Text>
        </View>
        <View style={{ height: spacing.lg }} />
        {FEATURES.map((f) => (
          <View key={f} style={styles.feature}>
            <Feather name="check" size={18} color={colors.accent} />
            <Text style={styles.featureText}>{f}</Text>
          </View>
        ))}
        <View style={{ height: spacing.xl }} />
        <Button label="Start free trial" variant="accent" onPress={activate} />
      </View>

      <Button label="Lifetime access — ₱1,499" variant="secondary" onPress={activate} />

      <Pressable
        onPress={() => navigation.goBack()}
        style={styles.later}
        accessibilityRole="button"
        accessibilityLabel="Maybe later"
      >
        <Text style={styles.laterText}>Maybe later</Text>
      </Pressable>

      <Text style={styles.note}>
        Demo: no real billing yet. In-app purchases (App Store / Google Play via RevenueCat) come in a
        later milestone.
      </Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  plan: {
    backgroundColor: colors.ink,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  planName: { fontFamily: fonts.semibold, fontSize: 14, letterSpacing: 0.5, color: colors.accent },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: spacing.sm },
  price: { fontFamily: fonts.extra, fontSize: 40, color: '#fff', letterSpacing: -1 },
  per: { fontFamily: fonts.medium, fontSize: 15, color: 'rgba(255,255,255,0.7)', marginLeft: 8 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  featureText: { fontFamily: fonts.regular, fontSize: 15, color: '#fff' },
  later: { alignItems: 'center', marginTop: spacing.lg, minHeight: 44, justifyContent: 'center' },
  laterText: { fontFamily: fonts.medium, fontSize: 15, color: colors.muted },
  note: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: spacing.xl },
  successWrap: { alignItems: 'center', marginTop: spacing.xxl },
});
