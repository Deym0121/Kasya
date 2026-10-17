import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Modal, FlatList, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing, type as T } from '../theme';
import { RankBadge } from '../groups/ui';
import { rankBadge } from '../groups/levels';
import { COUNTRIES, countryName, flagEmoji } from './countries';
import { DEFAULT_EMBLEM, METRIC_UNIT, metricValue, parseEmblem, type ClubMetric } from './rules';

/** The club's photo, else its emblem (icon on its color), else the default emblem. */
export function ClubAvatar({
  photoUrl,
  emblem,
  size = 44,
}: {
  photoUrl?: string | null;
  emblem?: string | null;
  size?: number;
}) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (photoUrl) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={[box, styles.photo]}
        accessibilityIgnoresInvertColors
        importantForAccessibility="no"
      />
    );
  }
  const e = parseEmblem(emblem) ?? DEFAULT_EMBLEM;
  return (
    <View style={[box, styles.emblem, { backgroundColor: e.color }]} importantForAccessibility="no-hide-descendants">
      <MaterialCommunityIcons name={e.icon} size={Math.round(size * 0.52)} color={colors.bg} />
    </View>
  );
}

/** "🇵🇭 Taguig" / "🇵🇭 Philippines". */
export function placeLabel(country: string | null, city: string | null): string {
  if (!country) return city ?? '';
  return `${flagEmoji(country)} ${city || countryName(country)}`;
}

/** One club on a rankings list: badge art for 1–3, avatar, name, place, metric value. */
export function ClubRankItem({
  rank,
  name,
  photoUrl,
  emblem,
  country,
  city,
  memberCount,
  metric,
  totals,
  mine,
  capped,
  onPress,
}: {
  rank: number | null;
  name: string;
  photoUrl: string | null;
  emblem: string | null;
  country: string | null;
  city: string | null;
  memberCount: number;
  metric: ClubMetric;
  totals: { steps: number; runM: number; runSec: number };
  mine: boolean;
  capped?: boolean;
  onPress: () => void;
}) {
  const value = metricValue(metric, totals, true);
  const members = `${memberCount} ${memberCount === 1 ? 'member' : 'members'}`;
  const rankText = rank === null ? 'Not ranked yet' : capped ? `Rank ${rank} or lower` : `Rank ${rank}`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${rankText}. ${name}, ${placeLabel(country, city).replace(/^\S+ /, '')}, ${members}. ${value} ${METRIC_UNIT[metric]}`}
      style={({ pressed }) => [styles.rankRow, mine && styles.rankRowMine, pressed && { opacity: 0.94 }]}
    >
      <View style={styles.rankSlot}>
        {rank === null ? (
          <Text style={styles.rankDash}>–</Text>
        ) : rank <= 3 ? (
          <RankBadge rank={rank} medal={rankBadge(rank)} size={40} />
        ) : (
          <Text style={styles.rankNum} numberOfLines={1} adjustsFontSizeToFit>
            {capped ? `${rank}+` : rank}
          </Text>
        )}
      </View>
      <ClubAvatar photoUrl={photoUrl} emblem={emblem} size={40} />
      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <Text style={styles.rankName} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.rankMeta} numberOfLines={1}>
          {placeLabel(country, city)} · {members}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', marginLeft: spacing.sm }}>
        <Text style={styles.rankValue}>{value}</Text>
        <Text style={styles.rankUnit}>{METRIC_UNIT[metric]}</Text>
      </View>
    </Pressable>
  );
}

/** Full-screen country list with search. */
export function CountryPicker({
  visible,
  value,
  onPick,
  onClose,
  title = 'Country',
}: {
  visible: boolean;
  value: string | null;
  onPick: (code: string) => void;
  onClose: () => void;
  title?: string;
}) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? COUNTRIES.filter(([c, n]) => n.toLowerCase().includes(t) || c.toLowerCase() === t) : COUNTRIES;
  }, [q]);
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.sheet} edges={['top', 'bottom']}>
        <View style={styles.sheetBar}>
          <Text style={T.h2} accessibilityRole="header">
            {title}
          </Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
            <Feather name="x" size={24} color={colors.ink} />
          </Pressable>
        </View>
        <View style={styles.searchWrap}>
          <Feather name="search" size={18} color={colors.muted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search countries"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            autoCorrect={false}
            accessibilityLabel="Search countries"
          />
        </View>
        <FlatList
          data={list as [string, string][]}
          keyExtractor={([c]) => c}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={24}
          renderItem={({ item: [code, name] }) => {
            const on = code === value;
            return (
              <Pressable
                onPress={() => {
                  onPick(code);
                  setQ('');
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={name}
                style={styles.countryRow}
              >
                <Text style={styles.flag}>{flagEmoji(code)}</Text>
                <Text style={[styles.countryName, on && { color: colors.accentInk }]}>{name}</Text>
                {on ? <Feather name="check" size={18} color={colors.accentInk} /> : null}
              </Pressable>
            );
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  photo: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.line },
  emblem: { alignItems: 'center', justifyContent: 'center' },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  rankRowMine: { borderColor: colors.accent },
  rankSlot: { width: 40, alignItems: 'center', marginRight: spacing.sm },
  rankNum: { fontFamily: fonts.extra, fontSize: 16, color: colors.inkSoft },
  rankDash: { fontFamily: fonts.bold, fontSize: 16, color: colors.muted },
  rankName: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  rankMeta: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, marginTop: 2 },
  rankValue: { fontFamily: fonts.extra, fontSize: 16, color: colors.ink },
  rankUnit: { fontFamily: fonts.regular, fontSize: 11, color: colors.muted },
  sheet: { flex: 1, backgroundColor: colors.bg },
  sheetBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 15, color: colors.ink, paddingVertical: spacing.md },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  flag: { fontSize: 22 },
  countryName: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: colors.ink },
});
