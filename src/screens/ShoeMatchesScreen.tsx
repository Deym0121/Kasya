import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { RootScreenProps } from '../navigation';
import { colors, spacing, radius, type as T, fonts } from '../theme';
import { ScreenContainer, Card, Badge, Label, Chip, Button } from '../components';
import { ShoeThumb } from '../viz/ShoeThumb';
import { ShopLinksRow } from '../viz/ShopLinksRow';
import { matchShoes, scoreTone, ShoeMatch } from '../shoes/match';
import { SHOES } from '../data/shoes';
import { recommendShoes } from '../ai/shoes';
import { getFitProfile, setFitProfile, FitProfile } from '../storage/fitProfile';

function price(min: number, max: number): string {
  return min === max ? `₱${min.toLocaleString()}` : `₱${min.toLocaleString()}–${max.toLocaleString()}`;
}
function humanize(goal: string): string {
  return goal.replace(/_/g, ' ');
}

const TONES = {
  strong: { tint: colors.successSoft, color: colors.success },
  good: { tint: colors.accentSoft, color: colors.accentInk },
  fair: { tint: colors.surfaceAlt, color: colors.muted },
} as const;

const TIER_BADGE = {
  premium: { tint: colors.surfaceAlt, color: colors.muted, label: 'Premium' },
  midrange: { tint: colors.accentSoft, color: colors.accentInk, label: 'Mid-range' },
  budget: { tint: colors.successSoft, color: colors.success, label: 'Budget' },
} as const;

const QUALITY_TONE = {
  well_regarded: { label: 'Well-regarded', color: colors.success },
  solid: { label: 'Solid pick', color: colors.accentInk },
  mixed: { label: 'Mixed reviews', color: colors.warn },
} as const;

const BUDGETS: { label: string; v?: number }[] = [
  { label: 'Any', v: undefined },
  { label: '₱2k', v: 2000 },
  { label: '₱5k', v: 5000 },
  { label: '₱10k', v: 10000 },
];

type SortKey = 'match' | 'priceAsc' | 'priceDesc';
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'match', label: 'Best match' },
  { key: 'priceAsc', label: 'Price: low to high' },
  { key: 'priceDesc', label: 'Price: high to low' },
];

type TierKey = 'all' | 'budget' | 'midrange' | 'premium';
const TIER_FILTERS: { key: TierKey; label: string }[] = [
  { key: 'all', label: 'All prices' },
  { key: 'budget', label: 'Budget' },
  { key: 'midrange', label: 'Mid-range' },
  { key: 'premium', label: 'Premium' },
];

type Props = RootScreenProps<'ShoeMatches'>;

export default function ShoeMatchesScreen({ navigation, route }: Props) {
  const { report } = route.params;
  const gait = { cadenceSpm: report.result.cadence.value, bouncePct: report.metrics?.verticalOscillationPct };

  // Deterministic ranking shows instantly; the AI pass upgrades it in place.
  const [matches, setMatches] = useState<ShoeMatch[]>(() =>
    matchShoes(SHOES, { useCase: report.scanType, gait }).map((m) => ({ ...m, source: 'rules' as const })),
  );
  const [profile, setProfile] = useState<FitProfile | null>(null);
  const [draft, setDraft] = useState<FitProfile>({});
  const [aiLoading, setAiLoading] = useState(true);
  const [refineOpen, setRefineOpen] = useState(false);
  const [sort, setSort] = useState<SortKey>('match');
  const [tierFilter, setTierFilter] = useState<TierKey>('all');

  useEffect(() => {
    let a = true;
    getFitProfile().then((p) => {
      if (!a) return;
      setProfile(p);
      setDraft(p);
    });
    return () => {
      a = false;
    };
  }, []);

  // Re-rank with the AI whenever the fit profile is ready or changes.
  useEffect(() => {
    if (profile === null) return;
    let active = true;
    setAiLoading(true);
    recommendShoes(report, SHOES, profile).then((res) => {
      if (!active) return;
      setMatches(res);
      setAiLoading(false);
    });
    return () => {
      active = false;
    };
  }, [report, profile]);

  const usedAi = matches.some((m) => m.source === 'ai');
  const shopQuery = { budgetMaxPhp: profile?.budgetMaxPhp, width: profile?.width };

  // What's actually rendered: the ranked list, optionally tier-filtered and re-sorted by price.
  const shown = useMemo(() => {
    let list = tierFilter === 'all' ? matches : matches.filter((m) => m.shoe.tier === tierFilter);
    if (sort === 'priceAsc') list = [...list].sort((a, b) => a.shoe.priceMin - b.shoe.priceMin);
    else if (sort === 'priceDesc') list = [...list].sort((a, b) => b.shoe.priceMin - a.shoe.priceMin);
    return list;
  }, [matches, sort, tierFilter]);

  // Paginate: the top picks matter most — render a page at a time ("load more"
  // beats page numbers on mobile). Resets whenever the list itself changes.
  const PAGE_SIZE = 10;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => setVisibleCount(PAGE_SIZE), [matches, sort, tierFilter]);
  const visibleMatches = shown.slice(0, visibleCount);

  const applyFit = async () => {
    await setFitProfile(draft);
    setProfile(await getFitProfile());
    setRefineOpen(false);
  };

  return (
    <ScreenContainer title="Shoe matches" onBack={() => navigation.goBack()}>
      <Label>{usedAi ? 'AI-matched to your scan' : 'Comfort-led match'}</Label>
      <Text style={[T.h1, { marginTop: 4 }]}>Best for {humanize(report.scanType)}</Text>
      <Text style={[T.bodyMuted, { marginTop: spacing.xs }]}>
        {shown.length} real shoes{tierFilter === 'all' ? ' — from budget Shopee/TikTok finds to premium —' : ''}{' '}
        {sort === 'match'
          ? 'matched to your goal and how you move.'
          : sort === 'priceAsc'
            ? 'sorted by price, low to high.'
            : 'sorted by price, high to low.'}
      </Text>
      <Text style={[T.small, { marginTop: spacing.sm }]}>
        Tap “Find it” to see the real photo and live price, and buy, on Shopee, TikTok Shop or Lazada. Match % is an
        estimate — comfort when you try them on is the best tiebreaker.
      </Text>

      {/* Optional fit refinement */}
      <Card style={{ marginTop: spacing.lg }}>
        <Pressable
          onPress={() => setRefineOpen((o) => !o)}
          accessibilityRole="button"
          accessibilityState={{ expanded: refineOpen }}
          style={styles.refineHead}
        >
          <View style={{ flex: 1 }}>
            <Label>Refine fit</Label>
            <Text style={[T.small, { marginTop: 2 }]}>Width & budget — optional, refines your matches and the store search</Text>
          </View>
          <Feather name={refineOpen ? 'chevron-up' : 'chevron-down'} size={20} color={colors.muted} />
        </Pressable>

        {refineOpen && (
          <View style={{ marginTop: spacing.lg }}>
            <Text style={styles.fieldLabel}>Foot width</Text>
            <View style={styles.chipRow}>
              <Chip label="Regular" selected={draft.width !== 'wide'} onPress={() => setDraft({ ...draft, width: 'regular' })} />
              <Chip label="Wide" selected={draft.width === 'wide'} onPress={() => setDraft({ ...draft, width: 'wide' })} />
            </View>

            <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>Budget (max)</Text>
            <View style={styles.chipRow}>
              {BUDGETS.map((b) => (
                <Chip
                  key={b.label}
                  label={b.label}
                  selected={draft.budgetMaxPhp === b.v}
                  onPress={() => setDraft({ ...draft, budgetMaxPhp: b.v })}
                />
              ))}
            </View>

            <View style={{ height: spacing.md }} />
            <Button label="Apply" variant="accent" onPress={applyFit} />
          </View>
        )}
      </Card>

      {aiLoading && (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.loadingText}>Finding your best matches…</Text>
        </View>
      )}

      {/* Sort + price-tier filter */}
      <View style={{ marginTop: spacing.lg }}>
        <Label>Sort</Label>
        <View style={[styles.chipRow, { marginTop: spacing.sm }]}>
          {SORTS.map((s) => (
            <Chip key={s.key} label={s.label} selected={sort === s.key} onPress={() => setSort(s.key)} />
          ))}
        </View>
        <View style={[styles.chipRow, { marginTop: spacing.xs }]}>
          {TIER_FILTERS.map((t) => (
            <Chip key={t.key} label={t.label} selected={tierFilter === t.key} onPress={() => setTierFilter(t.key)} />
          ))}
        </View>
      </View>

      <View style={{ height: spacing.md }} />

      {visibleMatches.map((m, i) => {
        const tone = TONES[scoreTone(m.score)];
        const tier = TIER_BADGE[m.shoe.tier];
        return (
          <Card key={m.shoe.id} style={{ marginBottom: spacing.md }}>
            <View style={styles.row}>
              <View>
                <ShoeThumb shoe={m.shoe} size={56} />
                {sort === 'match' && tierFilter === 'all' && (
                  <View style={styles.rank}>
                    <Text style={styles.rankText}>{i + 1}</Text>
                  </View>
                )}
              </View>
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text style={styles.name}>
                  {m.shoe.brand} {m.shoe.model}
                </Text>
                <Text style={styles.meta}>
                  {m.shoe.category.replace(/_/g, ' ')} · {m.shoe.cushion} cushion · {price(m.shoe.priceMin, m.shoe.priceMax)}
                </Text>
              </View>
              <View style={[styles.scorePill, { backgroundColor: tone.tint }]}>
                <Text style={[styles.scoreText, { color: tone.color }]}>{m.score}%</Text>
                <Text style={[styles.scoreCaption, { color: tone.color }]}>match</Text>
              </View>
            </View>

            <View style={styles.badges}>
              {m.source === 'ai' && <Badge label="✦ AI pick" tint={colors.ink} color="#fff" />}
              <Badge label={tier.label} tint={tier.tint} color={tier.color} />
              {m.shoe.isOwnProduct && <Badge label="Our product" />}
            </View>

            {m.shoe.quality && (
              <Text style={styles.quality}>
                <Text style={{ fontFamily: fonts.semibold, color: QUALITY_TONE[m.shoe.quality.tone].color }}>
                  {QUALITY_TONE[m.shoe.quality.tone].label}
                </Text>
                <Text style={{ color: colors.muted }}> — {m.shoe.quality.note} · per public reviews</Text>
              </Text>
            )}
            <Text style={[T.body, { marginTop: spacing.md }]}>{m.reason}</Text>
            <ShopLinksRow shoe={m.shoe} query={shopQuery} />
          </Card>
        );
      })}

      {visibleCount < shown.length && (
        <View style={{ marginTop: spacing.sm, marginBottom: spacing.md }}>
          <Button
            label={`Show more shoes (${shown.length - visibleCount} more)`}
            variant="secondary"
            iconRight="chevron-down"
            onPress={() => setVisibleCount((c) => c + PAGE_SIZE)}
          />
        </View>
      )}

      <Text style={styles.ftc}>
        Prices are approximate bands — the live store shows the real current price and the authentic photo. Brand names
        belong to their owners; Kasya isn’t affiliated with them or the stores, and shoe matches are comfort-led
        estimates, not a medical or foot-type prescription.
      </Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  refineHead: { flexDirection: 'row', alignItems: 'center' },
  fieldLabel: { fontFamily: fonts.semibold, fontSize: 13, color: colors.ink, marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  loading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
  loadingText: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted },
  row: { flexDirection: 'row', alignItems: 'center' },
  rank: {
    position: 'absolute',
    top: -6,
    left: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  rankText: { fontFamily: fonts.bold, fontSize: 11, color: '#fff' },
  name: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  meta: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, marginTop: 2, textTransform: 'capitalize' },
  scorePill: { borderRadius: radius.md, paddingVertical: 6, paddingHorizontal: 12, alignItems: 'center' },
  scoreText: { fontFamily: fonts.bold, fontSize: 14 },
  scoreCaption: { fontFamily: fonts.regular, fontSize: 9, marginTop: 1 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  quality: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, marginTop: spacing.md },
  ftc: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: spacing.lg },
});
