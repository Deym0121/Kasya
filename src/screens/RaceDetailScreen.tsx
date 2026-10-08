import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Linking, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { RootScreenProps } from '../navigation';
import { colors, spacing, radius, type as T, fonts } from '../theme';
import { ScreenContainer, Button, Card, Chip, TextField } from '../components';
import { dateBadge, statusOf, parseRaceDate, RaceStatus } from '../races/logic';
import { countryFor } from '../races/types';
import type { RaceEvent } from '../races/types';
import { REPORT_REASONS, composeReportReason } from '../races/submission';
import { canReportRaces, reportRace } from '../races/submissionsApi';

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

/** Single-day: "Sunday · February 14, 2027"; multi-day adds " – February 15". */
function eventDate(event: RaceEvent): string {
  if (!event.dateEnd || event.dateEnd === event.dateStart) return fullDate(event.dateStart);
  const end = parseRaceDate(event.dateEnd);
  return `${fullDate(event.dateStart)} – ${MONTHS[end.getMonth()]} ${end.getDate()}`;
}

/**
 * "Report wrong info" — signed-in runners only (hidden for guests, the web
 * demo, and whenever the backend can't be reached). Server rate-limits 5/day.
 */
function ReportWrongInfo({ eventId }: { eventId: string }) {
  const [canReport, setCanReport] = useState(false);
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    canReportRaces().then((ok) => active && setCanReport(ok));
    return () => {
      active = false;
    };
  }, []);

  if (!canReport) return null;

  async function send() {
    if (sending) return;
    const reason = composeReportReason(pick, details);
    if (!reason) {
      setMsg({ ok: false, text: 'Pick what’s wrong, or add a few words.' });
      return;
    }
    setSending(true);
    const res = await reportRace(eventId, reason);
    setSending(false);
    setMsg({ ok: res.ok, text: res.message });
    if (res.ok) {
      setOpen(false);
      setPick(null);
      setDetails('');
    }
  }

  if (!open) {
    return (
      <View style={styles.reportWrap}>
        {msg?.ok ? (
          <Text style={styles.reportThanks} accessibilityLiveRegion="polite">{msg.text}</Text>
        ) : (
          <Pressable
            onPress={() => {
              setOpen(true);
              setMsg(null);
            }}
            accessibilityRole="button"
            accessibilityLabel="Report wrong info"
            hitSlop={8}
            style={({ pressed }) => [styles.reportLink, pressed && { opacity: 0.7 }]}
          >
            <Feather name="flag" size={14} color={colors.muted} />
            <Text style={styles.reportLinkText}>Report wrong info</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <Card style={{ marginTop: spacing.xl, padding: spacing.lg }}>
      <Text style={T.title}>What’s wrong?</Text>
      <Text style={[T.small, { marginTop: 2, marginBottom: spacing.md }]}>
        We’ll check it against the official page and fix the calendar.
      </Text>
      <View style={styles.chipWrap}>
        {REPORT_REASONS.map((r) => (
          <Chip key={r} label={r} selected={pick === r} onPress={() => setPick(pick === r ? null : r)} />
        ))}
      </View>
      <View style={{ height: spacing.sm }} />
      <TextField
        label="Details (optional)"
        value={details}
        onChangeText={setDetails}
        placeholder="e.g. The official page now says March 7"
        maxLength={300}
      />
      {msg && !msg.ok ? <Text style={styles.reportError}>{msg.text}</Text> : null}
      <Button label="Send report" variant="secondary" icon="send" onPress={send} loading={sending} />
      <View style={{ height: spacing.sm }} />
      <Button label="Cancel" variant="ghost" onPress={() => setOpen(false)} disabled={sending} />
    </Card>
  );
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
  const community = event.source === 'community';

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

      {community ? (
        // Full-width strip rather than a pill: the label must never clip on a narrow phone.
        <View style={styles.communityBadge} accessible accessibilityLabel="Verified. Submitted by a Kasya runner.">
          <Feather name="check-circle" size={15} color={colors.success} />
          <Text style={styles.communityText}>Verified · submitted by a Kasya runner</Text>
        </View>
      ) : null}

      <View style={styles.info}>
        <InfoRow icon="calendar" label="Date" value={eventDate(event)} />
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
        {community
          ? `Submitted by a Kasya runner, checked against ${sourceHost} and approved by the Kasya team.`
          : `Date verified against ${sourceHost}.`}{' '}
        Details can change — confirm on the official page.
      </Text>

      <ReportWrongInfo eventId={event.id} />
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
  communityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.successSoft,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  communityText: { flexShrink: 1, fontFamily: fonts.semibold, fontSize: 13, color: colors.success, textAlign: 'center' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  reportWrap: { alignItems: 'center', marginTop: spacing.lg },
  reportLink: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: spacing.md },
  reportLinkText: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted },
  reportThanks: { ...T.small, color: colors.success, textAlign: 'center', paddingVertical: spacing.md },
  reportError: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 19, color: colors.danger, marginBottom: spacing.md },
});
