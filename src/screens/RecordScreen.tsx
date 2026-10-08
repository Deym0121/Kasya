import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Linking,
  ActivityIndicator,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { RootScreenProps } from '../navigation';
import { colors, fonts, radius, spacing, type as T } from '../theme';
import { Button, Chip } from '../components';
import { RouteMap } from '../activity/map/RouteMap';
import { useRecording, useNow } from '../activity/useRecording';
import { session } from '../activity/session';
import { liveMovingSec } from '../activity/recorder';
import {
  ensureLocationPermission,
  startTracking,
  stopTracking,
  watchPreview,
  backgroundCapable,
} from '../activity/location';
import { startDemoFeed, stopDemoFeed, demoFeedRunning } from '../activity/demoFeed';
import { getVoiceCues, setVoiceCues } from '../activity/voiceCues';
import { stepsPermission, watchPhoneSteps, hasStepHistory, phoneStepsBetween } from '../activity/steps';
import { stepsBetween, getHealthState } from '../activity/healthSync';
import { saveWorkoutToHealth } from '../activity/health';
import { finalizeRecording, MIN_SAVE_DISTANCE_M, segmentWindows, stepsOver } from '../activity/finalize';
import { saveActivity } from '../storage/activities';
import {
  formatDuration,
  formatKm,
  formatPace,
  formatSpeed,
  paceOf,
  usesSpeed,
  countsSteps,
  SPORT_LABEL,
  SPORT_ICON,
} from '../activity/format';
import { SPORTS, type Fix, type Sport } from '../activity/types';
import { tapHaptic, successHaptic } from '../haptics';

type Props = RootScreenProps<'Record'>;
type Phase = 'live' | 'confirm' | 'confirmDiscard' | 'saving' | 'tooShort';
type Problem = null | 'denied' | 'services-off' | 'start-failed';

/** Demo runs: everywhere on web (no screen-off GPS in a browser), dev builds on device. */
const DEMO_ALLOWED = Platform.OS === 'web' || __DEV__;
/** Typical cadence used to give demo runs plausible step counts. */
const DEMO_CADENCE: Record<Sport, number> = { run: 168, walk: 112, hike: 104, ride: 0 };

export default function RecordScreen({ navigation, route }: Props) {
  const snap = useRecording();
  const stats = snap.stats;
  const [phase, setPhase] = useState<Phase>('live');
  // While saving, the session is still live (finish() only runs after the
  // write succeeds), and 'saving' pins the live UI so the setup screen and
  // its Start button can never appear under a second tap.
  const recording = (snap.active && !!stats) || phase === 'saving';
  const [sport, setSport] = useState<Sport>(route.params?.sport ?? 'run');
  const [autoPause, setAutoPause] = useState(true);
  const [voice, setVoice] = useState(true);
  const [problem, setProblem] = useState<Problem>(null);
  const [saveError, setSaveError] = useState(false);
  const [starting, setStarting] = useState(false);
  const [preview, setPreview] = useState<Fix | null>(null);
  const [steps, setSteps] = useState<number | null>(session.liveSteps);
  const focused = useIsFocused();
  const now = useNow(focused);
  const { height: screenH } = useWindowDimensions();
  // Initialised from the live session so re-opening mid-run doesn't buzz for
  // kilometres already announced.
  const lastKm = useRef(Math.floor((session.recorder?.distanceM ?? 0) / 1000));
  const busy = useRef(false);

  const liveSport = stats?.sport ?? sport;
  const paused = stats?.status === 'paused';

  // Re-attach to an interrupted recording (app was killed mid-run): restore the
  // log and restart GPS. A restored demo run waits paused until you resume.
  useEffect(() => {
    let alive = true;
    (async () => {
      const had = await session.restore();
      if (!alive || !had) return;
      const s = session.recorder;
      if (!s || s.status === 'finished') return;
      lastKm.current = Math.max(lastKm.current, Math.floor(s.distanceM / 1000));
      if (session.isDemo) {
        if (!demoFeedRunning() && s.status === 'recording') session.pause();
      } else if (s.status === 'recording') {
        // Always re-assert from the foreground: after Android killed the
        // process the restored task runs without its foreground service.
        startTracking(s.sport).catch(() => alive && setProblem('start-failed'));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    getVoiceCues().then(setVoice);
  }, []);

  // GPS preview before Start: centre the map and show signal strength.
  useFocusEffect(
    useCallback(() => {
      if (recording) return;
      let stop: (() => void) | null = null;
      let alive = true;
      (async () => {
        const perm = await ensureLocationPermission().catch(() => 'denied' as const);
        if (!alive) return;
        if (perm !== 'granted') {
          // web desktop without GPS is normal — the demo run still works
          if (Platform.OS !== 'web') setProblem(perm);
          return;
        }
        // permission is fine now — but keep a GPS start failure on screen
        setProblem((p) => (p === 'start-failed' ? p : null));
        stop = await watchPreview((f) => alive && setPreview(f));
        if (!alive) stop();
      })();
      return () => {
        alive = false;
        stop?.();
      };
    }, [recording]),
  );

  // Live steps for foot sports. iOS reads the phone's motion history over the
  // recorded windows (manual pauses excluded) every few seconds while you're
  // looking; Android counts live, accumulated in the session so leaving and
  // re-opening this screen doesn't reset it.
  const liveForSteps = !!stats && snap.active && countsSteps(stats.sport) && !snap.demo;
  useEffect(() => {
    if (!liveForSteps || !focused) return;
    let alive = true;
    if (hasStepHistory) {
      const read = async () => {
        const rec = session.recorder;
        if (!rec) return;
        const live = rec.status === 'recording' ? Date.now() : null;
        const n = await stepsOver(segmentWindows(rec.points, rec.startedAt, live), phoneStepsBetween);
        if (alive && n != null) setSteps(n);
      };
      read();
      const t = setInterval(read, 5000);
      return () => {
        alive = false;
        clearInterval(t);
      };
    }
    const base = session.liveSteps ?? 0;
    const unsub = watchPhoneSteps((n) => {
      if (session.recorder?.status !== 'recording') return;
      session.liveSteps = base + n;
      if (alive) setSteps(session.liveSteps);
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [liveForSteps, focused, snap.id]);

  // A haptic tap at every completed km (foreground).
  useEffect(() => {
    if (!stats) return;
    const km = Math.floor(stats.distanceM / 1000);
    if (km > lastKm.current) {
      lastKm.current = km;
      tapHaptic();
    }
  }, [stats?.distanceM]);

  const movingSec = stats ? liveMovingSec(stats, now) : 0;
  const shownSteps = snap.demo && stats ? Math.round((DEMO_CADENCE[stats.sport] * stats.movingSec) / 60) : steps;
  const cadence = shownSteps && movingSec > 30 ? Math.round(shownSteps / (movingSec / 60)) : null;

  const start = async (demo: boolean) => {
    if (busy.current) return;
    busy.current = true;
    setStarting(true);
    setProblem(null);
    try {
      if (!demo) {
        const perm = await ensureLocationPermission();
        if (perm !== 'granted') {
          setProblem(perm);
          return;
        }
      }
      if (countsSteps(sport) && !demo) await stepsPermission();
      const t0 = Date.now();
      await session.begin(sport, { autoPause, demo, now: t0 });
      lastKm.current = 0;
      setSteps(null);
      setSaveError(false);
      setPhase('live');
      if (demo) startDemoFeed(sport, t0);
      else await startTracking(sport);
      tapHaptic();
    } catch {
      setProblem('start-failed');
      stopDemoFeed();
      await stopTracking();
      await session.clear();
    } finally {
      busy.current = false;
      setStarting(false);
    }
  };

  const pause = () => {
    session.pause();
    tapHaptic();
  };

  const resume = async () => {
    if (busy.current) return;
    session.resume();
    setPhase('live');
    setSaveError(false);
    const s = session.recorder;
    if (!s) return;
    if (session.isDemo) {
      if (!demoFeedRunning()) startDemoFeed(s.sport, Math.max(Date.now(), (s.lastFixAt ?? 0) + 1000));
    } else {
      // GPS may have been stopped by a failed save or a relaunch — re-assert it
      startTracking(s.sport).catch(() => setProblem('start-failed'));
    }
    tapHaptic();
  };

  const askFinish = () => {
    if (stats?.status === 'recording') session.pause();
    setPhase(stats && stats.distanceM < MIN_SAVE_DISTANCE_M ? 'tooShort' : 'confirm');
  };

  const discard = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      stopDemoFeed();
      await stopTracking();
      await session.clear();
    } finally {
      busy.current = false;
    }
    navigation.goBack();
  };

  const save = async () => {
    const rec = session.recorder;
    if (busy.current || !rec || rec.status === 'finished') return;
    busy.current = true;
    setPhase('saving');
    setSaveError(false);
    const demo = session.isDemo;
    const id = snap.id ?? undefined;
    let record: ReturnType<typeof finalizeRecording>;
    try {
      stopDemoFeed();
      await stopTracking();
      const endedAt = Math.max(Date.now(), rec.lastFixAt ?? 0);
      let finalSteps: number | null = null;
      if (countsSteps(rec.sport)) {
        const windows = segmentWindows(rec.points, rec.startedAt, null);
        finalSteps = demo
          ? Math.round((DEMO_CADENCE[rec.sport] * rec.movingSec) / 60)
          : ((await stepsOver(windows, phoneStepsBetween)) ?? (await stepsOver(windows, stepsBetween)) ?? session.liveSteps);
      }
      record = finalizeRecording(rec, { endedAt, steps: finalSteps, id });
      if (demo) record.summary.demo = true;
      await saveActivity(record);
    } catch {
      // Nothing is lost: the session is still live and paused, its log still on
      // disk. Let the user retry (or resume — GPS restarts on resume).
      busy.current = false;
      setSaveError(true);
      setPhase('confirm');
      return;
    }
    session.finish();
    if (!demo) {
      getHealthState()
        .then((h) => (h.connected && h.writeBack ? saveWorkoutToHealth(record.summary, record.track) : false))
        .catch(() => {});
    }
    successHaptic();
    navigation.replace('ActivityDetail', { id: record.summary.id, justFinished: true });
    await session.clear();
    busy.current = false;
  };

  const gps = gpsLabel(
    recording ? stats?.gpsAccuracyM ?? null : preview?.acc ?? null,
    recording ? stats?.lastFixAt ?? null : preview?.t ?? null,
    now,
  );
  // Redraw the live map every few accepted points, not every fix — a long run
  // has thousands, and the map only needs to look current.
  const mapTick = Math.floor(snap.version / 3);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mapPoints = useMemo(() => (session.recorder?.points ?? []).slice(), [mapTick, snap.id]);
  const center: [number, number] | null = preview ? [preview.lat, preview.lon] : null;

  const avgPace = stats ? paceOf(stats.distanceM, movingSec) : null;
  const speedMode = usesSpeed(liveSport);
  // Size the map to the screen so an iPhone SE still fits every control.
  const compact = screenH < 720;
  const mapH = Math.round(Math.min(recording ? 230 : 280, Math.max(150, screenH * (recording ? 0.27 : 0.33))));

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.topbar}>
        <Pressable
          onPress={() => navigation.goBack()}
          disabled={phase === 'saving'}
          hitSlop={12}
          style={styles.iconBtn}
          accessibilityRole="button"
          accessibilityLabel={recording ? 'Minimise — keeps recording' : 'Close'}
        >
          <Feather name={recording ? 'chevron-down' : 'x'} size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>{recording ? SPORT_LABEL[liveSport] : 'Record'}</Text>
        <View style={[styles.gps, { borderColor: gps.color }]} accessible accessibilityLabel={snap.demo ? 'Demo run' : gps.text}>
          <View style={[styles.gpsDot, { backgroundColor: gps.color }]} />
          <Text style={[styles.gpsText, { color: gps.color }]}>{snap.demo ? 'Demo' : gps.text}</Text>
        </View>
      </View>

      <View style={{ paddingHorizontal: spacing.lg }}>
        <RouteMap points={mapPoints} height={mapH} live center={center} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body} bounces={false} showsVerticalScrollIndicator={false}>
        {recording && stats ? (
          <>
            {stats.autoPaused || paused ? (
              <View style={styles.pausedPill}>
                <Feather name="pause" size={13} color={colors.warn} />
                <Text style={styles.pausedText}>{paused ? 'Paused' : 'Auto-paused — start moving to resume'}</Text>
              </View>
            ) : null}
            <Text
              style={[styles.timer, compact && { fontSize: 46, marginTop: spacing.sm }]}
              accessibilityLabel={`Moving time ${formatDuration(movingSec)}`}
            >
              {formatDuration(movingSec)}
            </Text>
            <View style={[styles.row, compact && { marginTop: spacing.md }]}>
              <Stat label="Distance" value={formatKm(stats.distanceM)} unit="km" />
              {speedMode ? (
                <Stat label="Avg speed" value={formatSpeed(stats.distanceM, movingSec)} unit="km/h" />
              ) : (
                <Stat label="Avg pace" value={formatPace(avgPace)} unit="/km" />
              )}
              {speedMode ? (
                <Stat label="Elev gain" value={String(Math.round(stats.elevGainM))} unit="m" />
              ) : (
                <Stat label="Current" value={formatPace(snap.currentPace)} unit="/km" />
              )}
            </View>
            {!speedMode && (
              <View style={[styles.row, compact && { marginTop: spacing.md }]}>
                <Stat label="Steps" value={shownSteps != null ? shownSteps.toLocaleString() : '—'} small />
                <Stat label="Cadence" value={cadence ? String(cadence) : '—'} unit={cadence ? 'spm' : undefined} small />
                <Stat label="Elev gain" value={String(Math.round(stats.elevGainM))} unit="m" small />
              </View>
            )}
            {problem === 'start-failed' ? <ProblemNote problem={problem} /> : null}

            <View style={{ flex: 1, minHeight: spacing.lg }} />

            {phase === 'confirm' || phase === 'saving' ? (
              <View style={styles.sheet}>
                <Text style={T.title}>Finish this {SPORT_LABEL[liveSport].toLowerCase()}?</Text>
                <Text style={[T.small, { marginTop: 2 }]}>
                  {formatKm(stats.distanceM)} km in {formatDuration(movingSec)}
                  {snap.demo ? ' · demo' : ''}
                </Text>
                {saveError ? (
                  <Text style={styles.saveError}>Couldn't save — your activity is safe. Try again.</Text>
                ) : null}
                <View style={{ height: spacing.md }} />
                <Button label="Save activity" variant="accent" icon="check" onPress={save} loading={phase === 'saving'} />
                <View style={styles.sheetRow}>
                  <View style={{ flex: 1 }}>
                    <Button label="Resume" variant="secondary" onPress={resume} disabled={phase === 'saving'} />
                  </View>
                  <View style={{ width: spacing.md }} />
                  <View style={{ flex: 1 }}>
                    <Button label="Discard" variant="ghost" onPress={() => setPhase('confirmDiscard')} disabled={phase === 'saving'} />
                  </View>
                </View>
              </View>
            ) : phase === 'confirmDiscard' ? (
              <View style={styles.sheet}>
                <Text style={T.title}>Discard this {SPORT_LABEL[liveSport].toLowerCase()}?</Text>
                <Text style={[T.small, { marginTop: 2 }]}>
                  {formatKm(stats.distanceM)} km will be deleted and can't be recovered.
                </Text>
                <View style={styles.sheetRow}>
                  <View style={{ flex: 1 }}>
                    <Button label="Keep it" variant="secondary" onPress={() => setPhase('confirm')} />
                  </View>
                  <View style={{ width: spacing.md }} />
                  <View style={{ flex: 1 }}>
                    <Button label="Discard" variant="primary" onPress={discard} />
                  </View>
                </View>
              </View>
            ) : phase === 'tooShort' ? (
              <View style={styles.sheet}>
                <Text style={T.title}>Too short to save</Text>
                <Text style={[T.small, { marginTop: 2 }]}>Move at least {MIN_SAVE_DISTANCE_M} m to save an activity.</Text>
                <View style={styles.sheetRow}>
                  <View style={{ flex: 1 }}>
                    <Button label="Resume" variant="secondary" onPress={resume} />
                  </View>
                  <View style={{ width: spacing.md }} />
                  <View style={{ flex: 1 }}>
                    <Button label="Discard" variant="ghost" onPress={discard} />
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.controls}>
                {paused ? (
                  <>
                    <RoundButton icon="play" label="Resume" onPress={resume} tone="accent" />
                    <RoundButton icon="square" label="Finish" onPress={askFinish} tone="ink" />
                  </>
                ) : (
                  <RoundButton icon="pause" label="Pause" onPress={pause} tone="ink" big />
                )}
              </View>
            )}
            {!backgroundCapable && !snap.demo && (
              <Text style={styles.footnote}>Keep this tab open — browsers can't track with the screen off.</Text>
            )}
          </>
        ) : (
          <>
            <Text style={[T.label, { marginTop: spacing.lg }]}>Activity</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
              {SPORTS.map((s) => (
                <Chip key={s} label={SPORT_LABEL[s]} icon={SPORT_ICON[s]} selected={sport === s} onPress={() => setSport(s)} />
              ))}
            </ScrollView>
            <View style={styles.chips}>
              <Chip
                label={autoPause ? 'Auto-pause on' : 'Auto-pause off'}
                icon={autoPause ? 'pause-circle' : 'circle'}
                selected={autoPause}
                onPress={() => setAutoPause((v) => !v)}
              />
              <Chip
                label={voice ? 'Voice cues on' : 'Voice cues off'}
                icon={voice ? 'volume-2' : 'volume-x'}
                selected={voice}
                onPress={() => {
                  const next = !voice;
                  setVoice(next);
                  setVoiceCues(next);
                }}
              />
            </View>

            {problem ? <ProblemNote problem={problem} /> : null}

            <View style={{ flex: 1, minHeight: spacing.lg }} />
            <View style={styles.controls}>
              {starting ? (
                <ActivityIndicator color={colors.accent} size="large" />
              ) : (
                <RoundButton icon="play" label={`Start ${SPORT_LABEL[sport].toLowerCase()}`} onPress={() => start(false)} tone="accent" big />
              )}
            </View>
            {DEMO_ALLOWED && !starting && (
              <Pressable onPress={() => start(true)} accessibilityRole="button" style={styles.demoLink} hitSlop={8}>
                <Text style={styles.demoText}>No GPS here? Try a demo {SPORT_LABEL[sport].toLowerCase()}</Text>
              </Pressable>
            )}
            <Text style={styles.footnote}>Your routes are saved on this phone — never uploaded to Kasya's servers.</Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value, unit, small }: { label: string; value: string; unit?: string; small?: boolean }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label} ${value}${unit ? ` ${unit}` : ''}`}>
      <Text style={[styles.statVal, small && { fontSize: 20 }]}>
        {value}
        {unit ? <Text style={styles.statUnit}> {unit}</Text> : null}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function RoundButton({
  icon,
  label,
  onPress,
  tone,
  big,
}: {
  icon: 'play' | 'pause' | 'square';
  label: string;
  onPress: () => void;
  tone: 'accent' | 'ink';
  big?: boolean;
}) {
  const size = big ? 84 : 70;
  return (
    <View style={{ alignItems: 'center', marginHorizontal: spacing.lg }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [
          styles.round,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: tone === 'accent' ? colors.accent : colors.ink },
          pressed && { transform: [{ scale: 0.95 }] },
        ]}
      >
        <Feather name={icon} size={big ? 32 : 26} color={tone === 'accent' ? colors.onDark : colors.bg} />
      </Pressable>
      <Text style={styles.roundLabel}>{label}</Text>
    </View>
  );
}

function ProblemNote({ problem }: { problem: 'denied' | 'services-off' | 'start-failed' }) {
  const copy =
    problem === 'denied'
      ? 'Kasya needs location access to map your route. Allow "While Using the App" in Settings — you can still try a demo run.'
      : problem === 'services-off'
        ? 'Location Services are off. Turn them on in Settings to record with GPS.'
        : "GPS couldn't start. Step outside or try again in a moment.";
  return (
    <View style={styles.problem}>
      <Feather name="map-pin" size={16} color={colors.warn} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, marginLeft: spacing.sm }}>
        <Text style={styles.problemText}>{copy}</Text>
        {problem !== 'start-failed' && Platform.OS !== 'web' ? (
          <Pressable onPress={() => Linking.openSettings()} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.problemAction}>Open Settings</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function gpsLabel(acc: number | null, at: number | null, now: number): { text: string; color: string } {
  if (acc == null || at == null || now - at > 15000) return { text: 'GPS searching', color: colors.muted };
  if (acc <= 10) return { text: 'GPS strong', color: colors.success };
  if (acc <= 25) return { text: 'GPS fair', color: colors.warn };
  return { text: 'GPS weak', color: colors.danger };
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topbar: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg },
  iconBtn: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  gps: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  gpsDot: { width: 7, height: 7, borderRadius: 4, marginRight: 6 },
  gpsText: { fontFamily: fonts.semibold, fontSize: 11 },
  body: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  saveError: { fontFamily: fonts.semibold, fontSize: 13, color: colors.danger, marginTop: spacing.sm },
  pausedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.warnSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: spacing.md,
    gap: 6,
  },
  pausedText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.warn },
  timer: {
    fontFamily: fonts.extra,
    fontSize: 56,
    color: colors.ink,
    textAlign: 'center',
    letterSpacing: -1,
    marginTop: spacing.md,
    fontVariant: ['tabular-nums'],
  },
  row: { flexDirection: 'row', marginTop: spacing.lg },
  stat: { flex: 1, alignItems: 'center' },
  statVal: { fontFamily: fonts.bold, fontSize: 26, color: colors.ink, fontVariant: ['tabular-nums'] },
  statUnit: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted },
  statLabel: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted, marginTop: 2 },
  controls: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', paddingVertical: spacing.md },
  round: { alignItems: 'center', justifyContent: 'center' },
  roundLabel: { fontFamily: fonts.semibold, fontSize: 13, color: colors.inkSoft, marginTop: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm },
  chipScroll: { marginTop: spacing.sm, marginHorizontal: -spacing.xl, flexGrow: 0 },
  chipRow: { paddingHorizontal: spacing.xl },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  sheetRow: { flexDirection: 'row', marginTop: spacing.md },
  demoLink: { alignSelf: 'center', paddingVertical: spacing.sm },
  demoText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.accentInk },
  footnote: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, textAlign: 'center', marginTop: spacing.xs },
  problem: {
    flexDirection: 'row',
    backgroundColor: colors.warnSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  problemText: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.inkSoft },
  problemAction: { fontFamily: fonts.semibold, fontSize: 13, color: colors.warn, marginTop: spacing.xs },
});
