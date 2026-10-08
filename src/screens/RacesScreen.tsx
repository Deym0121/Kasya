import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, SectionList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { TabScreenProps } from '../navigation';
import { colors, spacing, radius, type as T, fonts } from '../theme';
import { EmptyState, BrandMark, NoticeBanner } from '../components';
import { useRaces } from '../races/useRaces';
import { amIAdmin, listPendingSubmissions, submitEntryRoute } from '../races/submissionsApi';
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

/** "Missing a race?" — the community-submission entry at the end of the list. */
function SubmitPrompt({ onPress, busy }: { onPress: () => void; busy: boolean }) {
  return (
    <View style={styles.submitCard}>
      <Feather name="plus-circle" size={20} color={colors.accentInk} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.submitTitle}>Missing a race?</Text>
        <Text style={styles.submitBody}>
          Kasya Pro runners can submit official races. We verify each one before it’s listed.
        </Text>
      </View>
      <Pressable
        onPress={onPress}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Submit a race"
        hitSlop={8}
        style={({ pressed }) => [styles.submitBtn, pressed && { opacity: 0.8 }]}
      >
        {busy ? <ActivityIndicator size="small" color={colors.accentInk} /> : <Text style={styles.submitBtnText}>Submit</Text>}
      </Pressable>
    </View>
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
  const [opening, setOpening] = useState(false);
  const [adminPending, setAdminPending] = useState(0);

  // Admins (ADMIN_EMAILS on the server) get a nudge when races await review.
  // Fail-soft: no Convex / not deployed / not admin all mean "show nothing".
  useFocusEffect(
    useCallback(() => {
      let active = true;
      amIAdmin().then(async (isAdmin) => {
        if (!active) return;
        if (!isAdmin) return setAdminPending(0);
        const pending = await listPendingSubmissions();
        if (active) setAdminPending(pending?.length ?? 0);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  // Pro + signed in → the form; signed-in free runner → paywall; anything else
  // (guest, no cloud, offline) → RaceSubmit, which explains the situation.
  const openSubmit = async () => {
    if (opening) return;
    setOpening(true);
    try {
      const route = await submitEntryRoute();
      if (route === 'Paywall') navigation.navigate('Paywall');
      else navigation.navigate('RaceSubmit');
    } finally {
      setOpening(false);
    }
  };

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
        <View style={styles.topSide}>
          <BrandMark height={22} />
        </View>
        <Text style={styles.topTitle} numberOfLines={1}>Races</Text>
        <View style={[styles.topSide, { alignItems: 'flex-end' }]}>
          <Pressable
            onPress={openSubmit}
            disabled={opening}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Submit a race"
            style={styles.topBtn}
          >
            {opening ? <ActivityIndicator size="small" color={colors.ink} /> : <Feather name="plus" size={22} color={colors.ink} />}
          </Pressable>
        </View>
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
          {/* OTA delivery marker: invisible to users (accessibility-only) but a
              screen-reader/inspector still reveals which layout revision the
              device runs. A visible tag read as debug residue to App Review. */}
          <View accessibilityLabel="layout-r7" />
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

        {adminPending > 0 && (
          <View style={{ marginTop: spacing.md }}>
            <NoticeBanner
              icon="inbox"
              text={`${adminPending} race submission${adminPending === 1 ? '' : 's'} waiting for review.`}
              actionLabel="Review"
              onAction={() => navigation.navigate('RaceAdmin')}
            />
          </View>
        )}

        {sections.length === 0 ? (
          <View style={{ marginTop: spacing.xl }}>
            <EmptyState
              icon="flag"
              title="No races here yet"
              body="Check another country or month — the calendar grows as races get announced."
            />
            <SubmitPrompt onPress={openSubmit} busy={opening} />
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
            ListFooterComponent={
              view === 'upcoming' ? <SubmitPrompt onPress={openSubmit} busy={opening} /> : null
            }
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
  topSide: { width: 64, justifyContent: 'center' },
  topBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginRight: -6 },
  body: { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  toggleRow: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.pill, padding: 4, marginTop: spacing.sm },
  toggle: { flex: 1, paddingVertical: 8, borderRadius: radius.pill, alignItems: 'center' },
  toggleOn: { backgroundColor: colors.accent },
  toggleText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.muted },
  toggleTextOn: { color: colors.bg },
  // iOS horizontal ScrollViews clip children to their own frame, and their
  // auto height under-measures text (the true cause of every clipped chip on
  // device — the original Chip clipped with NO lineHeight and 44pt height).
  // Fixed row heights taller than fixed child heights leave real slack:
  // nothing can touch a clip edge.
  chipRow: { marginTop: spacing.md, height: 52, flexGrow: 0 },
  chipRowContent: { alignItems: 'center' },
  // compact, brand-consistent country filters (see FilterChip)
  fChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    marginRight: spacing.sm,
  },
  fChipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  // Natural line boxes only (no lineHeight overrides) — glyphs center inside
  // the fixed-height pill with slack on both sides.
  fChipIcon: { fontSize: 13, marginRight: 6 },
  fChipText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.inkSoft },
  fChipTextOn: { color: colors.bg },
  revTag: { fontFamily: fonts.regular, fontSize: 9, color: colors.line, alignSelf: 'center', marginLeft: 2 },
  monthRow: { marginTop: spacing.md, height: 72, flexGrow: 0 },
  monthRowContent: { alignItems: 'center' },
  // tall date-pill selector, planner style: active pill fills with accent
  monthPill: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 60,
    paddingHorizontal: 16,
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
  // community-submission prompt (list footer / empty state)
  submitCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    borderStyle: 'dashed',
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  submitTitle: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  submitBody: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.muted, marginTop: 2 },
  submitBtn: {
    alignSelf: 'center',
    minHeight: 36,
    minWidth: 72,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.accentInk },
});
