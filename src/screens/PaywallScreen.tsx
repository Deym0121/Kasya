import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { colors, spacing, radius, type as T, fonts } from '../theme';
import { ScreenContainer, Button } from '../components';

const FEATURES = [
  'Unlimited gait scans',
  'Full shoe matches',
  'PDF report export',
  'Scan history & progress',
];

type Props = NativeStackScreenProps<RootStackParamList, 'Paywall'>;

export default function PaywallScreen({ navigation }: Props) {
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
        <Button label="Start free trial" variant="accent" onPress={() => navigation.goBack()} />
      </View>

      <Button
        label="Lifetime access — ₱1,499"
        variant="secondary"
        onPress={() => navigation.goBack()}
      />

      <Pressable onPress={() => navigation.goBack()} style={styles.later}>
        <Text style={styles.laterText}>Maybe later</Text>
      </Pressable>

      <Text style={styles.note}>
        Demo: no real billing yet. In-app purchases (App Store / Google Play via RevenueCat) come in a
        later milestone. Fair-use limits apply to “unlimited” scans.
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
  later: { alignItems: 'center', marginTop: spacing.lg },
  laterText: { fontFamily: fonts.medium, fontSize: 15, color: colors.muted },
  note: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: spacing.xl },
});
