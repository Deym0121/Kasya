import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { colors, fonts, radius, spacing, type as T } from '../theme';
import { Button, Card, Label } from '../components';
import { Segmented } from '../groups/ui';
import type { MyGroup } from '../groups/api';
import { countryName, flagEmoji, guessCountry } from './countries';
import { CLUB_LIMITS, CLUB_METRICS, METRIC_LABEL, addMonths, localMonthKey, type ClubMetric } from './rules';
import { loadRankings, searchClubs, type ClubRankRow, type ClubSearchRow, type RankingsLoad } from './api';
import { ClubAvatar, ClubRankItem, CountryPicker, placeLabel } from './ui';
import { getHiddenClubs } from './hidden';

/**
 * The Clubs tab of the Groups screen: my clubs, start / find a club, and the
 * monthly club rankings — by country (default: my club's, else this phone's)
 * or worldwide, on steps, run distance or run pace.
 */

type Scope = 'country' | 'world';
type MonthPick = 'this' | 'last';

const MONTHS: { key: MonthPick; label: string }[] = [
  { key: 'this', label: 'This month' },
  { key: 'last', label: 'Last month' },
];
const METRIC_OPTIONS = CLUB_METRICS.map((k) => ({ key: k, label: METRIC_LABEL[k] }));

function deviceCountry(): string {
  try {
    const o = Intl.DateTimeFormat().resolvedOptions();
    return guessCountry(o.timeZone, o.locale);
  } catch {
    return guessCountry(null, null);
  }
}

export function ClubsHub({
  clubs,
  ownedClubs,
  atGroupLimit,
  onOpenClub,
  onStartClub,
}: {
  clubs: MyGroup[];
  ownedClubs: number;
  atGroupLimit: boolean;
  onOpenClub: (id: string, name?: string) => void;
  onStartClub: () => void;
}) {
  const [scope, setScope] = useState<Scope>('country');
  const [country, setCountry] = useState<string>(() => clubs.find((c) => c.country)?.country ?? deviceCountry());
  const [month, setMonth] = useState<MonthPick>('this');
  const [metric, setMetric] = useState<ClubMetric>('steps');
  const [board, setBoard] = useState<RankingsLoad | null>(null);
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<ClubSearchRow[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const ticket = useRef(0);

  const monthKey = useMemo(() => {
    const now = localMonthKey(new Date());
    return month === 'this' ? now : addMonths(now, -1);
  }, [month]);

  const load = useCallback(async () => {
    const mine = ++ticket.current;
    setBoard(null);
    getHiddenClubs().then(setHidden);
    const res = await loadRankings(monthKey, scope === 'country' ? country : null, metric);
    if (mine === ticket.current) setBoard(res);
  }, [monthKey, scope, country, metric]);

  useEffect(() => {
    load();
  }, [load, clubs.length]);

  // Back from a club page: pick up a club I just hid (or showed again).
  useFocusEffect(
    useCallback(() => {
      getHiddenClubs().then(setHidden);
    }, []),
  );

  // Club search, debounced.
  useEffect(() => {
    const t = query.trim();
    if (t.length < 2) {
      setFound(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const id = setTimeout(async () => {
      const rows = await searchClubs(t, null);
      setFound(rows ?? []);
      setSearching(false);
    }, 350);
    return () => clearTimeout(id);
  }, [query]);

  const canStart = !atGroupLimit && clubs.length < CLUB_LIMITS.maxClubsPerUser && ownedClubs < CLUB_LIMITS.maxOwnedClubs;
  const startBlocked =
    ownedClubs >= CLUB_LIMITS.maxOwnedClubs
      ? `You run ${CLUB_LIMITS.maxOwnedClubs} clubs — the most one runner can start.`
      : clubs.length >= CLUB_LIMITS.maxClubsPerUser
        ? `You’re in ${CLUB_LIMITS.maxClubsPerUser} clubs — leave one to start another.`
        : 'You’re in the most clubs and groups you can join — leave one to start a club.';

  // Clubs I hid stay out of my lists (their rank numbers keep their place).
  const rows: ClubRankRow[] = board?.status === 'ready' ? board.rows.filter((r) => r.isMine || !hidden.has(r.id)) : [];
  const listedIds = new Set(rows.map((r) => r.id));
  const myExtra = board?.status === 'ready' ? board.mine.filter((m) => !listedIds.has(m.id)) : [];
  const scopeName = scope === 'country' ? countryName(country) : 'the world';

  return (
    <>
      <View style={{ marginTop: spacing.xl }}>
        <Label>My clubs</Label>
        {clubs.length === 0 ? (
          <Text style={[T.small, { marginTop: spacing.sm }]}>
            Not in a club yet. Running clubs pool every member’s steps and kilometres and race other clubs each month.
          </Text>
        ) : (
          clubs.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => onOpenClub(c.id, c.name)}
              accessibilityRole="button"
              accessibilityLabel={`${c.name}, ${c.memberCount} members`}
              style={({ pressed }) => [styles.myClub, pressed && { opacity: 0.94 }]}
            >
              <ClubAvatar photoUrl={c.photoUrl} emblem={c.emblem} size={46} />
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text style={styles.myClubName} numberOfLines={1}>
                  {c.name}
                </Text>
                <Text style={styles.myClubMeta} numberOfLines={1}>
                  {placeLabel(c.country, c.city)} · {c.memberCount} {c.memberCount === 1 ? 'member' : 'members'}
                  {c.role === 'owner' ? ' · Owner' : ''}
                </Text>
              </View>
              <Feather name="chevron-right" size={20} color={colors.muted} />
            </Pressable>
          ))
        )}
      </View>

      <View style={{ marginTop: spacing.lg }}>
        {canStart ? (
          <Button label="Start a running club" variant="accent" icon="flag" onPress={onStartClub} />
        ) : (
          <Text style={T.small}>{startBlocked}</Text>
        )}
      </View>

      <View style={styles.rankHead}>
        <Label>Club rankings</Label>
        <Pressable onPress={load} hitSlop={10} accessibilityRole="button" accessibilityLabel="Refresh club rankings">
          <Feather name="refresh-cw" size={16} color={colors.muted} />
        </Pressable>
      </View>

      <View style={styles.scopeRow}>
        <Pressable
          onPress={() => (scope === 'country' ? setPicker(true) : setScope('country'))}
          accessibilityRole="button"
          accessibilityState={{ selected: scope === 'country' }}
          accessibilityLabel={scope === 'country' ? `${countryName(country)} — change country` : `Show ${countryName(country)}`}
          style={[styles.scopeChip, scope === 'country' && styles.scopeOn]}
        >
          <Text style={styles.scopeFlag}>{flagEmoji(country)}</Text>
          <Text style={[styles.scopeText, scope === 'country' && styles.scopeTextOn]} numberOfLines={1}>
            {countryName(country)}
          </Text>
          {scope === 'country' ? <Feather name="chevron-down" size={16} color={colors.onDark} /> : null}
        </Pressable>
        <Pressable
          onPress={() => setScope('world')}
          accessibilityRole="button"
          accessibilityState={{ selected: scope === 'world' }}
          accessibilityLabel="Worldwide"
          style={[styles.scopeChip, scope === 'world' && styles.scopeOn]}
        >
          <Feather name="globe" size={16} color={scope === 'world' ? colors.onDark : colors.inkSoft} />
          <Text style={[styles.scopeText, scope === 'world' && styles.scopeTextOn]}>Worldwide</Text>
        </Pressable>
      </View>

      <View style={{ marginTop: spacing.md }}>
        <Segmented options={METRIC_OPTIONS} value={metric} onChange={setMetric} />
      </View>
      <View style={{ marginTop: spacing.sm }}>
        <Segmented options={MONTHS} value={month} onChange={setMonth} />
      </View>

      {board === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : board.status !== 'ready' ? (
        <Text style={[T.small, { marginTop: spacing.lg }]}>{board.message}</Text>
      ) : rows.length === 0 ? (
        <Card style={{ marginTop: spacing.md }}>
          <Text style={T.title}>
            {metric === 'pace' ? 'No club has run 20 km yet' : `No club has logged ${metric === 'steps' ? 'steps' : 'a run'} yet`}
          </Text>
          <Text style={[T.bodyMuted, { marginTop: spacing.xs }]}>
            {month === 'this' ? `This month in ${scopeName} is wide open — start a club and take #1.` : `Nothing ranked for ${scopeName} last month.`}
          </Text>
        </Card>
      ) : (
        <>
          {rows.map((r) => (
            <ClubRankItem
              key={r.id}
              rank={r.rank}
              name={r.name}
              photoUrl={r.photoUrl}
              emblem={r.emblem}
              country={r.country}
              city={r.city}
              memberCount={r.memberCount}
              metric={metric}
              totals={r}
              mine={r.isMine}
              onPress={() => onOpenClub(r.id, r.name)}
            />
          ))}
          {myExtra.length ? (
            <>
              <Text style={[T.small, { marginTop: spacing.lg }]}>Your clubs</Text>
              {myExtra.map((r) => (
                <ClubRankItem
                  key={r.id}
                  rank={r.rank}
                  capped={r.capped}
                  name={r.name}
                  photoUrl={r.photoUrl}
                  emblem={r.emblem}
                  country={r.country}
                  city={r.city}
                  memberCount={r.memberCount}
                  metric={metric}
                  totals={r}
                  mine
                  onPress={() => onOpenClub(r.id, r.name)}
                />
              ))}
            </>
          ) : null}
        </>
      )}
      <Text style={[T.small, { marginTop: spacing.md }]}>
        {metric === 'pace'
          ? 'Pace is each club’s average over all its members’ runs; a club needs 20 km of running in the month to be ranked.'
          : metric === 'distance'
            ? 'Distance counts runs recorded in Kasya or synced from Apple Health (Apple Watch, Garmin, COROS…).'
            : 'Every member’s daily steps add up for the club. Totals refresh when members open Kasya.'}
      </Text>

      <Card style={{ marginTop: spacing.xl }}>
        <Text style={T.title}>Find a club</Text>
        <View style={styles.searchWrap}>
          <Feather name="search" size={18} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Club name, e.g. BGC Run Club"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search running clubs"
          />
          {searching ? <ActivityIndicator color={colors.accent} /> : null}
        </View>
        {found && found.length === 0 && !searching ? (
          <Text style={[T.small, { marginTop: spacing.sm }]}>
            No club by that name yet. Invite-only clubs don’t need to be found — join them with their code on the Friends tab.
          </Text>
        ) : null}
        {(found ?? []).filter((c) => c.isMine || !hidden.has(c.id)).map((c) => (
          <Pressable
            key={c.id}
            onPress={() => onOpenClub(c.id, c.name)}
            accessibilityRole="button"
            accessibilityLabel={`${c.name}, ${c.memberCount} members${c.isMine ? ', your club' : ''}`}
            style={styles.foundRow}
          >
            <ClubAvatar photoUrl={c.photoUrl} emblem={c.emblem} size={36} />
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={styles.myClubName} numberOfLines={1}>
                {c.name}
              </Text>
              <Text style={styles.myClubMeta} numberOfLines={1}>
                {placeLabel(c.country, c.city)} · {c.memberCount} {c.memberCount === 1 ? 'member' : 'members'}
                {c.isMine ? ' · Your club' : c.open ? '' : ' · Invite-only'}
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.muted} />
          </Pressable>
        ))}
      </Card>


      <CountryPicker
        visible={picker}
        value={country}
        title="Country rankings"
        onClose={() => setPicker(false)}
        onPick={(c) => {
          setCountry(c);
          setScope('country');
          setPicker(false);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: spacing.xxl, alignItems: 'center' },
  myClub: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  myClubName: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  myClubMeta: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, marginTop: 2 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.lineStrong,
  },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 15, color: colors.ink, paddingVertical: spacing.md },
  foundRow: { flexDirection: 'row', alignItems: 'center', minHeight: 56, marginTop: spacing.sm },
  rankHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xxl,
  },
  scopeRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  scopeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    flexShrink: 1,
  },
  scopeOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  scopeFlag: { fontSize: 16 },
  scopeText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.inkSoft, flexShrink: 1 },
  scopeTextOn: { color: colors.onDark },
});
