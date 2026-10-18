import { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable, Share } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { RootScreenProps } from '../navigation';
import { colors, spacing, radius, type as T, fonts } from '../theme';
import { ScreenContainer, Button, Card, Chip, EmptyState, Label, TextField } from '../components';
import { Notice, ProgressBar, RankBadge } from '../groups/ui';
import { formatCount, rankBadge } from '../groups/levels';
import { countryName, flagEmoji } from '../clubs/countries';
import {
  CLUB_LIMITS,
  REPORT_REASONS,
  formatKm,
  formatPace,
  localMonthKey,
  paceSecPerKm,
  type ReportReason,
} from '../clubs/rules';
import { joinOpenClub, loadClubProfile, reportClub, type ClubProfile, type ProfileLoad } from '../clubs/api';
import { ClubAvatar } from '../clubs/ui';
import { getHiddenClubs, setClubHidden } from '../clubs/hidden';
import { LegalNote } from '../legal/LegalNote';

type Props = RootScreenProps<'Club'>;
type Phase = 'loading' | ProfileLoad['status'];

const REASON_LABEL: Record<ReportReason, string> = {
  inappropriate: 'Offensive name or photo',
  spam: 'Spam or ads',
  impersonation: 'Pretends to be someone else',
  other: 'Something else',
};

function monthName(d: Date) {
  return d.toLocaleString('en-US', { month: 'long' });
}

function RankTile({ label, rank }: { label: string; rank: { rank: number; capped: boolean } | null }) {
  const medal = rank && !rank.capped ? rankBadge(rank.rank) : null;
  const text = rank ? (rank.capped ? `#${rank.rank}+` : `#${rank.rank}`) : '—';
  return (
    <View style={styles.rankTile} accessible accessibilityLabel={`${label}: ${rank ? `rank ${rank.rank}` : 'not ranked yet'}`}>
      {medal ? (
        <RankBadge rank={rank!.rank} medal={medal} size={48} />
      ) : (
        <Text style={styles.rankBig}>{text}</Text>
      )}
      <Text style={styles.rankLabel} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function ClubScreen({ navigation, route }: Props) {
  const { clubId, created } = route.params;
  const [phase, setPhase] = useState<Phase>('loading');
  const [club, setClub] = useState<ClubProfile | null>(null);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(
    created ? { ok: true, text: 'Club created — share the code so runners can join, or let them find you in Find a club.' } : null,
  );
  const [busy, setBusy] = useState<'join' | 'report' | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [hiddenByMe, setHiddenByMe] = useState(false);
  const alive = useRef(true);
  const now = new Date();

  const load = useCallback(async () => {
    getHiddenClubs().then((h) => alive.current && setHiddenByMe(h.has(clubId)));
    const res = await loadClubProfile(clubId, localMonthKey(new Date()));
    if (!alive.current) return;
    if (res.status === 'ready') {
      setClub(res.club);
      setPhase('ready');
    } else {
      setMessage(res.message);
      setPhase(res.status);
    }
  }, [clubId]);

  useFocusEffect(
    useCallback(() => {
      alive.current = true;
      load();
      return () => {
        alive.current = false;
      };
    }, [load]),
  );

  async function onJoin() {
    if (busy || !club) return;
    setBusy('join');
    setNotice(null);
    const res = await joinOpenClub(club.id);
    if (!alive.current) return;
    setBusy(null);
    if (!res.ok) return setNotice({ ok: false, text: res.message });
    setNotice({ ok: true, text: `Welcome to ${club.name}! Your steps and runs now count for the club.` });
    load();
  }

  async function onShare() {
    if (!club) return;
    const rank = club.rankCountry && club.country ? ` — #${club.rankCountry.rank} in ${countryName(club.country)} this month` : '';
    const join = club.code
      ? ` Join us on Kasya with code ${club.code} (Groups → Join with code).`
      : ' Find us on Kasya under Groups → Running clubs.';
    try {
      await Share.share({ message: `${club.name}${rank}.${join}` });
    } catch {
      if (club.code) setNotice({ ok: true, text: `Sharing isn’t available here — send runners the code ${club.code}.` });
    }
  }

  async function onReport() {
    if (busy || !club || !reason) return;
    setBusy('report');
    const res = await reportClub(club.id, reason, note);
    if (!alive.current) return;
    setBusy(null);
    setNotice({ ok: res.ok, text: res.message });
    if (res.ok) {
      setReporting(false);
      setClub({ ...club, reportedByMe: true });
    }
  }

  async function onToggleHidden() {
    const next = !hiddenByMe;
    await setClubHidden(clubId, next);
    if (!alive.current) return;
    setHiddenByMe(next);
    setNotice({
      ok: true,
      text: next
        ? 'Hidden — this club won’t show in your rankings or search. Only you see this change.'
        : 'This club shows in your rankings and search again.',
    });
  }

  const title = club?.name ?? route.params.name ?? 'Club';
  let body;
  if (phase === 'loading') {
    body = (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  } else if (phase !== 'ready' || !club) {
    body = (
      <EmptyState
        icon={phase === 'not_found' ? 'flag' : 'wifi-off'}
        title={phase === 'not_found' ? 'Club not found' : 'Couldn’t load the club'}
        body={message || 'Check your connection and try again.'}
        action={
          phase === 'not_found'
            ? { label: 'Back', onPress: () => navigation.goBack() }
            : {
                label: 'Try again',
                onPress: () => {
                  setPhase('loading');
                  load();
                },
              }
        }
      />
    );
  } else {
    const pace = paceSecPerKm(club.stats.runM, club.stats.runSec);
    const goalM = club.goalKm ? club.goalKm * 1000 : 0;
    const place = [club.city, club.country ? countryName(club.country) : null].filter(Boolean).join(', ');
    body = (
      <>
        {notice ? <Notice ok={notice.ok} text={notice.text} /> : null}
        {club.hidden ? (
          <Notice
            ok={false}
            text="This club is hidden from rankings and search while we review reports about it. Members can still use it as usual."
          />
        ) : null}

        <View style={styles.hero}>
          <ClubAvatar photoUrl={club.photoUrl} emblem={club.emblem} size={96} />
          <Text style={[T.h1, styles.heroName]} accessibilityRole="header">
            {club.name}
          </Text>
          {place ? (
            <Text style={styles.heroPlace}>
              {club.country ? `${flagEmoji(club.country)} ` : ''}
              {place}
            </Text>
          ) : null}
          <View style={styles.heroChips}>
            <View style={styles.pill}>
              <Feather name="users" size={13} color={colors.inkSoft} />
              <Text style={styles.pillText}>
                {club.memberCount} {club.memberCount === 1 ? 'member' : 'members'}
              </Text>
            </View>
            <View style={styles.pill}>
              <Feather name={club.open ? 'unlock' : 'lock'} size={13} color={colors.inkSoft} />
              <Text style={styles.pillText}>{club.open ? 'Open club' : 'Invite-only'}</Text>
            </View>
          </View>
          {club.about ? <Text style={[T.body, styles.about]}>{club.about}</Text> : null}
        </View>

        <Card style={{ marginTop: spacing.xl }}>
          <Label>{monthName(now)} standings · steps</Label>
          <View style={styles.rankRow}>
            <RankTile label={club.country ? `in ${countryName(club.country)}` : 'in its country'} rank={club.rankCountry} />
            <View style={styles.divider} />
            <RankTile label="worldwide" rank={club.rankGlobal} />
          </View>
        </Card>

        <Card style={{ marginTop: spacing.lg }}>
          <Label>This month together</Label>
          <View style={styles.stats}>
            <Stat value={formatCount(club.stats.steps)} label="steps" />
            <Stat value={formatKm(club.stats.runM)} label="km run" />
            <Stat value={formatPace(pace)} label="avg pace /km" />
            <Stat value={formatCount(club.stats.activeMin)} label="active min" />
          </View>
          {goalM > 0 ? (
            <View style={{ marginTop: spacing.lg }}>
              <View style={styles.goalHead}>
                <Text style={styles.goalText}>
                  {formatKm(club.stats.runM)} of {formatCount(club.goalKm!)} km
                </Text>
                <Text style={T.small}>monthly goal</Text>
              </View>
              <ProgressBar
                progress={club.stats.runM / goalM}
                label={`${formatKm(club.stats.runM)} of ${club.goalKm} kilometres — club goal for the month`}
              />
            </View>
          ) : null}
        </Card>

        <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
          {club.isMember ? (
            <>
              <Button
                label="Members & leaderboard"
                variant="accent"
                icon="bar-chart-2"
                onPress={() => navigation.navigate('GroupDetail', { groupId: club.id, name: club.name })}
              />
              <Button label="Invite runners" variant="secondary" icon="share" onPress={onShare} />
              {club.isOwner ? (
                <Button
                  label="Edit club"
                  variant="secondary"
                  icon="edit-2"
                  onPress={() => navigation.navigate('ClubEdit', { clubId: club.id })}
                />
              ) : null}
            </>
          ) : club.open ? (
            <>
              <Button label="Join club" variant="accent" icon="user-plus" onPress={onJoin} loading={busy === 'join'} />
              <LegalNote privacy={false} lead="By joining you agree to the community rules in Kasya’s" style={{ textAlign: 'center' }} />
              <Button label="Share club" variant="secondary" icon="share" onPress={onShare} />
            </>
          ) : (
            <Card>
              <Text style={T.title}>Invite-only club</Text>
              <Text style={[T.bodyMuted, { marginTop: spacing.xs }]}>
                Ask a member for the code, then enter it under Groups → Friends → Join with code.
              </Text>
            </Card>
          )}
        </View>

        {club.isMember && club.code ? (
          <Card style={{ marginTop: spacing.lg }}>
            <Label>Club code</Label>
            <View style={styles.codeRow}>
              <Text style={styles.code} selectable accessibilityLabel={`Club code ${club.code.split('').join(' ')}`}>
                {club.code}
              </Text>
              <Text style={[T.small, { flex: 1, marginLeft: spacing.md }]}>
                {club.memberCount}/{CLUB_LIMITS.maxMembersPerClub} members
              </Text>
            </View>
          </Card>
        ) : null}

        <View style={styles.privacy}>
          <Feather name="lock" size={14} color={colors.muted} />
          <Text style={styles.privacyText}>
            The club page shows only club totals. Members see each other’s first names and daily totals — steps,
            active minutes and run distance. Routes never leave your phone.
          </Text>
        </View>

        {!club.isOwner ? (
          club.reportedByMe ? (
            <Text style={[T.small, { marginTop: spacing.xl }]}>You reported this club — thanks, we’ll take a look.</Text>
          ) : reporting ? (
            <Card style={{ marginTop: spacing.xl }}>
              <Text style={T.title}>Report this club</Text>
              <Text style={[T.small, { marginTop: 2, marginBottom: spacing.md }]}>
                What’s wrong? Clubs with several reports are hidden until we review them.
              </Text>
              <View style={styles.reasons}>
                {REPORT_REASONS.map((r) => (
                  <Chip key={r} label={REASON_LABEL[r]} selected={reason === r} onPress={() => setReason(r)} />
                ))}
              </View>
              <View style={{ marginTop: spacing.md }}>
                <TextField
                  label="Details (optional)"
                  value={note}
                  onChangeText={setNote}
                  placeholder="Anything that helps us review it"
                  maxLength={CLUB_LIMITS.reportNoteMax}
                />
              </View>
              <View style={styles.reportBtns}>
                <View style={{ flex: 1 }}>
                  <Button label="Cancel" variant="secondary" onPress={() => setReporting(false)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label="Send report" variant="primary" onPress={onReport} disabled={!reason} loading={busy === 'report'} />
                </View>
              </View>
            </Card>
          ) : (
            <Pressable
              onPress={() => setReporting(true)}
              accessibilityRole="button"
              accessibilityLabel="Report this club"
              style={styles.reportLink}
            >
              <Feather name="flag" size={16} color={colors.muted} />
              <Text style={styles.reportText}>Report this club</Text>
            </Pressable>
          )
        ) : null}
        {!club.isMember ? (
          <Pressable
            onPress={onToggleHidden}
            accessibilityRole="button"
            accessibilityLabel={hiddenByMe ? 'Show this club again' : 'Hide this club from my rankings and search'}
            style={styles.reportLink}
          >
            <Feather name={hiddenByMe ? 'eye' : 'eye-off'} size={16} color={colors.muted} />
            <Text style={styles.reportText}>{hiddenByMe ? 'Show this club again' : 'Hide this club'}</Text>
          </Pressable>
        ) : null}
      </>
    );
  }

  return (
    <ScreenContainer
      title={title}
      onBack={() => navigation.goBack()}
      keyboardAware
      right={
        <Pressable
          onPress={load}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Refresh club"
          style={styles.iconBtn}
        >
          <Feather name="refresh-cw" size={18} color={colors.ink} />
        </Pressable>
      }
    >
      {body}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: spacing.xxxl, alignItems: 'center' },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  hero: { alignItems: 'center', marginTop: spacing.md },
  heroName: { marginTop: spacing.lg, textAlign: 'center' },
  heroPlace: { fontFamily: fonts.medium, fontSize: 14, color: colors.inkSoft, marginTop: spacing.xs },
  heroChips: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 5,
    paddingHorizontal: spacing.md,
  },
  pillText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.inkSoft },
  about: { textAlign: 'center', marginTop: spacing.md },
  rankRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md },
  rankTile: { flex: 1, alignItems: 'center', minHeight: 72, justifyContent: 'center' },
  rankBig: { fontFamily: fonts.extra, fontSize: 28, color: colors.ink },
  rankLabel: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted, marginTop: spacing.xs, textAlign: 'center' },
  divider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.line, marginHorizontal: spacing.md },
  stats: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.md, rowGap: spacing.lg },
  stat: { width: '50%' },
  statValue: { fontFamily: fonts.extra, fontSize: 22, color: colors.ink },
  statLabel: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, marginTop: 2 },
  goalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: spacing.sm },
  goalText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  codeRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md },
  code: { fontFamily: fonts.extra, fontSize: 28, letterSpacing: 4, color: colors.accentInk },
  privacy: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.xl },
  privacyText: { flex: 1, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: colors.muted },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  reportBtns: { flexDirection: 'row', gap: spacing.md },
  reportLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44, marginTop: spacing.xl },
  reportText: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted },
});
