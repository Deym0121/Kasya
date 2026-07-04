import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { TabScreenProps } from '../navigation';
import { colors, spacing, radius, type as T, fonts } from '../theme';
import {
  ScreenContainer,
  Button,
  Card,
  IconBubble,
  Badge,
  Label,
  ConfidenceChip,
  EmptyState,
  CoachCard,
  NoticeBanner,
} from '../components';
import { getLatestReport } from '../storage/reports';
import { GaitReportRecord } from '../storage/reportRecord';
import { getUser, MockUser } from '../storage/session';
import { matchShoes, scoreTone } from '../shoes/match';
import { SHOES } from '../data/shoes';
import { ShoeThumb } from '../viz/ShoeThumb';
import { pickCoachTip } from '../gait/coach';
import { getReminderSettings } from '../storage/settings';
import { isRescanDue, dueBannerCopy } from '../storage/reminderDue';

type Props = TabScreenProps<'Home'>;

const TONE_COLOR = { strong: colors.success, good: colors.accentInk, fair: colors.muted } as const;

export default function HomeScreen({ navigation }: Props) {
  const [latest, setLatest] = useState<GaitReportRecord | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [user, setUser] = useState<MockUser | null>(null);
  const [due, setDue] = useState<{ due: boolean; daysSince: number | null }>({ due: false, daysSince: null });

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const [r, u, s] = await Promise.all([getLatestReport(), getUser(), getReminderSettings()]);
        if (!active) return;
        setLatest(r);
        setUser(u);
        setLoaded(true);
        setDue(isRescanDue(r?.createdAt ?? null, s.cadence, new Date()));
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  const goal = latest?.scanType ?? 'running';
  const matches = matchShoes(SHOES, {
    useCase: goal,
    gait: { cadenceSpm: latest?.result.cadence.value, bouncePct: latest?.metrics?.verticalOscillationPct },
  }).slice(0, 3);
  const initials = (user?.name ?? 'R').slice(0, 1).toUpperCase();
  const firstRun = loaded && !latest;
  const coach = latest ? pickCoachTip(latest, new Date().toISOString().slice(0, 10)) : null;
  const openMatches = () =>
    latest ? navigation.navigate('ShoeMatches', { report: latest }) : navigation.navigate('ScanSetup');

  return (
    <ScreenContainer
      edges={['top']}
      right={
        <Pressable
          onPress={() => navigation.navigate('Profile')}
          accessibilityRole="button"
          accessibilityLabel="Open profile"
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
        </Pressable>
      }
    >
      <Label>Welcome back</Label>
      <Text style={[T.h1, { marginTop: 4 }]}>{user?.name ?? 'Runner'}</Text>

      {due.due && !firstRun && (
        <View style={{ marginTop: spacing.lg }}>
          <NoticeBanner
            icon="clock"
            text={dueBannerCopy(due.daysSince)}
            actionLabel="Scan now"
            onAction={() => navigation.navigate('ScanSetup')}
          />
        </View>
      )}

      <View style={styles.hero}>
        <Text style={styles.heroKicker}>{firstRun ? 'YOUR FIRST SCAN' : 'AI GAIT SCAN'}</Text>
        <Text style={styles.heroTitle}>
          {firstRun ? 'Take your first scan — about 30 seconds' : 'Check your stride in 30 seconds'}
        </Text>
        {firstRun && (
          <Text style={styles.heroPrivacy}>By default the camera reads motion only — no video saved. You can keep a clip for your review, then it’s deleted.</Text>
        )}
        <View style={{ height: spacing.lg }} />
        <Button label="Start scan" variant="accent" icon="camera" onPress={() => navigation.navigate('ScanSetup')} />
      </View>

      {firstRun && (
        <View style={{ marginTop: spacing.lg }}>
          <EmptyState
            icon="bar-chart-2"
            title="Your results will live here"
            body="After a scan you'll see your step rhythm, form estimates and comfort-led shoe matches."
          />
        </View>
      )}

      {latest && (
        <Card style={{ marginTop: spacing.lg }}>
          <View style={styles.rowBetween}>
            <Label>Latest result</Label>
            <Text style={styles.date}>{new Date(latest.createdAt).toLocaleDateString()}</Text>
          </View>
          <View style={[styles.rowBetween, { alignItems: 'flex-end', marginTop: spacing.sm }]}>
            <View>
              <View style={styles.statRow}>
                <Text style={styles.bigNum}>{Math.round(latest.result.cadence.value)}</Text>
                <Text style={styles.unit}>spm</Text>
              </View>
              <Text style={styles.unitCaption}>steps per minute</Text>
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

      {coach && <CoachCard tip={coach.text} source={coach.source} />}

      {!firstRun && (
        <>
          <View style={styles.sectionHead}>
            <Text style={T.h2}>Recommended for you</Text>
            <Pressable onPress={openMatches} hitSlop={12} accessibilityRole="button" accessibilityLabel="See all shoe matches">
              <Text style={styles.seeAll}>See all</Text>
            </Pressable>
          </View>

          {matches.map((m) => (
            <Card key={m.shoe.id} style={{ marginBottom: spacing.md }} onPress={openMatches}>
              <View style={styles.shoeRow}>
                <ShoeThumb shoe={m.shoe} size={48} />
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text style={styles.shoeName}>
                    {m.shoe.brand} {m.shoe.model}
                  </Text>
                  <Text style={styles.shoeMeta}>
                    {m.shoe.cushion} cushion · ₱{m.shoe.priceMin.toLocaleString()}
                  </Text>
                </View>
                <View style={styles.scoreCol}>
                  <Text style={[styles.score, { color: TONE_COLOR[scoreTone(m.score)] }]}>{m.score}%</Text>
                  <Text style={styles.scoreCaption}>comfort match</Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.muted} style={{ marginLeft: spacing.sm }} />
              </View>
              {m.shoe.isOwnProduct && (
                <View style={{ marginTop: spacing.md }}>
                  <Badge label="Our product" />
                </View>
              )}
            </Card>
          ))}
        </>
      )}

      {!firstRun && user?.plan !== 'premium' && (
        <View style={styles.upsell}>
          <IconBubble icon="zap" tint="rgba(255,255,255,0.18)" color="#fff" size={44} />
          <Text style={styles.upTitle}>Go Premium</Text>
          <Text style={styles.upBody}>Unlimited scans, full shoe matches, history and progress.</Text>
          <View style={{ height: spacing.lg }} />
          <Button label="See plans" variant="primary" onPress={() => navigation.navigate('Paywall')} />
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
  heroPrivacy: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.onDarkMuted, marginTop: spacing.sm },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  statRow: { flexDirection: 'row', alignItems: 'baseline' },
  bigNum: { fontFamily: fonts.extra, fontSize: 44, color: colors.ink, letterSpacing: -1 },
  unit: { fontFamily: fonts.semibold, fontSize: 18, color: colors.muted, marginLeft: 6 },
  unitCaption: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, marginTop: 2 },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xxl,
    marginBottom: spacing.lg,
  },
  seeAll: { fontFamily: fonts.semibold, fontSize: 14, color: colors.accentInk },
  shoeRow: { flexDirection: 'row', alignItems: 'center' },
  shoeName: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  shoeMeta: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, marginTop: 2, textTransform: 'capitalize' },
  scoreCol: { alignItems: 'flex-end' },
  score: { fontFamily: fonts.extra, fontSize: 18 },
  scoreCaption: { fontFamily: fonts.regular, fontSize: 10, color: colors.muted, marginTop: 1 },
  upsell: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginTop: spacing.lg,
  },
  upTitle: { fontFamily: fonts.bold, fontSize: 20, color: '#fff', marginTop: spacing.md },
  upBody: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: 'rgba(255,255,255,0.9)', marginTop: spacing.xs },
});
