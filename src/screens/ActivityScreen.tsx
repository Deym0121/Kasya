import { memo, useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { TabScreenProps } from '../navigation';
import { colors, fonts, radius, spacing, type as T } from '../theme';
import { ScreenContainer, Card, Label, Badge, Button, EmptyState, Chip } from '../components';
import { RouteSketch } from '../activity/map/RouteSketch';
import { listActivities } from '../storage/activities';
import { session } from '../activity/session';
import { useRecording, useRecordingActive, useNow } from '../activity/useRecording';
import { liveMovingSec } from '../activity/recorder';
import { totals, weekDays, inThisWeek } from '../activity/finalize';
import { getHealthState, connectHealth, syncHealth, weekOfSteps, type HealthState } from '../activity/healthSync';
import { healthAvailable, HEALTH_NAME } from '../activity/health';
import {
  formatDuration,
  formatKm,
  formatPace,
  formatSpeed,
  paceOf,
  usesSpeed,
  SPORT_LABEL,
  SPORT_ICON,
} from '../activity/format';
import { SPORTS, type ActivitySummary, type Sport } from '../activity/types';

type Props = TabScreenProps<'Activity'>;

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const WATCHES = ['Apple Watch', 'Garmin', 'COROS', 'Polar', 'Suunto', 'Samsung', 'Amazfit'];

export default function ActivityScreen({ navigation }: Props) {
  // Only `active` is read here — the live numbers re-render just the banner,
  // never the whole list (which stays mounted under the Record screen).
  const recordingActive = useRecordingActive();
  const [now, setNow] = useState(() => Date.now());
  const [list, setList] = useState<ActivitySummary[]>([]);
  const [filter, setFilter] = useState<Sport | 'all'>('all');
  const [health, setHealth] = useState<HealthState | null>(null);
  const [steps, setSteps] = useState<{ day: string; steps: number }[] | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [showHow, setShowHow] = useState(false);

  const refresh = useCallback(async () => {
    const [acts, h, st] = await Promise.all([listActivities(), getHealthState(), weekOfSteps().catch(() => null)]);
    setList(acts);
    setHealth(h);
    setSteps(st);
    // tabs stay mounted for days: re-read the clock on every refresh so "this
    // week" and today's bar roll over
    setNow(Date.now());
  }, []);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      session.restore();
      refresh();
      // Pull any new watch workouts in the background, then refresh the list.
      syncHealth()
        .then((n) => {
          if (alive && n > 0) refresh();
        })
        .catch(() => {});
      return () => {
        alive = false;
      };
    }, [refresh]),
  );

  const openActivity = useCallback((id: string) => navigation.navigate('ActivityDetail', { id }), [navigation]);

  const connect = async () => {
    setConnecting(true);
    setNote(null);
    const r = await connectHealth();
    setConnecting(false);
    if (!r.ok) {
      setNote(`Couldn't open ${HEALTH_NAME}. You can allow Kasya later in the Health app → Sharing → Apps.`);
      return;
    }
    setNote(r.imported > 0 ? `Imported ${r.imported} workout${r.imported === 1 ? '' : 's'} from ${HEALTH_NAME}.` : `Connected. New watch workouts will show up here.`);
    refresh();
  };

  const nowDate = new Date(now);
  const shown = filter === 'all' ? list : list.filter((a) => a.sport === filter);
  const week = totals(shown.filter((a) => inThisWeek(a, nowDate)));
  const days = weekDays(list, nowDate, filter === 'all' ? undefined : filter);
  const maxDay = Math.max(...days, 1);
  const today = (nowDate.getDay() + 6) % 7;
  const todaySteps = steps?.[steps.length - 1]?.steps ?? null;
  const maxSteps = Math.max(...(steps ?? []).map((d) => d.steps), 1);
  const canHealth = Platform.OS === 'ios' && healthAvailable();

  return (
    <ScreenContainer title="Activity" edges={['top']} brand="mark">
      <LiveBanner onPress={() => navigation.navigate('Record')} />

      {/* Start */}
      <Card style={styles.startCard}>
        <Text style={T.h2}>Record an activity</Text>
        <Text style={[T.small, { marginTop: 2 }]}>GPS distance, pace per km, splits and your route — even with the screen locked.</Text>
        <View style={styles.sportRow}>
          {SPORTS.map((s) => (
            <Pressable
              key={s}
              // while recording, every button just returns to the live session
              onPress={() => navigation.navigate('Record', recordingActive ? undefined : { sport: s })}
              accessibilityRole="button"
              accessibilityLabel={recordingActive ? 'Return to the activity you are recording' : `Start a ${SPORT_LABEL[s].toLowerCase()}`}
              style={({ pressed }) => [styles.sportBtn, pressed && { opacity: 0.85 }]}
            >
              <View style={styles.sportCircle}>
                <Feather name={SPORT_ICON[s]} size={20} color={colors.onDark} />
              </View>
              <Text style={styles.sportLabel}>{SPORT_LABEL[s]}</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      {/* Steps */}
      {steps && steps.length > 0 ? (
        <Card style={{ marginTop: spacing.md }}>
          <View style={styles.cardHead}>
            <Label>Steps today</Label>
            <Text style={T.small}>{health?.connected ? `From ${HEALTH_NAME}` : 'From this phone'}</Text>
          </View>
          <Text style={styles.bigNum}>{(todaySteps ?? 0).toLocaleString()}</Text>
          <View style={styles.bars}>
            {steps.map((d, i) => (
              <View key={d.day} style={styles.barCol} accessible accessibilityLabel={`${d.day}: ${d.steps.toLocaleString()} steps`}>
                <View style={styles.barBox}>
                  <View
                    style={[
                      styles.barFill,
                      { height: `${Math.max(4, Math.round((d.steps / maxSteps) * 100))}%` as const },
                      i === steps.length - 1 && { backgroundColor: colors.accent },
                    ]}
                  />
                </View>
                <Text style={styles.barLbl}>{DAY_LETTERS[(new Date(d.day + 'T12:00:00').getDay() + 6) % 7]}</Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      {/* This week */}
      <View style={{ height: spacing.xl }} />
      <Label>This week</Label>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        <Chip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
        {SPORTS.map((s) => (
          <Chip key={s} label={SPORT_LABEL[s]} selected={filter === s} onPress={() => setFilter(s)} />
        ))}
      </ScrollView>
      <Card>
        <View style={styles.weekRow}>
          <WeekStat value={formatKm(week.distanceM)} unit="km" label="Distance" />
          <WeekStat value={formatDuration(week.movingSec)} label="Time" />
          <WeekStat value={String(week.count)} label={week.count === 1 ? 'Activity' : 'Activities'} />
          <WeekStat value={String(Math.round(week.elevGainM))} unit="m" label="Elev" />
        </View>
        <View style={[styles.bars, { marginTop: spacing.md }]}>
          {days.map((m, i) => (
            <View key={i} style={styles.barCol} accessible accessibilityLabel={`${DAY_LETTERS[i]}: ${formatKm(m)} km`}>
              <View style={styles.barBox}>
                <View
                  style={[
                    styles.barFill,
                    { height: `${m > 0 ? Math.max(8, Math.round((m / maxDay) * 100)) : 0}%` as const },
                    i === today && { backgroundColor: colors.accent },
                  ]}
                />
              </View>
              <Text style={[styles.barLbl, i === today && { color: colors.ink }]}>{DAY_LETTERS[i]}</Text>
            </View>
          ))}
        </View>
      </Card>

      {/* Watch sync */}
      <View style={{ height: spacing.xl }} />
      <Label>Your watch</Label>
      <Card style={{ marginTop: spacing.sm }}>
        {canHealth && health?.connected ? (
          <View>
            <View style={styles.cardHead}>
              <View style={styles.okRow}>
                <Feather name="check-circle" size={16} color={colors.success} />
                <Text style={[T.title, { marginLeft: spacing.sm }]}>{HEALTH_NAME} connected</Text>
              </View>
              <Pressable
                onPress={async () => {
                  setNote('Syncing…');
                  try {
                    const n = await syncHealth();
                    setNote(n > 0 ? `Imported ${n} new workout${n === 1 ? '' : 's'}.` : 'Up to date.');
                  } catch {
                    setNote(`Couldn't read ${HEALTH_NAME} just now — try again in a moment.`);
                  }
                  refresh();
                }}
                accessibilityRole="button"
                hitSlop={8}
              >
                <Text style={styles.link}>Sync now</Text>
              </Pressable>
            </View>
            <Text style={[T.small, { marginTop: spacing.xs }]}>
              Workouts from Apple Watch — and from Garmin, COROS, Polar and others once their app shares to Health — appear
              here automatically. Kasya also saves your recordings to Health.
            </Text>
          </View>
        ) : (
          <View>
            <Text style={T.title}>Sync your smartwatch</Text>
            <Text style={[T.small, { marginTop: 2 }]}>
              Bring in runs, rides and walks with heart rate and route from the watch you already wear.
            </Text>
            <View style={styles.watchRow}>
              {WATCHES.map((w) => (
                <Badge key={w} label={w} tint={colors.surfaceAlt} color={colors.inkSoft} />
              ))}
            </View>
            {canHealth ? (
              <Button label={`Connect ${HEALTH_NAME}`} icon="heart" variant="primary" onPress={connect} loading={connecting} />
            ) : (
              <Text style={T.small}>
                Watch sync works in the Kasya iPhone app through Apple Health{Platform.OS === 'android' ? ' — Health Connect support is coming to Android' : ''}.
              </Text>
            )}
          </View>
        )}
        <Pressable onPress={() => setShowHow((v) => !v)} accessibilityRole="button" style={{ marginTop: spacing.md }} hitSlop={6}>
          <Text style={styles.link}>{showHow ? 'Hide' : 'Using Garmin, COROS or another brand?'}</Text>
        </Pressable>
        {showHow && (
          <View style={{ marginTop: spacing.sm, gap: spacing.xs }}>
            <Text style={T.small}>
              <Text style={styles.howBrand}>1. </Text>Open your watch's own app — Garmin Connect, COROS, Polar Flow, Suunto, Zepp or
              Samsung Health.
            </Text>
            <Text style={T.small}>
              <Text style={styles.howBrand}>2. </Text>In its connected / third-party apps settings, turn on Apple Health and allow
              Workouts (plus Steps and Heart Rate).
            </Text>
            <Text style={T.small}>
              <Text style={styles.howBrand}>3. </Text>Connect Apple Health here. New workouts flow into Kasya automatically — some
              brands sync a few minutes after the watch does.
            </Text>
          </View>
        )}
        {note ? <Text style={[T.small, { marginTop: spacing.md, color: colors.inkSoft }]}>{note}</Text> : null}
      </Card>

      {/* Activities */}
      <View style={{ height: spacing.xl }} />
      <Label>{filter === 'all' ? 'Activities' : `${SPORT_LABEL[filter]}s`}</Label>
      <View style={{ height: spacing.sm }} />
      {shown.length === 0 ? (
        <EmptyState
          icon="activity"
          title={filter === 'all' ? 'No activities yet' : `No ${SPORT_LABEL[filter].toLowerCase()}s yet`}
          body={
            filter === 'all'
              ? 'Record your first run, walk, ride or hike — or connect your watch to bring in past workouts.'
              : `Record a ${SPORT_LABEL[filter].toLowerCase()} or switch the filter back to All.`
          }
          action={{ label: 'Start recording', onPress: () => navigation.navigate('Record', { sport: filter === 'all' ? 'run' : filter }) }}
        />
      ) : (
        shown.slice(0, 50).map((a) => <ActivityRow key={a.id} a={a} onPress={openActivity} />)
      )}
      {/* clearance so the last card can scroll above the floating scan button */}
      <View style={{ height: 72 }} />
    </ScreenContainer>
  );
}

/** The "Recording · 2.1 km · 10:32" bar — owns the live subscription and ticker. */
function LiveBanner({ onPress }: { onPress: () => void }) {
  const snap = useRecording();
  const now = useNow(snap.active);
  if (!snap.active || !snap.stats) return null;
  const label = `${snap.stats.status === 'paused' ? 'Paused' : 'Recording'} · ${formatKm(snap.stats.distanceM)} km · ${formatDuration(
    liveMovingSec(snap.stats, now),
  )}`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. Return to the activity you're recording`}
      style={({ pressed }) => [styles.liveBar, pressed && { opacity: 0.9 }]}
    >
      <View style={styles.liveDot} />
      <Text style={styles.liveText}>{label}</Text>
      <Feather name="chevron-right" size={18} color={colors.onDark} />
    </Pressable>
  );
}

function WeekStat({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.weekVal}>
        {value}
        {unit ? <Text style={styles.weekUnit}> {unit}</Text> : null}
      </Text>
      <Text style={styles.weekLbl}>{label}</Text>
    </View>
  );
}

const ActivityRow = memo(function ActivityRow({ a, onPress }: { a: ActivitySummary; onPress: (id: string) => void }) {
  const speed = usesSpeed(a.sport);
  const date = new Date(a.startedAt);
  return (
    <Card onPress={() => onPress(a.id)} style={{ marginBottom: spacing.md }}>
      <View style={styles.rowTop}>
        <View style={styles.rowIcon}>
          <Feather name={SPORT_ICON[a.sport]} size={15} color={colors.accent} />
        </View>
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <Text style={T.title} numberOfLines={1}>
            {a.name}
          </Text>
          <Text style={styles.rowDate}>
            {date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
            {a.source === 'health' && a.sourceName ? ` · ${a.sourceName}` : ''}
          </Text>
        </View>
        {a.demo ? <Badge label="Demo" tint={colors.surfaceAlt} color={colors.muted} /> : null}
      </View>
      <View style={styles.rowStats}>
        <RowStat value={formatKm(a.distanceM)} unit="km" label="Distance" />
        {speed ? (
          <RowStat value={formatSpeed(a.distanceM, a.movingSec)} unit="km/h" label="Speed" />
        ) : (
          <RowStat value={formatPace(paceOf(a.distanceM, a.movingSec))} unit="/km" label="Pace" />
        )}
        <RowStat value={formatDuration(a.movingSec)} label="Time" />
      </View>
      {a.preview.length > 1 ? (
        <View style={{ marginTop: spacing.md }}>
          <RouteSketch segments={[a.preview]} height={110} />
        </View>
      ) : null}
    </Card>
  );
});

function RowStat({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.rowVal}>
        {value}
        {unit ? <Text style={styles.rowUnit}> {unit}</Text> : null}
      </Text>
      <Text style={styles.rowLbl}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  liveBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.onDark, marginRight: spacing.sm },
  liveText: { flex: 1, fontFamily: fonts.semibold, fontSize: 14, color: colors.onDark, fontVariant: ['tabular-nums'] },
  startCard: { paddingBottom: spacing.lg },
  sportRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg },
  sportBtn: { alignItems: 'center', flex: 1 },
  sportCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sportLabel: { fontFamily: fonts.semibold, fontSize: 13, color: colors.ink, marginTop: spacing.xs },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bigNum: { fontFamily: fonts.extra, fontSize: 32, color: colors.ink, letterSpacing: -0.5, marginTop: spacing.xs },
  bars: { flexDirection: 'row', height: 74, marginTop: spacing.sm },
  barCol: { flex: 1, alignItems: 'center' },
  barBox: { flex: 1, width: 14, justifyContent: 'flex-end', borderRadius: 7, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  barFill: { width: '100%', backgroundColor: colors.inkSoft, borderRadius: 7 },
  barLbl: { fontFamily: fonts.medium, fontSize: 11, color: colors.muted, marginTop: 4 },
  filterScroll: { marginTop: spacing.sm, marginBottom: spacing.xs, marginHorizontal: -spacing.xl, flexGrow: 0 },
  filterRow: { paddingHorizontal: spacing.xl },
  weekRow: { flexDirection: 'row' },
  weekVal: { fontFamily: fonts.bold, fontSize: 18, color: colors.ink, fontVariant: ['tabular-nums'] },
  weekUnit: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
  weekLbl: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted, marginTop: 2 },
  okRow: { flexDirection: 'row', alignItems: 'center' },
  link: { fontFamily: fonts.semibold, fontSize: 13, color: colors.accentInk },
  watchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: spacing.md },
  howBrand: { fontFamily: fonts.semibold, color: colors.inkSoft },
  rowTop: { flexDirection: 'row', alignItems: 'center' },
  rowIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  rowDate: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted, marginTop: 1 },
  rowStats: { flexDirection: 'row', marginTop: spacing.md },
  rowVal: { fontFamily: fonts.bold, fontSize: 18, color: colors.ink, fontVariant: ['tabular-nums'] },
  rowUnit: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
  rowLbl: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted, marginTop: 1 },
});
