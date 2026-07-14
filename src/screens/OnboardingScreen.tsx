import { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { colors, spacing, radius, fonts } from '../theme';
import { Button, Dots } from '../components';

type ChipSpec = { icon: React.ComponentProps<typeof Feather>['name']; text: string; top: number; side: 'left' | 'right' };

const SLIDES: {
  icon: React.ComponentProps<typeof Feather>['name'];
  gradient: [string, string];
  kicker: string;
  title: string;
  body: string;
  chips: ChipSpec[];
}[] = [
  {
    icon: 'video',
    gradient: ['#FF5436', '#B3290F'],
    kicker: '30-SECOND SCAN',
    title: 'Record your stride,\nprivately',
    body: 'Walk or run side-on to your camera. By default we read motion only — no video is saved or uploaded, ever.',
    chips: [
      { icon: 'shield', text: 'On-device analysis', top: 36, side: 'right' },
      { icon: 'eye-off', text: 'No video saved', top: 150, side: 'left' },
    ],
  },
  {
    icon: 'activity',
    gradient: ['#3A3D47', '#15161B'],
    kicker: 'REAL FORM INSIGHTS',
    title: 'See how you\nactually move',
    body: 'Cadence, rhythm, symmetry and a step-by-step walkthrough — clear estimates from your real movement.',
    chips: [
      { icon: 'trending-up', text: '168 spm cadence', top: 40, side: 'left' },
      { icon: 'bar-chart-2', text: 'Step-by-step review', top: 156, side: 'right' },
    ],
  },
  {
    icon: 'shopping-bag',
    gradient: ['#0E7C5A', '#0A5540'],
    kicker: 'SHOES THAT FIT YOU',
    title: 'Shop shoes matched\nto your movement',
    body: 'Real shoes from budget finds to premium — matched to your goal and comfort, with live Shopee, TikTok Shop and Lazada links.',
    chips: [
      { icon: 'check-circle', text: '94% comfort match', top: 36, side: 'right' },
      { icon: 'tag', text: 'Budget to premium', top: 150, side: 'left' },
    ],
  },
];

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

export default function OnboardingScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const ref = useRef<ScrollView>(null);
  const [i, setI] = useState(0);
  const last = i === SLIDES.length - 1;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const n = Math.round(e.nativeEvent.contentOffset.x / width);
    if (n !== i) setI(n);
  };
  const next = () => {
    if (last) navigation.navigate('SignIn');
    else {
      ref.current?.scrollTo({ x: width * (i + 1), animated: true });
      setI(i + 1);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.head}>
        <View style={styles.brandRow}>
          <View style={styles.brandDot} />
          <Text style={styles.brand}>StrideFit</Text>
        </View>
        <Pressable onPress={() => navigation.navigate('SignIn')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Skip onboarding">
          <Text style={styles.skip}>Skip</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={ref}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={{ flexGrow: 0 }}
      >
        {SLIDES.map((s, idx) => (
          <View key={idx} style={[styles.slide, { width }]}>
            <View style={styles.artWrap}>
              <LinearGradient colors={s.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.art}>
                <View style={styles.artGlow} />
                <Feather name={s.icon} size={84} color="rgba(255,255,255,0.95)" />
              </LinearGradient>
              {s.chips.map((c, ci) => (
                <View
                  key={ci}
                  style={[styles.chip, { top: c.top }, c.side === 'left' ? { left: -6 } : { right: -6 }]}
                >
                  <Feather name={c.icon} size={14} color={colors.accentInk} />
                  <Text style={styles.chipText}>{c.text}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.kicker}>{s.kicker}</Text>
            <Text style={styles.title}>{s.title}</Text>
            <Text style={styles.body}>{s.body}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <Dots count={SLIDES.length} index={i} />
        <View style={{ height: spacing.xl }} />
        <Button label={last ? 'Get started' : 'Continue'} variant="accent" onPress={next} iconRight="arrow-right" />
        <Text style={styles.foot}>Wellness estimates, not medical advice.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  brand: { fontFamily: fonts.extra, fontSize: 20, color: colors.onDark, letterSpacing: -0.4 },
  skip: { fontFamily: fonts.medium, fontSize: 15, color: colors.onDarkMuted },
  slide: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  artWrap: { marginBottom: spacing.xxl },
  art: {
    width: '100%',
    height: 300,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  artGlow: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top: -70,
    right: -60,
  },
  chip: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  chipText: { fontFamily: fonts.semibold, fontSize: 12.5, color: colors.ink },
  kicker: { fontFamily: fonts.semibold, fontSize: 12, letterSpacing: 1.4, color: colors.accent },
  title: {
    fontFamily: fonts.extra,
    fontSize: 32,
    lineHeight: 38,
    color: colors.onDark,
    letterSpacing: -0.6,
    marginTop: spacing.sm,
  },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 23, color: colors.onDarkMuted, marginTop: spacing.md },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md, paddingTop: spacing.md, marginTop: 'auto' },
  foot: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.onDarkMuted,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
