import { View, Text, StyleSheet, Linking } from 'react-native';
import { RootScreenProps } from '../navigation';
import { colors, spacing, radius, type as T, fonts } from '../theme';
import { ScreenContainer, Button } from '../components';
import { dateBadge, statusOf } from '../races/logic';
import { countryFor } from '../races/types';

type Props = RootScreenProps<'RaceDetail'>;

export default function RaceDetailScreen({ navigation, route }: Props) {
  const { event } = route.params;
  const badge = dateBadge(event);
  const country = countryFor(event.country);
  const status = statusOf(event, new Date());
  const open = (url?: string) => url && Linking.openURL(url).catch(() => {});

  return (
    <ScreenContainer title="Race" onBack={() => navigation.goBack()}>
      <View style={styles.hero}>
        <View style={styles.badge}>
          <Text style={styles.badgeDay}>{badge.day}</Text>
          <Text style={styles.badgeMon}>{badge.monWeek}</Text>
        </View>
        <Text style={styles.name}>{event.name}</Text>
        <Text style={styles.place}>{country.flag} {event.city}, {country.name}</Text>
        {event.organizer ? <Text style={styles.organizer}>by {event.organizer}</Text> : null}
        <View style={styles.distRow}>
          {event.distances.map((d) => (
            <View key={d} style={styles.dist}><Text style={styles.distText}>{d}</Text></View>
          ))}
        </View>
      </View>

      <View style={{ height: spacing.xl }} />
      {status !== 'done' && event.regUrl ? (
        <Button label="Register" icon="external-link" onPress={() => open(event.regUrl)} />
      ) : null}
      {status === 'done' && event.resultsUrl ? (
        <Button label="Results" icon="award" onPress={() => open(event.resultsUrl)} />
      ) : null}
      {status === 'done' && event.photosUrl ? (
        <>
          <View style={{ height: spacing.md }} />
          <Button label="Photos" variant="secondary" icon="camera" onPress={() => open(event.photosUrl)} />
        </>
      ) : null}
      {event.officialUrl ? (
        <>
          <View style={{ height: spacing.md }} />
          <Button label="Official site" variant="ghost" icon="globe" onPress={() => open(event.officialUrl)} />
        </>
      ) : null}

      <Text style={styles.note}>Details can change — confirm on the official page.</Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.xl, alignItems: 'center' },
  badge: { alignItems: 'center', marginBottom: spacing.md },
  badgeDay: { fontFamily: fonts.extra, fontSize: 44, color: colors.accentInk, letterSpacing: -1 },
  badgeMon: { fontFamily: fonts.semibold, fontSize: 12, color: colors.muted, letterSpacing: 1 },
  name: { fontFamily: fonts.bold, fontSize: 20, color: colors.ink, textAlign: 'center' },
  place: { fontFamily: fonts.regular, fontSize: 14, color: colors.inkSoft, marginTop: spacing.xs },
  organizer: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, marginTop: 2 },
  distRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.md, justifyContent: 'center' },
  dist: { borderRadius: radius.sm, backgroundColor: colors.surfaceAlt, paddingHorizontal: 10, paddingVertical: 4 },
  distText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.inkSoft },
  note: { ...T.small, textAlign: 'center', marginTop: spacing.xl },
});
