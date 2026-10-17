import { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable, Share } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { RootScreenProps } from '../navigation';
import { colors, spacing, radius, type as T, fonts } from '../theme';
import { ScreenContainer, Button, Card, TextField, EmptyState, Label } from '../components';
import { GROUP_LIMITS, cleanGroupName } from '../groups/rules';
import { formatCount, formatRange, levelForSteps, monthRange, rankBadge, weekRange } from '../groups/levels';
import type { DayRange, Medal } from '../groups/levels';
import {
  deleteGroup,
  leaveGroup,
  loadLeaderboard,
  removeMember,
  renameGroup,
  resyncStepDays,
} from '../groups/api';
import type { Leaderboard, LeaderboardLoad, LeaderboardMember } from '../groups/api';
import { LevelChip, MEDAL_COLORS, Notice, PrivacyLine, RankBadge, Segmented, useTwoTap } from '../groups/ui';

type Props = RootScreenProps<'GroupDetail'>;
type Period = 'week' | 'month';
type Phase = 'loading' | 'ready' | Exclude<LeaderboardLoad['status'], 'ready'>;

const PERIODS: { key: Period; label: string }[] = [
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
];

const rangeFor = (p: Period): DayRange => (p === 'week' ? weekRange(new Date()) : monthRange(new Date()));

/** 1st in the middle (tallest), 2nd left, 3rd right. */
const PODIUM_ORDER = [1, 0, 2];
const PEDESTAL: Record<Medal, number> = { gold: 64, silver: 44, bronze: 30 };

function Podium({ top }: { top: LeaderboardMember[] }) {
  return (
    <View style={styles.podium} accessibilityLabel="Top three">
      {PODIUM_ORDER.filter((i) => i < top.length).map((i) => {
        const m = top[i];
        const medal = rankBadge(m.rank) as Medal;
        const first = m.rank === 1;
        return (
          <View key={m.userId} style={styles.podiumCol}>
            <RankBadge rank={m.rank} medal={medal} size={first ? 100 : 80} />
            <Text style={[styles.podiumName, m.isMe && { color: colors.accentInk }]} numberOfLines={1}>
              {m.isMe ? 'You' : m.displayName}
            </Text>
            <Text style={styles.podiumSteps}>{formatCount(m.steps)}</Text>
            <View style={{ marginTop: spacing.xs }}>
              <LevelChip level={levelForSteps(m.lifetimeSteps).level} />
            </View>
            <View
              style={[styles.pedestal, { height: PEDESTAL[medal], borderTopColor: MEDAL_COLORS[medal] }]}
              importantForAccessibility="no"
            />
          </View>
        );
      })}
    </View>
  );
}

function MemberRow({
  m,
  canRemove,
  armed,
  onRemove,
}: {
  m: LeaderboardMember;
  canRemove: boolean;
  armed: boolean;
  onRemove: () => void;
}) {
  const level = levelForSteps(m.lifetimeSteps).level;
  const name = m.isMe ? `${m.displayName} (you)` : m.displayName;
  return (
    <View
      style={[styles.row, m.isMe && styles.rowMe]}
      accessible={!canRemove}
      accessibilityLabel={`Rank ${m.rank}, ${name}, level ${level}, ${formatCount(m.steps)} steps, ${m.activeMin} active minutes`}
    >
      <RankBadge rank={m.rank} medal={rankBadge(m.rank)} size={42} />
      <View style={{ flex: 1, marginHorizontal: spacing.md }}>
        <View style={styles.rowNameLine}>
          <Text style={styles.rowName} numberOfLines={1}>
            {name}
          </Text>
          <LevelChip level={level} />
        </View>
        <Text style={styles.rowMeta}>
          {m.activeMin} active min{m.role === 'owner' ? ' · Owner' : ''}
        </Text>
        {armed ? <Text style={styles.armed}>Tap again to remove {m.displayName}</Text> : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.rowSteps}>{formatCount(m.steps)}</Text>
        <Text style={styles.rowStepsUnit}>steps</Text>
      </View>
      {canRemove ? (
        <Pressable
          onPress={onRemove}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={armed ? `Confirm removing ${m.displayName}` : `Remove ${m.displayName} from the group`}
          style={styles.removeBtn}
        >
          <Feather name="user-x" size={18} color={armed ? colors.danger : colors.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

export default function GroupDetailScreen({ navigation, route }: Props) {
  const { groupId, created } = route.params;
  const [period, setPeriod] = useState<Period>('week');
  const [phase, setPhase] = useState<Phase>('loading');
  const [message, setMessage] = useState('');
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(
    created ? { ok: true, text: 'Group created — invite friends with the code below to start the race.' } : null,
  );
  const [renameText, setRenameText] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | undefined>();
  const [busy, setBusy] = useState<string | null>(null);
  const { armed, confirm, disarm } = useTwoTap();
  const alive = useRef(true);
  const periodRef = useRef<Period>('week');

  const load = useCallback(
    async (p: Period = periodRef.current) => {
      const sync = resyncStepDays({ force: false }); // my latest totals, if any changed
      const apply = (res: LeaderboardLoad) => {
        if (!alive.current || periodRef.current !== p) return;
        if (res.status === 'ready') {
          setBoard(res.board);
          setPhase('ready');
        } else {
          setMessage(res.message);
          setPhase(res.status);
        }
      };
      apply(await loadLeaderboard(groupId, rangeFor(p)));
      if ((await sync) === 'uploaded' && alive.current) apply(await loadLeaderboard(groupId, rangeFor(p)));
    },
    [groupId],
  );

  useFocusEffect(
    useCallback(() => {
      alive.current = true;
      load();
      return () => {
        alive.current = false;
      };
    }, [load]),
  );

  function pickPeriod(p: Period) {
    if (p === period) return;
    periodRef.current = p;
    setPeriod(p);
    setPhase('loading');
    load(p);
  }

  const group = board?.group;
  const title = group?.name ?? route.params.name ?? 'Group';
  const members = board?.members ?? [];
  const me = members.find((m) => m.isMe);
  const isOwner = !!group?.isOwner;
  const range = rangeFor(period);
  const onlyMe = members.length <= 1;
  const anySteps = members.some((m) => m.steps > 0);

  async function onInvite() {
    if (!group) return;
    const invite = `Join my Kasya group '${group.name}' — code ${group.code}. Open Kasya, go to Groups and tap Join with code.`;
    try {
      await Share.share({ message: invite });
    } catch {
      setNotice({ ok: true, text: `Sharing isn’t available here — send your friends the code ${group.code}.` });
    }
  }

  async function run(key: string, action: () => Promise<{ ok: boolean; message: string }>, after?: () => void) {
    if (busy) return;
    setBusy(key);
    setNotice(null);
    const res = await action();
    if (!alive.current) return;
    setBusy(null);
    if (!res.ok) return setNotice({ ok: false, text: res.message });
    if (after) after();
    else {
      setNotice({ ok: true, text: res.message });
      load();
    }
  }

  function onRemove(m: LeaderboardMember) {
    if (!confirm(`remove:${m.userId}`)) return;
    run(`remove:${m.userId}`, () => removeMember(groupId, m.userId));
  }

  function onLeave() {
    if (!confirm('leave')) return;
    run('leave', () => leaveGroup(groupId), () => navigation.goBack());
  }

  function onDelete() {
    if (!confirm('delete')) return;
    run('delete', () => deleteGroup(groupId), () => navigation.goBack());
  }

  function onRename() {
    if (renameText === null) return;
    const check = cleanGroupName(renameText);
    if (!check.ok) return setRenameError(check.message);
    run('rename', () => renameGroup(groupId, check.name), () => {
      setRenameText(null);
      setNotice({ ok: true, text: 'Group renamed.' });
      load();
    });
  }

  const heir = members
    .filter((m) => !m.isMe)
    .sort((a, b) => a.joinedAt - b.joinedAt)[0];
  const leaveHint = isOwner
    ? heir
      ? `Tap again to leave — ${heir.displayName} becomes the owner.`
      : 'Tap again to leave — you’re the only member, so the group will be deleted.'
    : 'Tap again to leave. Your steps stop showing here.';

  let body;
  if (phase === 'loading') {
    body = (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  } else if (phase === 'not_member') {
    body = (
      <EmptyState
        icon="users"
        title="You’re not in this group"
        body="It may have been deleted, or you were removed. Your other groups are still on the Groups screen."
        action={{ label: 'Back to groups', onPress: () => navigation.goBack() }}
      />
    );
  } else if (phase === 'signed_out') {
    body = (
      <EmptyState
        icon="user"
        title="Sign in to see this group"
        body={message}
        action={{ label: 'Sign in', onPress: () => navigation.navigate('SignIn') }}
      />
    );
  } else if (phase !== 'ready' || !group) {
    body = (
      <EmptyState
        icon="wifi-off"
        title="Couldn’t load the leaderboard"
        body={message || 'Check your connection and try again.'}
        action={{
          label: 'Try again',
          onPress: () => {
            setPhase('loading');
            load();
          },
        }}
      />
    );
  } else {
    body = (
      <>
        {notice ? <Notice ok={notice.ok} text={notice.text} /> : null}

        {onlyMe ? (
          <Card>
            <View style={{ alignItems: 'center' }}>
              <View style={styles.inviteIcon}>
                <Feather name="user-plus" size={24} color={colors.accentInk} />
              </View>
              <Text style={[T.title, { marginTop: spacing.md, textAlign: 'center' }]}>
                Invite friends to start the race
              </Text>
              <Text style={[T.bodyMuted, { marginTop: spacing.xs, textAlign: 'center' }]}>
                Share the code — everyone who joins shows up here, ranked by steps.
              </Text>
            </View>
          </Card>
        ) : anySteps ? (
          <Podium top={members.slice(0, 3)} />
        ) : (
          <Card>
            <Text style={T.title}>No steps yet {period === 'week' ? 'this week' : 'this month'}</Text>
            <Text style={[T.bodyMuted, { marginTop: spacing.xs }]}>
              The first one to get moving takes gold.
            </Text>
          </Card>
        )}

        <View style={styles.listHead}>
          <Label>Leaderboard</Label>
          <Text style={T.small}>{formatRange(range)}</Text>
        </View>
        {members.map((m) => (
          <MemberRow
            key={m.userId}
            m={m}
            canRemove={isOwner && !m.isMe}
            armed={armed === `remove:${m.userId}`}
            onRemove={() => onRemove(m)}
          />
        ))}
        <Text style={[T.small, { marginTop: spacing.md }]}>
          Totals update when each member opens Kasya.{me && me.steps === 0 ? ' Yours appear after your steps load on this phone.' : ''}
        </Text>

        <Card style={{ marginTop: spacing.xl }}>
          <Label>Invite</Label>
          <View style={styles.codeRow}>
            <Text style={styles.code} selectable accessibilityLabel={`Invite code ${group.code.split('').join(' ')}`}>
              {group.code}
            </Text>
            <Text style={[T.small, { flex: 1, marginLeft: spacing.md }]}>
              {group.memberCount}/{GROUP_LIMITS.maxMembersPerGroup} members
            </Text>
          </View>
          <Button label="Invite friends" variant="accent" icon="share" onPress={onInvite} />
          <PrivacyLine />
        </Card>

        {isOwner ? (
          <Card style={{ marginTop: spacing.lg }}>
            <Label>Manage group</Label>
            {renameText === null ? (
              <Pressable
                onPress={() => {
                  setRenameText(group.name);
                  setRenameError(undefined);
                }}
                accessibilityRole="button"
                accessibilityLabel="Rename group"
                style={styles.actionRow}
              >
                <Feather name="edit-2" size={18} color={colors.ink} />
                <Text style={styles.actionLabel}>Rename group</Text>
                <Feather name="chevron-right" size={18} color={colors.muted} />
              </Pressable>
            ) : (
              <View style={{ marginTop: spacing.md }}>
                <TextField
                  label="Group name"
                  value={renameText}
                  onChangeText={(t) => {
                    setRenameText(t);
                    setRenameError(undefined);
                  }}
                  autoCapitalize="words"
                  maxLength={GROUP_LIMITS.nameMax}
                  error={renameError}
                />
                <View style={styles.renameBtns}>
                  <View style={{ flex: 1 }}>
                    <Button label="Cancel" variant="secondary" onPress={() => setRenameText(null)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button label="Save" variant="primary" onPress={onRename} loading={busy === 'rename'} />
                  </View>
                </View>
              </View>
            )}
            <Pressable
              onPress={onDelete}
              accessibilityRole="button"
              accessibilityLabel={armed === 'delete' ? 'Confirm deleting the group' : 'Delete group'}
              style={styles.actionRow}
            >
              <Feather name="trash-2" size={18} color={colors.danger} />
              <Text style={[styles.actionLabel, { color: colors.danger }]}>
                {armed === 'delete' ? 'Tap again to delete for everyone' : 'Delete group'}
              </Text>
              {busy === 'delete' ? <ActivityIndicator color={colors.danger} /> : null}
            </Pressable>
          </Card>
        ) : null}

        <Pressable
          onPress={onLeave}
          accessibilityRole="button"
          accessibilityLabel={armed === 'leave' ? 'Confirm leaving the group' : 'Leave group'}
          style={[styles.actionRow, styles.leaveRow]}
        >
          <Feather name="log-out" size={18} color={colors.danger} />
          <Text style={[styles.actionLabel, { color: colors.danger }]}>
            {armed === 'leave' ? leaveHint : 'Leave group'}
          </Text>
          {busy === 'leave' ? <ActivityIndicator color={colors.danger} /> : null}
        </Pressable>
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
          onPress={() => {
            disarm();
            load();
          }}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Refresh leaderboard"
          style={styles.iconBtn}
        >
          <Feather name="refresh-cw" size={18} color={colors.ink} />
        </Pressable>
      }
    >
      <View style={{ marginBottom: spacing.xl }}>
        <Segmented options={PERIODS} value={period} onChange={pickPeriod} />
      </View>
      {body}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: spacing.xxxl, alignItems: 'center' },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  podium: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: spacing.md },
  podiumCol: { flex: 1, maxWidth: 120, alignItems: 'center' },
  podiumName: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.ink,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  podiumSteps: { fontFamily: fonts.extra, fontSize: 16, color: colors.ink, marginTop: 2 },
  pedestal: {
    alignSelf: 'stretch',
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderTopWidth: 3,
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm,
  },
  inviteIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xxl,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  rowMe: { borderColor: colors.accent },
  rowNameLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowName: { flexShrink: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  rowMeta: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, marginTop: 2 },
  rowSteps: { fontFamily: fonts.extra, fontSize: 16, color: colors.ink },
  rowStepsUnit: { fontFamily: fonts.regular, fontSize: 11, color: colors.muted },
  armed: { fontFamily: fonts.semibold, fontSize: 12, color: colors.danger, marginTop: 4 },
  removeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginLeft: spacing.sm },
  codeRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.lg },
  code: { fontFamily: fonts.extra, fontSize: 28, letterSpacing: 4, color: colors.accentInk },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 48,
    marginTop: spacing.sm,
  },
  actionLabel: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: colors.ink },
  renameBtns: { flexDirection: 'row', gap: spacing.md },
  leaveRow: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
});
