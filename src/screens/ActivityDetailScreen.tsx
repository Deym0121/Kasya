import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { RootScreenProps } from '../navigation';
import { colors, fonts, radius, spacing, type as T } from '../theme';
import { ScreenContainer, Card, Label, Badge, Button, Reveal } from '../components';
import { RouteMap } from '../activity/map/RouteMap';
import { SeriesChart } from '../viz/SeriesChart';
import { getActivity, getTrack, deleteActivity } from '../storage/activities';
import { fastestSplitIndex, seriesByDistance } from '../activity/splits';
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
import type { ActivitySummary, ActivityTrack } from '../activity/types';

type Props = RootScreenProps<'ActivityDetail'>;

const CHEER: Record<string, string> = { run: 'Nice run!', walk: 'Nice walk!', ride: 'Nice ride!', hike: 'Nice hike!' };

export default function ActivityDetailScreen({ navigation, route }: Props) {
  const { id, justFinished } = route.params;
  const [a, setA] = useState<ActivitySummary | null>(null);
  const [track, setTrack] = useState<ActivityTrack | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const s = await getActivity(id);
        const t = s?.hasTrack ? await getTrack(id) : null;
        if (!alive) return;
        setA(s);
        setTrack(t);
        setLoaded(true);
      })();
      return () => {
        alive = false;
      };
    }, [id]),
  );

  const close = () => (justFinished ? navigation.navigate('Tabs', { screen: 'Activity' }) : navigation.goBack());

  if (!loaded) return <ScreenContainer title="Activity" onBack={close}>{null}</ScreenContainer>;
  if (!a) {
    return (
      <ScreenContainer title="Activity" onBack={close}>
        <Text style={T.bodyMuted}>This activity was removed.</Text>
      </ScreenContainer>
    );
  }

  const speed = usesSpeed(a.sport);
  const pace = paceOf(a.distanceM, a.movingSec);
  const splits = track?.splits ?? [];
  const best = fastestSplitIndex(splits);
  const series = track ? seriesByDistance(track.points, a.distanceM > 20000 ? 250 : 100) : [];
  const hasAlt = series.some((s) => s.alt != null);
  // Bar scale from real full-ish splits only (a short or zero-time tail would
  // otherwise squash every other bar).
  const scaled = splits.filter((s) => s.paceSecPerKm > 0 && Number.isFinite(s.paceSecPerKm) && s.distanceM >= 200);
  const maxPace = scaled.length ? Math.max(...scaled.map((s) => s.paceSecPerKm)) : 1;
  const minPace = scaled.length ? Math.min(...scaled.map((s) => s.paceSecPerKm)) : maxPace;
  const sourceLine =
    a.source === 'health'
      ? `Imported from ${a.sourceName ?? 'your watch'} via Apple Health`
      : a.demo
        ? 'Demo run — simulated GPS, not a real activity'
        : 'Recorded with Kasya';

  const stats: { label: string; value: string; unit?: string }[] = [
    { label: 'Distance', value: formatKm(a.distanceM), unit: 'km' },
    { label: 'Moving time', value: formatDuration(a.movingSec) },
    speed
      ? { label: 'Avg speed', value: formatSpeed(a.distanceM, a.movingSec), unit: 'km/h' }
      : { label: 'Avg pace', value: formatPace(pace), unit: '/km' },
    { label: 'Elev gain', value: a.elevGainM != null ? String(a.elevGainM) : '—', unit: a.elevGainM != null ? 'm' : undefined },
    { label: 'Elapsed', value: formatDuration(a.elapsedSec) },
  ];
  if (a.steps != null) stats.push({ label: 'Steps', value: a.steps.toLocaleString() });
  if (a.avgCadence != null) stats.push({ label: 'Cadence', value: String(a.avgCadence), unit: 'spm' });
  if (a.avgHr != null) stats.push({ label: 'Avg HR', value: String(a.avgHr), unit: 'bpm' });
  if (a.maxHr != null) stats.push({ label: 'Max HR', value: String(a.maxHr), unit: 'bpm' });

  const remove = async () => {
    await deleteActivity(a.id);
    close();
  };

  return (
    <ScreenContainer
      title={justFinished ? 'Saved' : SPORT_LABEL[a.sport]}
      onBack={close}
      right={
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => navigation.navigate('ActivityShare', { id: a.id })}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Share this activity as an image"
          >
            <Feather name="share" size={19} color={colors.ink} />
          </Pressable>
          <Pressable
            onPress={() => setConfirmDelete(true)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Delete this activity"
          >
            <Feather name="trash-2" size={19} color={colors.muted} />
          </Pressable>
        </View>
      }
    >
      {justFinished && (
        <Reveal>
          <Text style={styles.cheer}>{CHEER[a.sport]}</Text>
        </Reveal>
      )}
      <View style={styles.head}>
        <View style={styles.sportIcon}>
          <Feather name={SPORT_ICON[a.sport]} size={18} color={colors.accent} />
        </View>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={T.h2} numberOfLines={1}>
            {a.name}
          </Text>
          <Text style={T.small}>
            {new Date(a.startedAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} ·{' '}
            {new Date(a.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
          </Text>
        </View>
        {a.demo ? <Badge label="Demo" tint={colors.surfaceAlt} color={colors.muted} /> : null}
        {a.source === 'health' ? <Badge label={a.sourceName ?? 'Watch'} tint={colors.surfaceAlt} color={colors.inkSoft} /> : null}
      </View>

      {confirmDelete && (
        <Card style={{ marginTop: spacing.lg, borderColor: colors.lineStrong }}>
          <Text style={T.title}>Delete this activity?</Text>
          <Text style={[T.small, { marginTop: 2 }]}>
            {a.source === 'health'
              ? 'It stays in Apple Health — Kasya just won’t show or re-import it.'
              : 'The route and stats are removed from Kasya. A copy already saved to Apple Health stays there.'}
          </Text>
          <View style={styles.confirmRow}>
            <View style={{ flex: 1 }}>
              <Button label="Keep" variant="secondary" onPress={() => setConfirmDelete(false)} />
            </View>
            <View style={{ width: spacing.md }} />
            <View style={{ flex: 1 }}>
              <Button label="Delete" variant="primary" onPress={remove} />
            </View>
          </View>
        </Card>
      )}
      <View style={{ marginTop: spacing.lg }}>
        {track && track.points.length > 1 ? (
          <RouteMap points={track.points} height={280} interactive />
        ) : (
          <Card style={styles.noRoute}>
            <Feather name="map" size={18} color={colors.muted} />
            <Text style={[T.small, { marginLeft: spacing.sm, flex: 1 }]}>No GPS route for this one — indoor or treadmill activities have totals only.</Text>
          </Card>
        )}
      </View>

      <View style={{ marginTop: spacing.md }}>
        <Button
          label={justFinished ? 'Share your ' + SPORT_LABEL[a.sport].toLowerCase() : 'Share image'}
          icon="share-2"
          variant={justFinished ? 'accent' : 'secondary'}
          onPress={() => navigation.navigate('ActivityShare', { id: a.id })}
        />
      </View>

      <Card style={{ marginTop: spacing.lg }}>
        <View style={styles.grid}>
          {stats.map((s) => (
            <View key={s.label} style={styles.cell}>
              <Text style={styles.val}>
                {s.value}
                {s.unit ? <Text style={styles.unit}> {s.unit}</Text> : null}
              </Text>
              <Text style={styles.lbl}>{s.label}</Text>
            </View>
          ))}
        </View>
      </Card>

      {splits.length > 0 && (
        <>
          <View style={{ height: spacing.xl }} />
          <Label>Splits</Label>
          <Card style={{ marginTop: spacing.sm }}>
            <View style={styles.splitHead}>
              <Text style={[styles.splitCol, styles.splitKm, styles.splitHeadText]}>Km</Text>
              <Text style={[styles.splitCol, styles.splitPace, styles.splitHeadText]}>{speed ? 'Speed' : 'Pace'}</Text>
              <View style={{ flex: 1 }} />
              <Text style={[styles.splitCol, styles.splitElev, styles.splitHeadText]}>Elev</Text>
            </View>
            {splits.map((s) => {
              // bar length: faster split = longer bar (relative within this activity)
              const span = Math.max(1, maxPace - minPace);
              const known = s.paceSecPerKm > 0 && Number.isFinite(s.paceSecPerKm);
              const clamped = Math.min(maxPace, Math.max(minPace, s.paceSecPerKm));
              const w = known ? 0.35 + 0.65 * (1 - (clamped - minPace) / span) : 0;
              const isBest = s.index === best;
              return (
                <View key={s.index} style={styles.splitRow}>
                  <Text style={[styles.splitCol, styles.splitKm, styles.splitText]}>
                    {s.distanceM < 999 ? (s.distanceM / 1000).toFixed(2) : s.index}
                  </Text>
                  <Text style={[styles.splitCol, styles.splitPace, styles.splitText, isBest && { color: colors.accent }]}>
                    {!known ? '–' : speed ? `${((1000 / s.paceSecPerKm) * 3.6).toFixed(1)}` : formatPace(s.paceSecPerKm)}
                  </Text>
                  <View style={styles.barTrack}>
                    <View style={[styles.bar, { width: `${Math.round(w * 100)}%` as const }, isBest && { backgroundColor: colors.accent }]} />
                  </View>
                  <Text style={[styles.splitCol, styles.splitElev, styles.splitMuted]}>
                    {s.elevDeltaM == null ? '' : `${s.elevDeltaM > 0 ? '+' : ''}${Math.round(s.elevDeltaM)}`}
                  </Text>
                </View>
              );
            })}
            {best != null && splits.length > 1 && (
              <Text style={[T.small, { marginTop: spacing.sm }]}>Orange = your fastest km.</Text>
            )}
          </Card>
        </>
      )}

      {series.length > 2 && (
        <>
          <View style={{ height: spacing.xl }} />
          <Label>Charts</Label>
          <Card style={{ marginTop: spacing.sm }}>
            <SeriesChart
              caption={speed ? 'Speed' : 'Pace'}
              values={series.map((s) => (s.pace == null ? null : speed ? 3600 / s.pace : s.pace))}
              totalKm={a.distanceM / 1000}
              invert={!speed}
              format={(v) => (speed ? `${v.toFixed(1)} km/h` : `${formatPace(v)} /km`)}
            />
            {hasAlt && (
              <View style={{ marginTop: spacing.lg }}>
                <SeriesChart
                  caption="Elevation"
                  values={series.map((s) => s.alt)}
                  totalKm={a.distanceM / 1000}
                  color={colors.success}
                  format={(v) => `${Math.round(v)} m`}
                />
              </View>
            )}
          </Card>
        </>
      )}

      <Text style={[T.small, { marginTop: spacing.xl, textAlign: 'center' }]}>{sourceLine}</Text>

    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  cheer: { fontFamily: fonts.extra, fontSize: 30, color: colors.accent, letterSpacing: -0.5, marginBottom: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sportIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noRoute: { flexDirection: 'row', alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '33.33%', paddingVertical: spacing.sm },
  val: { fontFamily: fonts.bold, fontSize: 19, color: colors.ink, fontVariant: ['tabular-nums'] },
  unit: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
  lbl: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted, marginTop: 2 },
  splitHead: { flexDirection: 'row', alignItems: 'center', paddingBottom: spacing.xs },
  splitHeadText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.8 },
  splitRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  splitCol: {},
  splitKm: { width: 44 },
  splitPace: { width: 58 },
  splitElev: { width: 40, textAlign: 'right' },
  splitText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink, fontVariant: ['tabular-nums'] },
  splitMuted: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted, fontVariant: ['tabular-nums'] },
  barTrack: { flex: 1, height: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, marginHorizontal: spacing.sm },
  bar: { height: 8, borderRadius: radius.pill, backgroundColor: colors.inkSoft },
  confirmRow: { flexDirection: 'row', marginTop: spacing.lg },
});
