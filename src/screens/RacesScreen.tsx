import { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, SectionList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TabScreenProps } from '../navigation';
import { colors, spacing, radius, type as T, fonts } from '../theme';
import { Chip, EmptyState } from '../components';
import { useRaces } from '../races/useRaces';
import {
  applyFilter,
  splitViews,
  groupByMonth,
  monthLabel,
  dateBadge,
  statusOf,
  RaceStatus,
} from '../races/logic';
import { COUNTRIES, CountryFilter, RaceEvent, countryFor } from '../races/types';

type Props = TabScreenProps<'Races'>;

const STATUS_COPY: Record<RaceStatus, { label: string; color: string; bg: string }> = {
  open: { label: 'Open', color: colors.success, bg: colors.successSoft },
  announced: { label: 'Announced', color: colors.muted, bg: colors.surfaceAlt },
  done: { label: 'Done', color: colors.inkSoft, bg: colors.surfaceAlt },
};

function StatusTag({ status }: { status: RaceStatus }) {
  const s = STATUS_COPY[status];
  return (
    <View style={[styles.status, { backgroundColor: s.bg }]}>
      <Text style={[styles.statusText, { color: s.color }]}>{s.label}</Text>
    </View>
  );
}

function RaceCard({ event, today, onPress }: { event: RaceEvent; today: Date; onPress: () => void }) {
  const badge = dateBadge(event);
  const country = countryFor(event.country);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${event.name}, ${event.city}`}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.dateBadge}>
        <Text style={styles.dateDay}>{badge.day}</Text>
        <Text style={styles.dateMon}>{badge.monWeek}</Text>
      </View>
      <View style={{ flex: 1, marginHorizontal: spacing.md }}>
        <Text style={styles.raceName} numberOfLines={2}>{event.name}</Text>
        <Text style={styles.raceCity}>{country.flag} {event.city}</Text>
        <View style={styles.distRow}>
          {event.distances.map((d) => (
            <View key={d} style={styles.dist}><Text style={styles.distText}>{d}</Text></View>
          ))}
        </View>
      </View>
      <StatusTag status={statusOf(event, today)} />
    </Pressable>
  );
}

export default function RacesScreen({ navigation }: Props) {
  const { events, source, loading } = useRaces();
  const [view, setView] = useState<'upcoming' | 'results'>('upcoming');
  const [filter, setFilter] = useState<CountryFilter>('all');
  const listRef = useRef<SectionList<RaceEvent>>(null);
  const today = useMemo(() => new Date(), []);

  const filtered = useMemo(() => applyFilter(events, filter), [events, filter]);
  const views = useMemo(() => splitViews(filtered, today), [filtered, today]);
  const shown = view === 'upcoming' ? views.upcoming : views.results;
  const sections = useMemo(
    () => groupByMonth(shown).map((g) => ({ title: monthLabel(g.key), key: g.key, data: g.events })),
    [shown],
  );

  const jumpToMonth = (key: string) => {
    const idx = sections.findIndex((s) => s.key === key);
    if (idx >= 0) listRef.current?.scrollToLocation({ sectionIndex: idx, itemIndex: 0, viewPosition: 0 });
  };

  // ScreenContainer always wraps children in a ScrollView (no `scroll` prop), which
  // would break SectionList virtualization + scrollToLocation. So this screen copies
  // ScreenContainer's SafeArea/topbar/padding pattern and manages its own scrolling.
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.topbar}>
        <Text style={styles.topTitle} numberOfLines={1}>Races</Text>
      </View>
      <View style={styles.body}>
        <View style={styles.toggleRow}>
          {(['upcoming', 'results'] as const).map((v) => (
            <Pressable
              key={v}
              onPress={() => setView(v)}
              accessibilityRole="button"
              accessibilityState={{ selected: view === v }}
              style={[styles.toggle, view === v && styles.toggleOn]}
            >
              <Text style={[styles.toggleText, view === v && styles.toggleTextOn]}>
                {v === 'upcoming' ? 'Upcoming' : 'Results'}
              </Text>
            </Pressable>
          ))}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          <Chip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip label="🌍 Majors" selected={filter === 'majors'} onPress={() => setFilter('majors')} />
          {COUNTRIES.map((c) => (
            <Chip
              key={c.code}
              label={`${c.flag} ${c.code}`}
              selected={filter === c.code}
              onPress={() => setFilter(c.code)}
            />
          ))}
        </ScrollView>

        {sections.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.monthRow}>
            {sections.map((s) => (
              <Pressable key={s.key} onPress={() => jumpToMonth(s.key)} style={styles.monthPill}>
                <Text style={styles.monthPillText}>{s.title}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {source !== 'live' && !loading && (
          <Text style={styles.sourceNote}>Shown from your last update.</Text>
        )}

        {sections.length === 0 ? (
          <View style={{ marginTop: spacing.xl }}>
            <EmptyState
              icon="flag"
              title="No races here yet"
              body="Check another country or month — the calendar grows as races get announced."
            />
          </View>
        ) : (
          <SectionList
            ref={listRef}
            sections={sections}
            keyExtractor={(e) => e.id}
            renderItem={({ item }) => (
              <RaceCard event={item} today={today} onPress={() => navigation.navigate('RaceDetail', { event: item })} />
            )}
            renderSectionHeader={({ section }) => <Text style={styles.monthHeader}>{section.title}</Text>}
            stickySectionHeadersEnabled={false}
            onScrollToIndexFailed={() => {}}
            contentContainerStyle={{ paddingBottom: spacing.xxl }}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // screen/topbar/topTitle/body mirror ScreenContainer's own layout tokens.
  screen: { flex: 1, backgroundColor: colors.bg },
  topbar: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md },
  topTitle: { flex: 1, textAlign: 'center', fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  body: { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  toggleRow: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.pill, padding: 4, marginTop: spacing.sm },
  toggle: { flex: 1, paddingVertical: 8, borderRadius: radius.pill, alignItems: 'center' },
  toggleOn: { backgroundColor: colors.accent },
  toggleText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.muted },
  toggleTextOn: { color: colors.bg },
  chipRow: { marginTop: spacing.md, flexGrow: 0 },
  monthRow: { marginTop: spacing.sm, flexGrow: 0 },
  monthPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, marginRight: spacing.sm },
  monthPillText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.inkSoft, letterSpacing: 0.4 },
  sourceNote: { ...T.small, marginTop: spacing.sm },
  monthHeader: { fontFamily: fonts.semibold, fontSize: 13, color: colors.muted, letterSpacing: 1.2, marginTop: spacing.lg, marginBottom: spacing.sm },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, marginBottom: spacing.sm },
  dateBadge: { width: 52, alignItems: 'center' },
  dateDay: { fontFamily: fonts.extra, fontSize: 24, color: colors.accentInk },
  dateMon: { fontFamily: fonts.semibold, fontSize: 10, color: colors.muted, letterSpacing: 0.6, marginTop: 2 },
  raceName: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  raceCity: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, marginTop: 2 },
  distRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, gap: 6 },
  dist: { borderRadius: radius.sm, backgroundColor: colors.surfaceAlt, paddingHorizontal: 8, paddingVertical: 3 },
  distText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.inkSoft },
  status: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontFamily: fonts.semibold, fontSize: 11 },
});
