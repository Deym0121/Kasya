import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Linking, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { RootScreenProps } from '../navigation';
import { colors, spacing, radius, type as T, fonts, shadow } from '../theme';
import { ScreenContainer, Button, IconBubble } from '../components';
import {
  getPlan,
  isBillingLive,
  getPremiumPackages,
  purchasePremium,
  restorePurchases,
  PremiumPackage,
} from '../monetization/entitlements';

// Only benefits that are REALLY gated in the app — scans, history, progress and
// shoe matches are free for everyone (and stay that way in the copy).
const BENEFITS: { icon: 'message-circle' | 'file-text'; title: string; sub: string }[] = [
  {
    icon: 'message-circle',
    title: 'AI coach chat',
    sub: 'Ask anything about your scan — English or Taglish, up to 50 replies a day.',
  },
  {
    icon: 'file-text',
    title: 'PDF report export',
    sub: 'A clean, shareable report of your gait numbers.',
  },
];

// Demo-mode price display; live mode shows the store's own priceString.
// Mirrors the REAL store products ($9.99/mo, $79.99/yr) — a mismatched number
// here is a metadata-accuracy (2.3.1) problem.
const DEMO = {
  yearly: { price: '$79.99/y', perMonth: '$6.67/mo', foot: '$79.99 per year, cancel anytime.' },
  monthly: { price: '$9.99/mo', perMonth: null, foot: '$9.99 per month, cancel anytime.' },
};

type PlanChoice = 'yearly' | 'monthly';

type Props = RootScreenProps<'Paywall'>;

export default function PaywallScreen({ navigation }: Props) {
  const [premium, setPremium] = useState(false);
  const [live] = useState(isBillingLive);
  const [packages, setPackages] = useState<PremiumPackage[]>([]);
  const [pkgsReady, setPkgsReady] = useState(!isBillingLive());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [sel, setSel] = useState<PlanChoice>('yearly');

  useEffect(() => {
    let active = true;
    getPlan().then((p) => active && setPremium(p === 'premium'));
    if (live)
      getPremiumPackages().then((p) => {
        if (!active) return;
        setPackages(p);
        setPkgsReady(true);
      });
    return () => {
      active = false;
    };
  }, [live]);

  const yearlyPkg = useMemo(
    () => packages.find((p) => /year|annual/i.test(`${p.id} ${p.label}`)),
    [packages],
  );
  const monthlyPkg = useMemo(
    () => packages.find((p) => /month/i.test(`${p.id} ${p.label}`) && p !== yearlyPkg) ?? packages[0],
    [packages, yearlyPkg],
  );

  // Live mode only offers plans the store actually returned — a plan without a
  // loaded product must never render with a made-up price or fake-succeed
  // (build 24 review: tapping the default Yearly with no loaded product took
  // the demo path and claimed "Premium unlocked" while everything stayed
  // locked — App Review 2.1(b)).
  const showYearly = !live || !!yearlyPkg;
  const showMonthly = !live || !!monthlyPkg;
  const selPkg = sel === 'yearly' ? yearlyPkg : monthlyPkg;
  const storeEmpty = live && pkgsReady && !yearlyPkg && !monthlyPkg;

  useEffect(() => {
    if (!live || !pkgsReady) return;
    if (sel === 'yearly' && !yearlyPkg && monthlyPkg) setSel('monthly');
    else if (sel === 'monthly' && !monthlyPkg && yearlyPkg) setSel('yearly');
  }, [live, pkgsReady, sel, yearlyPkg, monthlyPkg]);

  const yearlyPrice = live ? yearlyPkg?.price || '…' : DEMO.yearly.price;
  const monthlyPrice = live ? monthlyPkg?.price || '…' : DEMO.monthly.price;
  // Live mode quotes the store's own price — never the demo copy's numbers.
  const footnote = live
    ? selPkg
      ? `${selPkg.price} per ${sel === 'yearly' ? 'year' : 'month'}, cancel anytime.`
      : ''
    : sel === 'yearly'
      ? DEMO.yearly.foot
      : DEMO.monthly.foot;

  /** Live: a real store purchase (RevenueCat). Demo: the local flip — and the UI says so. */
  async function buy() {
    setBusy(true);
    setNote('');
    try {
      if (live) {
        if (!selPkg?.pkg) {
          setNote('That plan isn’t available right now — please try again in a moment, or tap Restore purchases if you’ve subscribed before.');
          return;
        }
        let plan = await purchasePremium(selPkg.pkg);
        // Store purchase went through but no entitlement came back (e.g. a
        // dashboard mapping gap): sync once with the store before deciding.
        if (plan !== 'premium') plan = await restorePurchases();
        if (plan === 'premium') {
          setPremium(true);
        } else {
          setNote('Your purchase was received but access hasn’t activated yet. Tap Restore purchases in a moment — you won’t be charged twice.');
        }
      } else {
        const plan = await purchasePremium();
        setPremium(plan === 'premium');
      }
    } catch (e: any) {
      setNote(e?.userCancelled ? '' : 'Purchase didn’t complete — you haven’t been charged.');
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

  const planCard = (choice: PlanChoice, name: string, price: string, perMonth: string | null) => {
    const on = sel === choice;
    return (
      <Pressable
        onPress={() => setSel(choice)}
        accessibilityRole="radio"
        accessibilityState={{ selected: on }}
        accessibilityLabel={`${name} plan, ${price}`}
        style={[styles.planCard, on && styles.planCardOn]}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.planTitle}>{name}</Text>
          <Text style={styles.planPrice}>{price}</Text>
        </View>
        {perMonth ? <Text style={styles.planEquiv}>{perMonth}</Text> : null}
        <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
      </Pressable>
    );
  };

  return (
    <ScreenContainer>
      <Pressable
        onPress={() => navigation.goBack()}
        hitSlop={12}
        style={styles.close}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <Feather name="x" size={24} color={colors.ink} />
      </Pressable>

      <View style={styles.heroWrap}>
        <View style={styles.heroCard}>
          <Image source={require('../../assets/icon.png')} style={styles.heroImg} accessible={false} />
        </View>
      </View>

      <Text style={styles.wordmark}>
        Kasya <Text style={styles.wordmarkPro}>premium</Text>
      </Text>
      <Text style={styles.tag}>Unlock your full stride.</Text>
      <Text style={styles.tagSub}>Everything you need to dial in your form and your shoes.</Text>

      <View style={{ height: spacing.xl }} />

      {showYearly && (
        <View>
          {planCard('yearly', 'Yearly', yearlyPrice, live ? null : DEMO.yearly.perMonth)}
          {/* 12 × $9.99 = $119.88 vs $79.99/yr → 33% — must match the real math. */}
          <View style={styles.saveBadge} pointerEvents="none">
            <Text style={styles.saveBadgeText}>SAVE 33%</Text>
          </View>
        </View>
      )}
      {showYearly && showMonthly && <View style={{ height: spacing.md }} />}
      {showMonthly && planCard('monthly', 'Monthly', monthlyPrice, null)}
      {storeEmpty && (
        <Text style={styles.notice}>
          Subscription plans couldn’t be loaded from the store right now. Please try again in a
          moment, or tap Restore purchases if you’ve subscribed before.
        </Text>
      )}

      <View style={{ height: spacing.xl }} />
      <Text style={styles.benefitsHead}>Premium benefits</Text>
      {BENEFITS.map((b) => (
        <View key={b.title} style={styles.benefit}>
          <IconBubble icon={b.icon} tint={colors.accentSoft} color={colors.accentInk} size={42} />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={styles.benefitTitle}>{b.title}</Text>
            <Text style={styles.benefitSub}>{b.sub}</Text>
          </View>
        </View>
      ))}

      <View style={{ height: spacing.xl }} />
      <Pressable
        onPress={buy}
        disabled={busy || (live && (!pkgsReady || !selPkg))}
        accessibilityRole="button"
        accessibilityLabel={sel === 'yearly' ? 'Subscribe yearly' : 'Subscribe monthly'}
        style={({ pressed }) => [
          pressed && { opacity: 0.9 },
          (busy || (live && (!pkgsReady || !selPkg))) && { opacity: 0.6 },
        ]}
      >
        <LinearGradient
          colors={[colors.accent, '#FF7A3D']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.cta}
        >
          <Text style={styles.ctaText}>
            {busy
              ? 'One moment…'
              : live && !pkgsReady
                ? 'Loading plans…'
                : sel === 'yearly'
                  ? 'Subscribe Yearly'
                  : 'Subscribe Monthly'}
          </Text>
        </LinearGradient>
      </Pressable>
      <Text style={styles.foot}>{footnote}</Text>

      {live && (
        <Pressable onPress={restore} disabled={busy} style={styles.restore} accessibilityRole="button" accessibilityLabel="Restore purchases">
          <Text style={styles.restoreText}>Restore purchases</Text>
        </Pressable>
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
          ? `Subscriptions are billed to your ${Platform.OS === 'ios' ? 'App Store' : 'Google Play'} account and renew automatically until cancelled at least 24 hours before the end of the current period, in your store account settings. Scans, history and shoe matches stay free for everyone.`
          : 'Demo: no real billing yet. In-app purchases activate once store products are configured. Scans, history and shoe matches stay free for everyone.'}
      </Text>

      {/* App Review 3.1.2: functional Privacy Policy + Terms links on the paywall. */}
      <View style={styles.legalRow}>
        <Pressable
          onPress={() => Linking.openURL('https://youthful-civet-99.convex.site/privacy')}
          accessibilityRole="link"
          accessibilityLabel="Privacy Policy"
          hitSlop={8}
        >
          <Text style={styles.legalLink}>Privacy Policy</Text>
        </Pressable>
        <Text style={styles.legalDot}>·</Text>
        <Pressable
          onPress={() => Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')}
          accessibilityRole="link"
          accessibilityLabel="Terms of Use"
          hitSlop={8}
        >
          <Text style={styles.legalLink}>Terms of Use (EULA)</Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  close: { position: 'absolute', top: spacing.sm, right: spacing.md, zIndex: 2, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  heroWrap: { alignItems: 'center', marginTop: spacing.xl },
  heroCard: {
    borderRadius: 34,
    transform: [{ rotate: '-8deg' }],
    ...shadow.lift,
  },
  heroImg: { width: 132, height: 132, borderRadius: 30 },
  wordmark: {
    fontFamily: fonts.extra,
    fontSize: 30,
    letterSpacing: -0.6,
    color: colors.ink,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  wordmarkPro: { color: colors.accent },
  tag: { fontFamily: fonts.semibold, fontSize: 16, color: colors.inkSoft, textAlign: 'center', marginTop: spacing.sm },
  tagSub: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 2 },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  planCardOn: { borderColor: colors.accent, backgroundColor: colors.surfaceAlt },
  planTitle: { fontFamily: fonts.bold, fontSize: 17, color: colors.ink },
  planPrice: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted, marginTop: 2 },
  planEquiv: { fontFamily: fonts.medium, fontSize: 14, color: colors.inkSoft },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: colors.accent },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.accent },
  saveBadge: {
    position: 'absolute',
    top: -11,
    left: spacing.lg,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  saveBadgeText: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.6, color: colors.onDark },
  benefitsHead: { fontFamily: fonts.bold, fontSize: 18, color: colors.ink, marginBottom: spacing.md },
  benefit: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md },
  benefitTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  benefitSub: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.muted, marginTop: 1 },
  cta: {
    minHeight: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { fontFamily: fonts.bold, fontSize: 17, color: colors.onDark },
  foot: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: spacing.md },
  restore: { alignItems: 'center', marginTop: spacing.lg, minHeight: 40, justifyContent: 'center' },
  restoreText: { fontFamily: fonts.medium, fontSize: 14, color: colors.inkSoft },
  notice: { fontFamily: fonts.semibold, fontSize: 13, color: colors.accentInk, marginTop: spacing.md, textAlign: 'center' },
  later: { alignItems: 'center', marginTop: spacing.sm, minHeight: 44, justifyContent: 'center' },
  laterText: { fontFamily: fonts.medium, fontSize: 15, color: colors.muted },
  note: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: spacing.lg },
  legalRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  legalLink: { fontFamily: fonts.medium, fontSize: 12, color: colors.accentInk },
  legalDot: { color: colors.muted },
  successWrap: { alignItems: 'center', marginTop: spacing.xxl },
});
