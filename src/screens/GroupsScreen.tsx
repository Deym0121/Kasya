import { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { RootScreenProps } from '../navigation';
import { colors, spacing, radius, type as T, fonts } from '../theme';
import { ScreenContainer, Button, Card, TextField, Badge, EmptyState, Label } from '../components';
import { GROUP_LIMITS, cleanGroupName, normalizeInviteCode } from '../groups/rules';
import { formatCount, levelForSteps, levelTitle, rankBadge, weekRange } from '../groups/levels';
import { createGroup, joinGroup, loadMyGroups, resyncStepDays } from '../groups/api';
import type { GroupsAvailability, MyGroup } from '../groups/api';
import { Notice, PrivacyLine, ProgressBar, RankBadge, Segmented } from '../groups/ui';
import { ClubsHub } from '../clubs/ClubsHub';

type Props = RootScreenProps<'Groups'>;
type Phase = 'loading' | GroupsAvailability;
type Tab = 'friends' | 'clubs';

const TABS: { key: Tab; label: string }[] = [
  { key: 'friends', label: 'Friends' },
  { key: 'clubs', label: 'Running clubs' },
];

function LevelCard({ lifetimeSteps, inGroups }: { lifetimeSteps: number; inGroups: boolean }) {
  const info = levelForSteps(lifetimeSteps);
  const maxed = info.toNext === 0;
  return (
    <Card>
      <Label>Your level</Label>
      <View style={styles.levelRow}>
        <View style={styles.levelBadge} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text style={styles.levelNum}>{info.level}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: spacing.lg }}>
          <Text style={T.h2} accessibilityRole="header">
            Level {info.level} · {levelTitle(info.level)}
          </Text>
          <Text style={[T.small, { marginTop: 2 }]}>{formatCount(lifetimeSteps)} lifetime steps</Text>
        </View>
      </View>
      <View style={{ marginTop: spacing.lg }}>
        <ProgressBar
          progress={info.progress}
          label={maxed ? 'Top level reached' : `${formatCount(info.toNext)} steps to level ${info.level + 1}`}
        />
      </View>
      <Text style={[T.small, { marginTop: spacing.sm }]}>
        {maxed
          ? 'Top level — nothing left to unlock. Legendary.'
          : `${formatCount(info.toNext)} steps to Level ${info.level + 1}`}
      </Text>
      {!inGroups ? (
        <Text style={[T.small, { marginTop: spacing.sm }]}>
          Your level starts counting once you’re in a group — until then your steps stay on this phone.
        </Text>
      ) : null}
    </Card>
  );
}

function GroupRow({ g, onPress }: { g: MyGroup; onPress: () => void }) {
  const medal = g.myRank ? rankBadge(g.myRank) : null;
  const members = `${g.memberCount} ${g.memberCount === 1 ? 'member' : 'members'}`;
  const rankText = g.myRank ? `You’re #${g.myRank} this week` : 'This week’s race is on';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${g.name}, ${members}. ${rankText}`}
      style={({ pressed }) => [styles.groupRow, pressed && { opacity: 0.94 }]}
    >
      {g.myRank && medal ? (
        <RankBadge rank={g.myRank} medal={medal} size={48} />
      ) : (
        <View style={styles.groupIcon}>
          <Feather name="users" size={18} color={colors.accentInk} />
        </View>
      )}
      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <View style={styles.groupTitleRow}>
          <Text style={styles.groupName} numberOfLines={1}>
            {g.name}
          </Text>
          {g.role === 'owner' ? <Badge label="Owner" tint={colors.surfaceAlt} color={colors.inkSoft} /> : null}
        </View>
        <Text style={styles.groupMeta}>
          {members} · {rankText}
        </Text>
      </View>
      <Feather name="chevron-right" size={20} color={colors.muted} />
    </Pressable>
  );
}

export default function GroupsScreen({ navigation, route }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [tab, setTab] = useState<Tab>(route.params?.tab ?? 'friends');
  const [all, setAll] = useState<MyGroup[]>([]);
  const [lifetimeSteps, setLifetimeSteps] = useState(0);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const [codeError, setCodeError] = useState<string | undefined>();
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    // Push today's totals alongside the load (no-op unless signed in AND in a
    // group); if they changed, refresh once so my rank and level include them.
    const sync = resyncStepDays({ force: false });
    const apply = (res: Awaited<ReturnType<typeof loadMyGroups>>) => {
      if (!alive.current) return;
      setAll(res.groups);
      setLifetimeSteps(res.lifetimeSteps);
      setPhase(res.availability);
    };
    apply(await loadMyGroups(weekRange(new Date())));
    if ((await sync) === 'uploaded' && alive.current) apply(await loadMyGroups(weekRange(new Date())));
  }, []);

  // Re-check on every focus: coming back from SignIn or a group changes the answer.
  useFocusEffect(
    useCallback(() => {
      alive.current = true;
      load();
      return () => {
        alive.current = false;
      };
    }, [load]),
  );

  const groups = all.filter((g) => g.kind !== 'club');
  const clubs = all.filter((g) => g.kind === 'club');
  const atLimit = all.length >= GROUP_LIMITS.maxGroupsPerUser;

  async function onCreate() {
    if (busy) return;
    setNotice(null);
    const check = cleanGroupName(name);
    if (!check.ok) return setNameError(check.message);
    setBusy('create');
    const res = await createGroup(check.name);
    if (!alive.current) return;
    setBusy(null);
    if (!res.ok) return setNotice({ ok: false, text: res.message });
    setName('');
    navigation.navigate('GroupDetail', { groupId: res.groupId, name: check.name, created: true });
  }

  async function onJoin() {
    if (busy) return;
    setNotice(null);
    const normalized = normalizeInviteCode(code);
    if (!normalized) return setCodeError('Invite codes are 6 letters and numbers, like K7M2QX.');
    setBusy('join');
    const res = await joinGroup(normalized);
    if (!alive.current) return;
    setBusy(null);
    if (!res.ok) return setNotice({ ok: false, text: res.message });
    setCode('');
    navigation.navigate('GroupDetail', { groupId: res.groupId });
  }

  const retry = () => {
    setPhase('loading');
    load();
  };

  let body;
  if (phase === 'loading') {
    body = (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  } else if (phase === 'no_cloud') {
    body = (
      <EmptyState
        icon="users"
        title="Groups are coming soon"
        body="Racing friends needs a Kasya account, which this version doesn’t support yet. Your steps keep counting on this phone."
      />
    );
  } else if (phase === 'unavailable') {
    body = (
      <EmptyState
        icon="users"
        title="Groups are taking a breather"
        body="We couldn’t reach groups just now. Check your connection and try again."
        action={{ label: 'Try again', onPress: retry }}
      />
    );
  } else if (phase === 'signed_out') {
    body = (
      <>
        <EmptyState
          icon="users"
          title="Sign in to race your friends"
          body="Create a group, invite friends with a code, or join a running club and race other clubs every month. Groups and clubs are tied to your Kasya account — sign in with Apple or Google to start."
          action={{ label: 'Sign in', onPress: () => navigation.navigate('SignIn') }}
        />
        <PrivacyLine />
      </>
    );
  } else {
    body = (
      <>
        <LevelCard lifetimeSteps={lifetimeSteps} inGroups={all.length > 0} />
        <PrivacyLine />

        <View style={{ marginTop: spacing.xl }}>
          <Segmented options={TABS} value={tab} onChange={setTab} />
        </View>

        {tab === 'clubs' ? (
          <ClubsHub
            clubs={clubs}
            ownedClubs={clubs.filter((c) => c.role === 'owner').length}
            atGroupLimit={atLimit}
            onOpenClub={(id, name) => navigation.navigate('Club', { clubId: id, name })}
            onStartClub={() => navigation.navigate('ClubEdit', {})}
          />
        ) : (
        <>
        <View style={{ marginTop: spacing.xxl }}>
          <Label>My groups</Label>
          {groups.length === 0 ? (
            <Text style={[T.small, { marginTop: spacing.sm }]}>
              No groups yet — start one and invite friends, or join with a code a friend sent you.
            </Text>
          ) : (
            groups.map((g) => (
              <GroupRow
                key={g.id}
                g={g}
                onPress={() => navigation.navigate('GroupDetail', { groupId: g.id, name: g.name })}
              />
            ))
          )}
        </View>

        {notice ? (
          <View style={{ marginTop: spacing.xl }}>
            <Notice ok={notice.ok} text={notice.text} />
          </View>
        ) : null}

        {atLimit ? (
          <Text style={[T.small, { marginTop: spacing.xl }]}>
            You’re in {GROUP_LIMITS.maxGroupsPerUser} groups and clubs — the most you can be in. Leave one to start or join
            another.
          </Text>
        ) : (
          <>
            <Card style={{ marginTop: spacing.xl }}>
              <Text style={T.title}>Start a group</Text>
              <Text style={[T.small, { marginTop: 2, marginBottom: spacing.lg }]}>
                You’ll get a code to share with friends.
              </Text>
              <TextField
                label="Group name"
                value={name}
                onChangeText={(t) => {
                  setName(t);
                  setNameError(undefined);
                }}
                placeholder="e.g. Sunday Long Run Crew"
                autoCapitalize="words"
                icon="users"
                maxLength={GROUP_LIMITS.nameMax}
                error={nameError}
              />
              <Button label="Create group" variant="accent" icon="plus" onPress={onCreate} loading={busy === 'create'} />
            </Card>

            <Card style={{ marginTop: spacing.lg }}>
              <Text style={T.title}>Join with code</Text>
              <Text style={[T.small, { marginTop: 2, marginBottom: spacing.lg }]}>
                Got an invite to a group or club? Enter the 6-character code.
              </Text>
              <TextField
                label="Invite code"
                value={code}
                onChangeText={(t) => {
                  setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, GROUP_LIMITS.codeLength));
                  setCodeError(undefined);
                }}
                placeholder="K7M2QX"
                autoCapitalize="none"
                icon="hash"
                maxLength={GROUP_LIMITS.codeLength}
                error={codeError}
              />
              <Button label="Join group" variant="secondary" icon="log-in" onPress={onJoin} loading={busy === 'join'} />
            </Card>
          </>
        )}
        </>
        )}
      </>
    );
  }

  return (
    <ScreenContainer
      title="Groups & clubs"
      onBack={() => navigation.goBack()}
      keyboardAware
      right={
        phase === 'ready' ? (
          <Pressable
            onPress={load}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Refresh groups"
            style={styles.iconBtn}
          >
            <Feather name="refresh-cw" size={18} color={colors.ink} />
          </Pressable>
        ) : undefined
      }
    >
      {body}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: spacing.xxxl, alignItems: 'center' },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  levelRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md },
  levelBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelNum: { fontFamily: fonts.extra, fontSize: 24, color: colors.onDark },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  groupIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  groupName: { flexShrink: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  groupMeta: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, marginTop: 2 },
});
