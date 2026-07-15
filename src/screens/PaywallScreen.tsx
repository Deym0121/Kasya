import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { RootScreenProps } from '../navigation';
import { colors, spacing, radius, type as T, fonts } from '../theme';
import { ScreenContainer, Button, IconBubble } from '../components';
import {
  getPlan,
  isBillingLive,
  getPremiumPackages,
  purchasePremium,
  restorePurchases,
  presentRcPaywall,
  PremiumPackage,
} from '../monetization/entitlements';

// Only benefits that are REALLY gated in the app — scans, history, progress and
// shoe matches are free for everyone (and stay that way in the copy).
const FEATURES = [
  'AI coach chat — ask anything about your scan (50 replies/day)',
  'PDF report export',
];

type Props = RootScreenProps<'Paywall'>;

export default function PaywallScreen({ navigation }: Props) {
  const [premium, setPremium] = useState(false);
  const [live] = useState(isBillingLive);
  const [packages, setPackages] = useState<PremiumPackage[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    let active = true;
    getPlan().then((p) => active && setPremium(p === 'premium'));
    if (live) getPremiumPackages().then((p) => active && setPackages(p));
    return () => {
      active = false;
    };
  }, [live]);

  /** Live: a real store purchase (RevenueCat). Demo: the local flip — and the UI says so. */
  async function buy(pkg?: unknown) {
    setBusy(true);
    setNote('');
    try {
      const plan = await purchasePremium(pkg);
      setPremium(plan === 'premium');
    } catch {
      setNote('Purchase didn’t complete — you haven’t been charged.');
    } finally {
      setBusy(false);
    }
  }

  /** Prefer the dashboard-configured RevenueCat Paywall; fall back to the in-app buttons. */
  async function openStorePaywall() {
    setBusy(true);
    setNote('');
    try {
      const plan = await presentRcPaywall();
      if (plan === 'premium') setPremium(true);
      else if (plan === null) setNote('Store paywall unavailable — you can subscribe with the buttons below.');
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    setBusy(true);
    setNote('');
    try {
      const plan = await restorePurchases();
      setPremium(plan === 'premium');
      if (plan !== 'premium') setNote('No previous purchase found for this store account.');
    } catch {
      setNote('Restore didn’t complete — try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  if (premium) {
    return (
      <ScreenContainer title="Premium" onBack={() => navigation.goBack()}>
        <View style={styles.successWrap}>
          <IconBubble icon="check-circle" tint={colors.successSoft} color={colors.success} size={72} />
          <Text style={[T.h1, { marginTop: spacing.xl, textAlign: 'center' }]}>Premium unlocked</Text>
          <Text style={[T.bodyMuted, { marginTop: spacing.sm, textAlign: 'center' }]}>
            {live
              ? 'Your purchase is active. The AI coach chat and PDF report export are now open.'
              : 'Demo entitlement — no payment was made. The AI coach chat and PDF report export are now open.'}
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
        <Text style={styles.planName}>Kasya Premium</Text>
        {live && packages.length > 0 ? (
          <Text style={styles.livePrice}>{packages[0].price}</Text>
        ) : (
          <View style={styles.priceRow}>
            <Text style={styles.price}>$9.99</Text>
            <Text style={styles.per}>/ month</Text>
          </View>
        )}
        <View style={{ height: spacing.lg }} />
        {FEATURES.map((f) => (
          <View key={f} style={styles.feature}>
            <Feather name="check" size={18} color={colors.accent} />
            <Text style={styles.featureText}>{f}</Text>
          </View>
        ))}
        <View style={{ height: spacing.xl }} />
        {live ? (
          <>
            <Button label="View subscription options" variant="accent" loading={busy} onPress={openStorePaywall} />
            {packages.map((p) => (
              <View key={p.id} style={{ marginTop: spacing.sm }}>
                <Button label={`${p.label} — ${p.price}`} variant="primary" loading={busy} onPress={() => buy(p.pkg)} />
              </View>
            ))}
          </>
        ) : (
          <Button label="Start free trial" variant="accent" loading={busy} onPress={() => buy()} />
        )}
      </View>

      {!live && <Button label="Yearly — $79.99 · save 33%" variant="secondary" onPress={() => buy()} />}
      {live && (
        <Button label="Restore purchases" variant="secondary" onPress={restore} disabled={busy} />
      )}

      {note ? <Text style={styles.notice}>{note}</Text> : null}

      <Pressable
        onPress={() => navigation.goBack()}
        style={styles.later}
        accessibilityRole="button"
        accessibilityLabel="Maybe later"
      >
        <Text style={styles.laterText}>Maybe later</Text>
      </Pressable>

      <Text style={styles.note}>
        {live
          ? 'Billing is handled by the App Store / Google Play. Subscriptions renew until cancelled in your store account settings.'
          : 'Demo: no real billing yet. In-app purchases (App Store / Google Play via RevenueCat) activate once store products are configured. Scans, history and shoe matches stay free for everyone.'}
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
  livePrice: { fontFamily: fonts.extra, fontSize: 34, color: '#fff', letterSpacing: -0.8, marginTop: spacing.sm },
  feature: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  featureText: { fontFamily: fonts.regular, fontSize: 15, color: '#fff', flex: 1 },
  later: { alignItems: 'center', marginTop: spacing.lg, minHeight: 44, justifyContent: 'center' },
  laterText: { fontFamily: fonts.medium, fontSize: 15, color: colors.muted },
  notice: { fontFamily: fonts.semibold, fontSize: 13, color: colors.accentInk, marginTop: spacing.md, textAlign: 'center' },
  note: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: spacing.xl },
  successWrap: { alignItems: 'center', marginTop: spacing.xxl },
});
