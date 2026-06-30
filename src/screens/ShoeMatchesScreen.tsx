import { View, Text, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import { colors, spacing, radius, type as T, fonts } from '../theme';
import { ScreenContainer, Button, Card, Badge, Label } from '../components';
import { matchShoes } from '../shoes/match';
import { SHOES } from '../data/shoes';

function price(min: number, max: number): string {
  return min === max ? `₱${min.toLocaleString()}` : `₱${min.toLocaleString()}–${max.toLocaleString()}`;
}
function humanize(goal: string): string {
  return goal.replace(/_/g, ' ');
}

type Props = NativeStackScreenProps<RootStackParamList, 'ShoeMatches'>;

export default function ShoeMatchesScreen({ navigation, route }: Props) {
  const { report } = route.params;
  const matches = matchShoes(SHOES, { useCase: report.scanType });

  return (
    <ScreenContainer
      title="Shoe matches"
      onBack={() => navigation.goBack()}
      footer={<Button label="Unlock full report" icon="lock" onPress={() => navigation.navigate('Paywall')} />}
    >
      <Label>Comfort-led match</Label>
      <Text style={[T.h1, { marginTop: 4 }]}>Best for {humanize(report.scanType)}</Text>
      <Text style={[T.bodyMuted, { marginTop: spacing.xs, marginBottom: spacing.xl }]}>
        The best shoe is the one that feels best — try a few on.
      </Text>

      {matches.map((m, i) => (
        <Card key={m.shoe.id} style={{ marginBottom: spacing.md }}>
          <View style={styles.row}>
            <View style={styles.rank}>
              <Text style={styles.rankText}>{i + 1}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={styles.name}>
                {m.shoe.brand} {m.shoe.model}
              </Text>
              <Text style={styles.meta}>
                {m.shoe.category.replace(/_/g, ' ')} · {m.shoe.cushion} cushion · {price(m.shoe.priceMin, m.shoe.priceMax)}
              </Text>
            </View>
            <View style={styles.scorePill}>
              <Text style={styles.scoreText}>{m.score}%</Text>
            </View>
          </View>
          {m.shoe.isOwnProduct && (
            <View style={{ marginTop: spacing.md }}>
              <Badge label="Our product" />
            </View>
          )}
          <Text style={[T.body, { marginTop: spacing.md }]}>{m.reason}</Text>
        </Card>
      ))}

      <Text style={styles.ftc}>
        Shoes labeled “Our product” are sold by StrideFit. We don’t rank our own shoes above
        better-matched options. Brand names belong to their owners; StrideFit is not affiliated.
      </Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  rank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: { fontFamily: fonts.bold, fontSize: 13, color: '#fff' },
  name: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  meta: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, marginTop: 2, textTransform: 'capitalize' },
  scorePill: { backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 12 },
  scoreText: { fontFamily: fonts.bold, fontSize: 14, color: colors.accentInk },
  ftc: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: spacing.lg },
});
