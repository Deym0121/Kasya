import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, SectionList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TabScreenProps } from '../navigation';
import { colors, spacing, radius, type as T, fonts } from '../theme';
import { EmptyState } from '../components';
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

// Status drives the whole card tint (bg + rail bubble + tag), timeline-planner
// style: open = green family, announced = brand orange family, done = muted.
const STATUS_COPY: Record<
  RaceStatus,
  { label: string; color: string; bg: string; cardBg: string }
> = {
  open: { label: 'Open', color: colors.success, bg: colors.successSoft, cardBg: colors.successSoft },
  announced: { label: 'Announced', color: colors.accentInk, bg: colors.accentSoft, cardBg: colors.surface },
  done: { label: 'Done', color: colors.inkSoft, bg: colors.surfaceAlt, cardBg: colors.surface },
};

// Local, brand-consistent filter chip. The emoji lives in its OWN Text: mixing
// Apple Color Emoji glyphs into a Sora-font Text rewrites the line metrics on
// iOS and pushes the label low enough to clip against the pill — the exact
// device bug seen on TestFlight twice. Separate Texts keep separate metrics.
function FilterChip({ icon, label, selected, onPress }: { icon?: string; label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      hitSlop={{ top: 4, bottom: 4 }}
      style={[styles.fChip, selected && styles.fChipOn]}
    >
      {icon ? <Text style={styles.fChipIcon}>{icon}</Text> : null}
      <Text style={[styles.fChipText, selected && styles.fChipTextOn]}>{label}</Text>
    </Pressable>
  );
}

function RaceCard({ event, today, onPress }: { event: RaceEvent; today: Date; onPress: () => void }) {
  const badge = dateBadge(event);
  const country = countryFor(event.country);
  const status = statusOf(event, today);
  const s = STATUS_COPY[status];
  return (
    // The whole row is the touch target — the date bubble is the most
    // tappable-looking element, so it must not be a dead zone (audit).
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${event.name}, ${event.city}, ${badge.monWeek} ${badge.day}, ${s.label}, ${event.distances.join(', ')}`}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
    >
      {/* timeline rail: decorative for VoiceOver — the label above carries it */}
      <View
        style={styles.rail}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View style={[styles.railBubble, { borderColor: s.color }]}>
          <Text style={[styles.railDay, { color: s.color }]}>{badge.day}</Text>
          <Text style={styles.railMon}>{badge.monWeek.split(' · ')[1] ?? badge.monWeek}</Text>
        </View>
        <View style={styles.railLine} />
      </View>

      <View style={[styles.card, { backgroundColor: s.cardBg }]}>
        {/* status tab riding the card's top edge; bordered so it reads as a
            deliberate pill even over a same-color card (audit: Open-on-Open) */}
        <View style={[styles.statusTab, { backgroundColor: s.bg, borderColor: s.color }]}>
          <Text style={[styles.statusTabText, { color: s.color }]}>{s.label}</Text>
        </View>
        <Text style={styles.raceName} numberOfLines={2}>{event.name}</Text>
        <Text style={styles.raceCity}>{country.flag} {event.city}</Text>
        <View style={styles.distRow}>
          {event.distances.map((d) => (
            <View key={d} style={styles.dist}><Text style={styles.distText}>{d}</Text></View>
          ))}
        </View>
      </View>
    </Pressable>
  );
}

export default function RacesScreen({ navigation }: Props) {
  const { events, source, loading } = useRaces();
  const [view, setView] = useState<'upcoming' | 'results'>('upcoming');
  const [filter, setFilter] = useState<CountryFilter>('all');
  const [activeMonth, setActiveMonth] = useState<string | null>(null);
  const listRef = useRef<SectionList<RaceEvent>>(null);
  const monthScrollRef = useRef<ScrollView>(null);
  const monthX = useRef<Record<string, number>>({});
  const suppressViewabilityUntil = useRef(0);
  const today = useMemo(() => new Date(), []);

  const filtered = useMemo(() => applyFilter(events, filter), [events, filter]);
  const views = useMemo(() => splitViews(filtered, today), [filtered, today]);
  const shown = view === 'upcoming' ? views.upcoming : views.results;
  const sections = useMemo(
    () => groupByMonth(shown).map((g) => ({ title: monthLabel(g.key), key: g.key, data: g.events })),
    [shown],
  );
  const currentMonth = activeMonth && sections.some((s) => s.key === activeMonth)
    ? activeMonth
    : sections[0]?.key;

  // Keep the active month pill visible as the list (or a tap) moves it.
  useEffect(() => {
    if (!currentMonth) return;
    const x = monthX.current[currentMonth];
    if (x !== undefined) monthScrollRef.current?.scrollTo({ x: Math.max(0, x - spacing.xl), animated: true });
  }, [currentMonth]);

  // Switching view or country swaps the dataset — never keep a stale scroll
  // offset into different content (audit: deep-scroll + toggle landed mid-list).
  useEffect(() => {
    setActiveMonth(null);
    suppressViewabilityUntil.current = Date.now() + 400;
    if (sections.length) {
      try {
        listRef.current?.scrollToLocation({ sectionIndex: 0, itemIndex: 0, viewPosition: 0, animated: false });
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, filter]);

  const jumpToMonth = (key: string) => {
    setActiveMonth(key);
    // Audit: viewability events during the animated jump (and the final clamp
    // when the last section is shorter than the viewport) would overwrite the
    // tapped month — suppress viewability-driven updates until settled.
    suppressViewabilityUntil.current = Date.now() + 800;
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
              hitSlop={{ top: 5, bottom: 5 }}
              style={[styles.toggle, view === v && styles.toggleOn]}
            >
              <Text style={[styles.toggleText, view === v && styles.toggleTextOn]}>
                {v === 'upcoming' ? 'Upcoming' : 'Results'}
              </Text>
            </Pressable>
          ))}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipRow}
          contentContainerStyle={styles.chipRowContent}
        >
          <FilterChip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
          <FilterChip icon="🌍" label="Majors" selected={filter === 'majors'} onPress={() => setFilter('majors')} />
          {COUNTRIES.map((c) => (
            <FilterChip
              key={c.code}
              icon={c.flag}
              label={c.code}
              selected={filter === c.code}
              onPress={() => setFilter(c.code)}
            />
          ))}
        </ScrollView>

        {sections.length > 1 && (
          <ScrollView
            ref={monthScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.monthRow}
            contentContainerStyle={styles.monthRowContent}
          >
            {sections.map((s) => {
              const [mon, year] = s.title.split(' ');
              const on = s.key === currentMonth;
              return (
                <Pressable
                  key={s.key}
                  onLayout={(e) => { monthX.current[s.key] = e.nativeEvent.layout.x; }}
                  onPress={() => jumpToMonth(s.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[styles.monthPill, on && styles.monthPillOn]}
                >
                  <Text style={[styles.monthPillMon, on && styles.monthPillMonOn]}>{mon}</Text>
                  <Text style={[styles.monthPillYear, on && styles.monthPillYearOn]}>{year}</Text>
                </Pressable>
              );
            })}
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
            onScrollToIndexFailed={(info) => {
              // Audit: far targets aren't measured yet, so scrollToLocation
              // no-ops. Standard two-step: approximate by average item size,
              // let the target render, then jump precisely.
              listRef.current?.getScrollResponder()?.scrollTo({
                y: info.averageItemLength * info.index,
                animated: true,
              });
              const key = currentMonth;
              setTimeout(() => {
                const idx = sections.findIndex((s) => s.key === key);
                if (idx >= 0) {
                  suppressViewabilityUntil.current = Date.now() + 800;
                  listRef.current?.scrollToLocation({ sectionIndex: idx, itemIndex: 0, viewPosition: 0 });
                }
              }, 120);
            }}
            onViewableItemsChanged={({ viewableItems }) => {
              if (Date.now() < suppressViewabilityUntil.current) return;
              const first = viewableItems.find((v) => v.section)?.section?.key;
              if (first) setActiveMonth(first);
            }}
            viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
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
  chipRow: { marginTop: spacing.lg, flexGrow: 0 },
  chipRowContent: { alignItems: 'center', paddingVertical: 2 },
  // compact, brand-consistent country filters (see FilterChip)
  fChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    marginRight: spacing.sm,
    justifyContent: 'center',
  },
  fChipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  // Emoji rendered separately (own metrics); label gets a roomy line box so
  // Sora's deep descenders never touch the pill bounds on iOS.
  fChipIcon: { fontSize: 13, lineHeight: 18, marginRight: 6 },
  fChipText: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18, color: colors.inkSoft },
  fChipTextOn: { color: colors.bg },
  monthRow: { marginTop: spacing.lg, flexGrow: 0 },
  monthRowContent: { alignItems: 'center', paddingVertical: 2 },
  // tall date-pill selector, planner style: active pill fills with accent
  monthPill: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    marginRight: spacing.sm,
  },
  monthPillOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  monthPillMon: { fontFamily: fonts.extra, fontSize: 15, lineHeight: 20, color: colors.ink, letterSpacing: 0.4 },
  monthPillMonOn: { color: colors.bg },
  monthPillYear: { fontFamily: fonts.semibold, fontSize: 10, lineHeight: 14, color: colors.muted, marginTop: 1 },
  monthPillYearOn: { color: colors.accentSoft },
  sourceNote: { ...T.small, marginTop: spacing.sm },
  monthHeader: { fontFamily: fonts.bold, fontSize: 17, color: colors.ink, letterSpacing: 0.3, marginTop: spacing.lg, marginBottom: spacing.md },
  // timeline rows
  row: { flexDirection: 'row', alignItems: 'stretch' },
  rail: { width: 56, alignItems: 'center' },
  railBubble: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  railDay: { fontFamily: fonts.extra, fontSize: 16, lineHeight: 18 },
  railMon: { fontFamily: fonts.semibold, fontSize: 10, lineHeight: 13, color: colors.muted, letterSpacing: 0.4 },
  railLine: {
    flex: 1,
    width: 0,
    borderLeftWidth: 1,
    borderColor: colors.line,
    borderStyle: 'dashed',
    marginVertical: 4,
  },
  card: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    paddingTop: spacing.lg + 6,
    marginLeft: spacing.sm,
    marginBottom: spacing.lg,
    marginTop: 10,
  },
  statusTab: {
    position: 'absolute',
    top: -11,
    left: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  statusTabText: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 0.3 },
  raceName: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  raceCity: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, marginTop: 2 },
  distRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 6 },
  dist: { borderRadius: radius.sm, backgroundColor: colors.surfaceAlt, paddingHorizontal: 8, paddingVertical: 3 },
  distText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.inkSoft },
});
