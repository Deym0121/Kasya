import { View, Text, StyleSheet, Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { RootScreenProps } from '../navigation';
import { colors, spacing, radius, type as T, fonts } from '../theme';
import { ScreenContainer, Button } from '../components';
import { dateBadge, statusOf, parseRaceDate, RaceStatus } from '../races/logic';
import { countryFor } from '../races/types';

type Props = RootScreenProps<'RaceDetail'>;

// Formatting stays Intl-free like the rest of src/races (static arrays).
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function fullDate(dateStart: string): string {
  const d = parseRaceDate(dateStart);
  return `${WEEKDAYS[d.getDay()]} · ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function countdown(dateStart: string, today: Date): string {
  const race = parseRaceDate(dateStart);
  const mid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((race.getTime() - mid.getTime()) / 86400000);
  if (days === 0) return 'Race day! 🏁';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return days > 0 ? `In ${days} days` : `${-days} days ago`;
}

const STATUS_COPY: Record<RaceStatus, { label: string; color: string; bg: string }> = {
  open: { label: 'Registration open', color: colors.success, bg: colors.successSoft },
  announced: { label: 'Announced', color: colors.accentInk, bg: colors.accentSoft },
  done: { label: 'Finished', color: colors.inkSoft, bg: colors.surfaceAlt },
};

function InfoRow({ icon, label, value }: { icon: keyof typeof Feather.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Feather name={icon} size={15} color={colors.muted} style={styles.infoIcon} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

export default function RaceDetailScreen({ navigation, route }: Props) {
  const { event } = route.params;
  const badge = dateBadge(event);
  const country = countryFor(event.country);
  const today = new Date();
  const status = statusOf(event, today);
  const s = STATUS_COPY[status];
  const open = (url?: string) => url && Linking.openURL(url).catch(() => {});
  const sourceHost = event.sourceUrl.replace(/^https:\/\//, '').split('/')[0];

  return (
    <ScreenContainer title="Race" onBack={() => navigation.goBack()}>
      <View style={styles.hero}>
        <View style={[styles.statusTab, { backgroundColor: s.bg }]}>
          <Text style={[styles.statusTabText, { color: s.color }]}>{s.label}</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeDay}>{badge.day}</Text>
          <Text style={styles.badgeMon}>{badge.monWeek}</Text>
        </View>
        <Text style={styles.name}>{event.name}</Text>
        <Text style={[styles.countdown, { color: s.color }]}>{countdown(event.dateStart, today)}</Text>
        <View style={styles.distRow}>
          {event.distances.map((d) => (
            <View key={d} style={styles.dist}><Text style={styles.distText}>{d}</Text></View>
          ))}
        </View>
      </View>

      <View style={styles.info}>
        <InfoRow icon="calendar" label="Date" value={fullDate(event.dateStart)} />
        <InfoRow icon="map-pin" label="Where" value={`${country.flag} ${event.city}, ${country.name}`} />
        {event.organizer ? <InfoRow icon="briefcase" label="By" value={event.organizer} /> : null}
        <InfoRow icon="check-circle" label="Source" value={sourceHost} />
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

      <Text style={styles.note}>
        Date verified against {sourceHost}. Details can change — confirm on the official page.
      </Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.xl,
    paddingTop: spacing.xl + 8,
    alignItems: 'center',
    marginTop: 12,
  },
  statusTab: {
    position: 'absolute',
    top: -12,
    alignSelf: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  statusTabText: { fontFamily: fonts.semibold, fontSize: 12, letterSpacing: 0.3 },
  badge: { alignItems: 'center', marginBottom: spacing.md },
  badgeDay: { fontFamily: fonts.extra, fontSize: 44, color: colors.accentInk, letterSpacing: -1 },
  badgeMon: { fontFamily: fonts.semibold, fontSize: 12, color: colors.muted, letterSpacing: 1 },
  name: { fontFamily: fonts.bold, fontSize: 20, color: colors.ink, textAlign: 'center' },
  countdown: { fontFamily: fonts.semibold, fontSize: 14, marginTop: spacing.sm },
  distRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.md, justifyContent: 'center' },
  dist: { borderRadius: radius.sm, backgroundColor: colors.surfaceAlt, paddingHorizontal: 10, paddingVertical: 4 },
  distText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.inkSoft },
  info: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  infoIcon: { marginRight: spacing.sm },
  infoLabel: { fontFamily: fonts.semibold, fontSize: 13, color: colors.muted, width: 58 },
  infoValue: { fontFamily: fonts.regular, fontSize: 14, color: colors.ink, flex: 1 },
  note: { ...T.small, textAlign: 'center', marginTop: spacing.xl },
});
