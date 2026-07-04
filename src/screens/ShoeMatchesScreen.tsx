import { View, Text, StyleSheet } from 'react-native';
import { RootScreenProps } from '../navigation';
import { colors, spacing, radius, type as T, fonts } from '../theme';
import { ScreenContainer, Card, Badge, Label } from '../components';
import { ShoeThumb } from '../viz/ShoeThumb';
import { matchShoes, scoreTone } from '../shoes/match';
import { SHOES } from '../data/shoes';

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

type Props = RootScreenProps<'ShoeMatches'>;

export default function ShoeMatchesScreen({ navigation, route }: Props) {
  const { report } = route.params;
  // Rank the WHOLE catalog against the goal AND the scan (comfort-led signals).
  const matches = matchShoes(SHOES, {
    useCase: report.scanType,
    gait: { cadenceSpm: report.result.cadence.value, bouncePct: report.metrics?.verticalOscillationPct },
  });

  return (
    <ScreenContainer title="Shoe matches" onBack={() => navigation.goBack()}>
      <Label>Comfort-led match</Label>
      <Text style={[T.h1, { marginTop: 4 }]}>Best for {humanize(report.scanType)}</Text>
      <Text style={[T.bodyMuted, { marginTop: spacing.xs }]}>
        {matches.length} shoes ranked to your goal and your scan — the best one is the one that feels best.
      </Text>
      <Text style={[T.small, { marginTop: spacing.sm, marginBottom: spacing.xl }]}>
        Match % is how closely a shoe's design lines up with your goal and how you move — an estimate, not a verdict.
        Comfort when you try them on is the best tiebreaker.
      </Text>

      {matches.map((m, i) => {
        const tone = TONES[scoreTone(m.score)];
        return (
          <Card key={m.shoe.id} style={{ marginBottom: spacing.md }}>
            <View style={styles.row}>
              <View>
                <ShoeThumb shoe={m.shoe} size={56} />
                <View style={styles.rank}>
                  <Text style={styles.rankText}>{i + 1}</Text>
                </View>
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
                <Text style={[styles.scoreCaption, { color: tone.color }]}>comfort match</Text>
              </View>
            </View>
            {m.shoe.isOwnProduct && (
              <View style={{ marginTop: spacing.md }}>
                <Badge label="Our product" />
              </View>
            )}
            <Text style={[T.body, { marginTop: spacing.md }]}>{m.reason}</Text>
          </Card>
        );
      })}

      <Text style={styles.ftc}>
        Shoes labeled “Our product” are sold by StrideFit. We don’t rank our own shoes above better-matched
        options. Brand names belong to their owners; StrideFit is not affiliated.
      </Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
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
  ftc: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: spacing.lg },
});
