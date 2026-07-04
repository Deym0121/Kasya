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
import { Feather } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { colors, spacing, radius, type as T, fonts } from '../theme';
import { Button, Dots } from '../components';

const SLIDES = [
  {
    icon: 'video',
    tint: colors.accentSoft,
    fg: colors.accent,
    title: 'Record your stride',
    body: 'Walk or run side-on. By default we track motion only — no video saved. Optionally keep a clip just for your review, then it’s deleted. Nothing is ever uploaded.',
  },
  {
    icon: 'activity',
    tint: colors.ink,
    fg: '#FFFFFF',
    title: 'Read your running form',
    body: 'On-device analysis turns your movement into clear, cadence-led insights.',
  },
  {
    icon: 'shopping-bag',
    tint: colors.successSoft,
    fg: colors.success,
    title: 'Find shoes that fit you',
    body: 'Get matched to shoes for your goals and comfort, then export a report.',
  },
] as const;

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
        <Text style={styles.brand}>StrideFit</Text>
        <Pressable onPress={() => navigation.navigate('SignIn')} hitSlop={10}>
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
            <View style={[styles.art, { backgroundColor: s.tint }]}>
              <Feather name={s.icon} size={68} color={s.fg} />
            </View>
            <Text style={styles.title}>{s.title}</Text>
            <Text style={styles.body}>{s.body}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <Dots count={SLIDES.length} index={i} />
        <View style={{ height: spacing.xl }} />
        <Button label={last ? 'Get started' : 'Continue'} onPress={next} iconRight="arrow-right" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  brand: { fontFamily: fonts.extra, fontSize: 20, color: colors.ink, letterSpacing: -0.4 },
  skip: { fontFamily: fonts.medium, fontSize: 15, color: colors.muted },
  slide: { paddingHorizontal: spacing.xl, alignItems: 'center', paddingTop: spacing.lg },
  art: {
    width: '100%',
    height: 340,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xxl,
  },
  title: { ...T.display, textAlign: 'center', marginBottom: spacing.md },
  body: { ...T.body, textAlign: 'center', paddingHorizontal: spacing.md },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.lg, paddingTop: spacing.md },
});
