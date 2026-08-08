import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { TabScreenProps } from '../navigation';
import { colors, spacing, radius, type as T, fonts } from '../theme';
import {
  ScreenContainer,
  Card,
  Chip,
  Badge,
  ConfidenceChip,
  Label,
  EmptyState,
  NoticeBanner,
  Disclaimer,
  Button,
} from '../components';
import { listReports, deleteReport } from '../storage/reports';
import { deleteRemoteReport } from '../sync/reportSync';
import { GaitReportRecord } from '../storage/reportRecord';
import { buildTrends, cadenceDelta, deltaCopy } from '../gait/progress';
import { TrendChart } from '../viz/TrendChart';
import { goalLabel } from '../goals';
import { getReminderSettings } from '../storage/settings';
import { isRescanDue, dueBannerCopy } from '../storage/reminderDue';

type Props = TabScreenProps<'History'>;

const SERIES = [
  { key: 'cadence', label: 'Cadence', unit: 'spm' },
  { key: 'symmetry', label: 'Symmetry', unit: '%' },
  { key: 'stance', label: 'Stance', unit: '%' },
] as const;
type SeriesKey = (typeof SERIES)[number]['key'];

export default function HistoryScreen({ navigation }: Props) {
  const [reports, setReports] = useState<GaitReportRecord[]>([]);
  const [series, setSeries] = useState<SeriesKey>('cadence');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [due, setDue] = useState<{ due: boolean; daysSince: number | null }>({ due: false, daysSince: null });

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const all = await listReports();
        if (!active) return;
        setReports(all);
        setConfirmId(null);
        const settings = await getReminderSettings();
        if (!active) return;
        setDue(isRescanDue(all[0]?.createdAt ?? null, settings.cadence, new Date()));
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  const remove = async (id: string) => {
    await deleteReport(id);
    deleteRemoteReport(id).catch(() => {}); // drop the cloud copy too (fire-and-forget)
    setConfirmId(null);
    const all = await listReports();
    setReports(all);
    // The newest scan may have changed — recompute the due banner too.
    const settings = await getReminderSettings();
    setDue(isRescanDue(all[0]?.createdAt ?? null, settings.cadence, new Date()));
  };

  if (reports.length === 0) {
    return (
      <ScreenContainer title="History" edges={['top']}>
        {due.due && (
          <NoticeBanner
            icon="clock"
            text={dueBannerCopy(due.daysSince)}
            actionLabel="Scan now"
            onAction={() => navigation.navigate('ScanSetup')}
          />
        )}
        <View style={{ marginTop: spacing.xl }}>
          <EmptyState
            icon="bar-chart-2"
            title="No scans yet"
            body="Your scans, trends and progress will live here. The first one takes about 30 seconds."
            action={{ label: 'Start your first scan', onPress: () => navigation.navigate('ScanSetup') }}
          />
        </View>
        <Disclaimer />
      </ScreenContainer>
    );
  }

  const trends = buildTrends(reports);
  const points = trends[series];
  const delta = series === 'cadence' ? cadenceDelta(reports) : null;
  const active = SERIES.find((s) => s.key === series)!;

  return (
    <ScreenContainer title="History" edges={['top']}>
      {due.due && (
        <NoticeBanner
          icon="clock"
          text={dueBannerCopy(due.daysSince)}
          actionLabel="Scan now"
          onAction={() => navigation.navigate('ScanSetup')}
        />
      )}

      <Label>Progress</Label>
      <Card style={{ marginTop: spacing.sm }}>
        <View style={styles.chips}>
          {SERIES.map((s) => (
            <Chip key={s.key} label={s.label} selected={series === s.key} onPress={() => setSeries(s.key)} />
          ))}
        </View>
        <View style={{ height: spacing.sm }} />
        <TrendChart points={points} unit={active.unit} />
        {delta && points.length >= 2 ? <Text style={styles.delta}>{deltaCopy(delta)}</Text> : null}
      </Card>

      <View style={{ height: spacing.xl }} />
      <Label>Recent scans</Label>
      <View style={{ height: spacing.sm }} />
      {reports.map((r) => (
        // The open target and the trash button are SIBLINGS (a pressable Card
        // wrapping the trash would nest <button> in <button> on web).
        <Card key={r.id} style={{ marginBottom: spacing.md }}>
          {confirmId === r.id ? (
            <View>
              <Text style={T.title}>Remove this scan?</Text>
              <Text style={[T.small, { marginTop: 2 }]}>This only deletes the saved numbers — there was never any video.</Text>
              <View style={styles.confirmRow}>
                <View style={{ flex: 1 }}>
                  <Button label="Keep" variant="secondary" onPress={() => setConfirmId(null)} />
                </View>
                <View style={{ width: spacing.md }} />
                <View style={{ flex: 1 }}>
                  <Button label="Remove" variant="primary" onPress={() => remove(r.id)} />
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.row}>
              <Pressable
                onPress={() => navigation.navigate('Result', { report: r })}
                accessibilityRole="button"
                accessibilityLabel={`Open scan from ${new Date(r.createdAt).toLocaleDateString()}`}
                style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.85 }]}
              >
                <View style={styles.rowTop}>
                  <Text style={styles.date}>{new Date(r.createdAt).toLocaleDateString()}</Text>
                  <Badge
                    label={r.frontal ? 'Side + Rear' : 'Side view'}
                    tint={colors.surfaceAlt}
                    color={colors.muted}
                  />
                  {r.simulated && <Badge label="Demo" tint={colors.surfaceAlt} color={colors.muted} />}
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.big}>{Math.round(r.result.cadence.value)}</Text>
                  <Text style={styles.unit}>spm</Text>
                  <View style={{ width: spacing.md }} />
                  <ConfidenceChip confidence={r.result.cadence.confidence} />
                </View>
                <Text style={styles.goal}>{goalLabel(r.scanType)}</Text>
              </Pressable>
              <Pressable
                onPress={() => setConfirmId(r.id)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Remove this scan"
                style={styles.trash}
              >
                <Feather name="trash-2" size={18} color={colors.muted} />
              </Pressable>
            </View>
          )}
        </Card>
      ))}

      <Disclaimer />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  delta: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.inkSoft, marginTop: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  date: { fontFamily: fonts.semibold, fontSize: 13, color: colors.muted },
  statRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  big: { fontFamily: fonts.extra, fontSize: 30, color: colors.ink, letterSpacing: -0.5 },
  unit: { fontFamily: fonts.semibold, fontSize: 14, color: colors.muted, marginLeft: 4 },
  goal: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted, marginTop: spacing.xs },
  trash: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  confirmRow: { flexDirection: 'row', marginTop: spacing.lg },
});
