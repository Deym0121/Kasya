import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { colors, spacing, radius, type as T, fonts } from '../theme';
import { ScreenContainer, Button, Card, IconBubble, Badge, Label, ConfidenceChip } from '../components';
import { getLatestReport } from '../storage/reports';
import { GaitReportRecord } from '../storage/reportRecord';
import { getUser, MockUser } from '../storage/session';
import { matchShoes } from '../shoes/match';
import { SHOES } from '../data/shoes';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  const [latest, setLatest] = useState<GaitReportRecord | null>(null);
  const [user, setUser] = useState<MockUser | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getLatestReport().then((r) => active && setLatest(r));
      getUser().then((u) => active && setUser(u));
      return () => {
        active = false;
      };
    }, []),
  );

  const goal = latest?.scanType ?? 'running';
  const matches = matchShoes(SHOES, { useCase: goal }).slice(0, 2);
  const initials = (user?.name ?? 'R').slice(0, 1).toUpperCase();
  const openMatches = () =>
    latest ? navigation.navigate('ShoeMatches', { report: latest }) : navigation.navigate('ScanSetup');

  return (
    <ScreenContainer
      right={
        <Pressable onPress={() => navigation.navigate('Profile')}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
        </Pressable>
      }
    >
      <Label>Welcome back</Label>
      <Text style={[T.h1, { marginTop: 4 }]}>{user?.name ?? 'Runner'}</Text>

      <View style={styles.hero}>
        <Text style={styles.heroKicker}>AI GAIT SCAN</Text>
        <Text style={styles.heroTitle}>Check your stride in 30 seconds</Text>
        <View style={{ height: spacing.lg }} />
        <Button label="Start scan" variant="accent" icon="camera" onPress={() => navigation.navigate('ScanSetup')} />
      </View>

      {latest && (
        <Card style={{ marginTop: spacing.lg }}>
          <View style={styles.rowBetween}>
            <Label>Latest result</Label>
            <Text style={styles.date}>{new Date(latest.createdAt).toLocaleDateString()}</Text>
          </View>
          <View style={[styles.rowBetween, { alignItems: 'flex-end', marginTop: spacing.sm }]}>
            <View style={styles.statRow}>
              <Text style={styles.bigNum}>{Math.round(latest.result.cadence.value)}</Text>
              <Text style={styles.unit}>spm</Text>
            </View>
            <ConfidenceChip confidence={latest.result.cadence.confidence} />
          </View>
          <View style={{ height: spacing.lg }} />
          <Button
            label="View report"
            variant="secondary"
            iconRight="chevron-right"
            onPress={() => navigation.navigate('Result', { report: latest })}
          />
        </Card>
      )}

      <View style={styles.sectionHead}>
        <Text style={T.h2}>Recommended for you</Text>
        <Pressable onPress={openMatches} hitSlop={8}>
          <Text style={styles.seeAll}>See all</Text>
        </Pressable>
      </View>

      {matches.map((m) => (
        <Card key={m.shoe.id} style={{ marginBottom: spacing.md }} onPress={openMatches}>
          <View style={styles.shoeRow}>
            <IconBubble icon="shopping-bag" tint={colors.surfaceAlt} color={colors.ink} size={44} />
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={styles.shoeName}>
                {m.shoe.brand} {m.shoe.model}
              </Text>
              <Text style={styles.shoeMeta}>
                {m.shoe.cushion} cushion · ₱{m.shoe.priceMin.toLocaleString()}
              </Text>
            </View>
            <Text style={styles.score}>{m.score}%</Text>
          </View>
          {m.shoe.isOwnProduct && (
            <View style={{ marginTop: spacing.md }}>
              <Badge label="Our product" />
            </View>
          )}
        </Card>
      ))}

      <View style={styles.upsell}>
        <IconBubble icon="zap" tint="rgba(255,255,255,0.18)" color="#fff" size={44} />
        <Text style={styles.upTitle}>Go Premium</Text>
        <Text style={styles.upBody}>Unlimited scans, PDF reports, history and full shoe matches.</Text>
        <View style={{ height: spacing.lg }} />
        <Button label="See plans" variant="primary" onPress={() => navigation.navigate('Paywall')} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  hero: {
    backgroundColor: colors.ink,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginTop: spacing.xl,
  },
  heroKicker: { fontFamily: fonts.semibold, fontSize: 12, letterSpacing: 1.2, color: colors.accent },
  heroTitle: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28, color: '#fff', marginTop: spacing.sm },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  statRow: { flexDirection: 'row', alignItems: 'baseline' },
  bigNum: { fontFamily: fonts.extra, fontSize: 44, color: colors.ink, letterSpacing: -1 },
  unit: { fontFamily: fonts.semibold, fontSize: 18, color: colors.muted, marginLeft: 6 },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xxl,
    marginBottom: spacing.lg,
  },
  seeAll: { fontFamily: fonts.semibold, fontSize: 14, color: colors.accent },
  shoeRow: { flexDirection: 'row', alignItems: 'center' },
  shoeName: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  shoeMeta: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, marginTop: 2, textTransform: 'capitalize' },
  score: { fontFamily: fonts.extra, fontSize: 18, color: colors.accent },
  upsell: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginTop: spacing.lg,
  },
  upTitle: { fontFamily: fonts.bold, fontSize: 20, color: '#fff', marginTop: spacing.md },
  upBody: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: 'rgba(255,255,255,0.9)', marginTop: spacing.xs },
});
