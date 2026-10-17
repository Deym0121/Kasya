import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, PanResponder, type LayoutChangeEvent } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, radius } from '../theme';
import type { PoseFrame } from '../gait/types';
import { poseAt, prepareReplay } from './motion';
import { bodyMetrics } from './bodyModel';
import { stageFor, type Body } from './three/rig';
import { composeFrame, type ReplayView } from './three/scene';
import { Stage3D } from './Stage3D';

export type { ReplayView };

const SPEEDS = [0.25, 0.5, 1];
const VIEWS: { key: ReplayView; label: string }[] = [
  { key: 'human', label: 'Human' },
  { key: 'anatomy', label: 'X-ray' },
  { key: 'skeleton', label: 'Skeleton' },
];
const BODIES: { key: Body; label: string }[] = [
  { key: 'male', label: 'Male' },
  { key: 'female', label: 'Female' },
];
type Angle = 'side' | 'three' | 'front';
const ANGLES: { key: Angle; label: string }[] = [
  { key: 'side', label: 'Side' },
  { key: 'three', label: '3D' },
  { key: 'front', label: 'Front' },
];
const BODY_KEY = 'kasya:replay:body:v1';
const FRAME_MS = 33; // ~30 fps is plenty for a replay and kind to the battery
const DEFAULT_PITCH = 0.1;

/**
 * Gait replay of the user's captured movement as a 3D figure the user can turn
 * around — Human (a male or female runner), X-ray (translucent body with the
 * skeleton inside) and Skeleton (bones only). The capture is side-on, so the
 * figure moves exactly as filmed in the sagittal plane; depth comes from body
 * proportions (three/rig.ts). Hips/knees/ankles flagged by the analysis glow
 * warm — a movement note, NOT an injury claim.
 */
export function XraySkeleton({
  frames,
  flagged = [],
  height = 360,
  initialView = 'human',
}: {
  frames: PoseFrame[];
  flagged?: number[];
  height?: number;
  initialView?: ReplayView;
}) {
  const n = frames?.length ?? 0;
  const replay = useMemo(() => prepareReplay(frames), [frames]);
  const stage = useMemo(() => stageFor(replay, bodyMetrics(replay)), [replay]);
  const t0 = n ? frames[0].t : 0;
  const total = n > 1 ? Math.max(1, frames[n - 1].t - t0) : 1;

  const [view, setView] = useState<ReplayView>(initialView);
  const [body, setBody] = useState<Body>('male');
  const [width, setWidth] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(0.5);
  const angleYaw = useCallback(
    (a: Angle) => (a === 'side' ? 0 : a === 'three' ? stage.facing * 0.62 : stage.facing * (Math.PI / 2)),
    [stage.facing],
  );
  const [yaw, setYaw] = useState(() => angleYaw('three'));
  const [pitch, setPitch] = useState(DEFAULT_PITCH);
  const [angle, setAngle] = useState<Angle | null>('three');
  const [hint, setHint] = useState(true);
  const raf = useRef(0);
  const tRef = useRef(0);
  // Adaptive cost control: frame build time (EMA) → mesh detail and frame pacing,
  // so slower phones get a lighter mesh and fewer frames instead of a stuck UI.
  const perf = useRef({ avg: 16, detail: 1, frameMs: FRAME_MS });

  // A new clip may walk the other way: re-aim the default 3/4 view at its face.
  useEffect(() => {
    setYaw(angleYaw('three'));
    setAngle('three');
  }, [angleYaw]);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(BODY_KEY)
      .then((v) => {
        if (alive && (v === 'male' || v === 'female')) setBody(v);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const chooseBody = (b: Body) => {
    setBody(b);
    AsyncStorage.setItem(BODY_KEY, b).catch(() => {});
  };

  useEffect(() => {
    if (!playing || n < 2) return;
    let mounted = true;
    let prev = 0;
    let lastDraw = 0;
    const loop = (ts: number) => {
      if (!mounted) return;
      if (!prev) prev = ts;
      tRef.current += (ts - prev) * speed;
      prev = ts;
      if (tRef.current > total) tRef.current = 0;
      if (ts - lastDraw >= perf.current.frameMs) {
        lastDraw = ts;
        setElapsed(tRef.current);
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => {
      mounted = false;
      cancelAnimationFrame(raf.current);
    };
  }, [playing, speed, n, total]);

  // Drag to orbit. Only a mostly-horizontal drag claims the gesture, so the page still scrolls.
  const drag = useRef({ yaw: 0, pitch: 0 });
  const live = useRef({ yaw, pitch });
  live.current = { yaw, pitch };
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
        onPanResponderGrant: () => {
          drag.current = { ...live.current };
          setHint(false);
          setAngle(null);
        },
        onPanResponderMove: (_e, g) => {
          setYaw(drag.current.yaw - g.dx * 0.011);
          setPitch(Math.min(0.75, Math.max(-0.05, drag.current.pitch + g.dy * 0.006)));
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [],
  );

  const batches = useMemo(() => {
    if (n < 2 || width < 10) return [];
    const p = perf.current;
    const started = Date.now();
    const out = composeFrame(poseAt(replay, t0 + elapsed), stage, {
      view,
      body,
      yaw,
      pitch,
      width,
      height,
      time: elapsed / 1000,
      flagged,
      detail: p.detail,
    });
    p.avg = p.avg * 0.8 + (Date.now() - started) * 0.2;
    if (p.avg > 28 && p.detail > 0.55) {
      p.detail = Math.max(0.55, p.detail - 0.15);
      p.avg = 20;
    } else if (p.avg < 9 && p.detail < 1) {
      p.detail = Math.min(1, p.detail + 0.05);
    }
    p.frameMs = Math.max(FRAME_MS, Math.round(p.avg * 1.6));
    return out;
  }, [n, width, replay, t0, elapsed, stage, view, body, yaw, pitch, height, flagged]);

  if (n < 2) {
    return (
      <View style={[styles.stage, { height }]}>
        <Text style={styles.empty}>No motion to replay.</Text>
      </View>
    );
  }

  const progress = Math.min(1, elapsed / total);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  return (
    <View>
      <View style={styles.views} accessibilityRole="tablist">
        {VIEWS.map((v) => (
          <Pressable
            key={v.key}
            onPress={() => setView(v.key)}
            accessibilityRole="tab"
            accessibilityLabel={`${v.label} view`}
            accessibilityState={{ selected: view === v.key }}
            style={[styles.viewTab, view === v.key && styles.viewTabOn]}
          >
            <Text style={[styles.viewText, view === v.key && styles.viewTextOn]}>{v.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={[styles.stage, { height }]} onLayout={onLayout} {...pan.panHandlers}>
        {width > 0 ? <Stage3D batches={batches} width={width} height={height} /> : null}

        {view !== 'skeleton' ? (
          <View style={[styles.overlayRow, styles.overlayLeft]}>
            {BODIES.map((b) => (
              <Pressable
                key={b.key}
                onPress={() => chooseBody(b.key)}
                accessibilityRole="button"
                accessibilityLabel={`${b.label} body`}
                accessibilityState={{ selected: body === b.key }}
                hitSlop={6}
                style={[styles.mini, body === b.key && styles.miniOn]}
              >
                <Text style={[styles.miniText, body === b.key && styles.miniTextOn]}>{b.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={[styles.overlayRow, styles.overlayRight]}>
          {ANGLES.map((a) => (
            <Pressable
              key={a.key}
              onPress={() => {
                setAngle(a.key);
                setYaw(angleYaw(a.key));
                setPitch(a.key === 'side' ? 0.02 : DEFAULT_PITCH);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${a.label} angle`}
              accessibilityState={{ selected: angle === a.key }}
              hitSlop={6}
              style={[styles.mini, angle === a.key && styles.miniOn]}
            >
              <Text style={[styles.miniText, angle === a.key && styles.miniTextOn]}>{a.label}</Text>
            </Pressable>
          ))}
        </View>

        {hint ? (
          <View style={styles.hint} pointerEvents="none">
            <Feather name="rotate-cw" size={12} color={colors.onDarkMuted} />
            <Text style={styles.hintText}>Drag to turn</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.controls}>
        <Pressable
          onPress={() => setPlaying((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause replay' : 'Play replay'}
          style={styles.play}
        >
          <Feather name={playing ? 'pause' : 'play'} size={20} color={colors.onDark} />
        </Pressable>
        <View style={styles.speeds}>
          {SPEEDS.map((s) => (
            <Pressable
              key={s}
              onPress={() => setSpeed(s)}
              accessibilityRole="button"
              accessibilityLabel={`Playback speed ${s}x`}
              accessibilityState={{ selected: speed === s }}
              style={[styles.speed, speed === s && styles.speedOn]}
            >
              <Text style={[styles.speedText, speed === s && styles.speedTextOn]}>{s}×</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.track}>
        <View style={[styles.trackFill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    backgroundColor: '#0B0C0F',
    borderRadius: radius.lg,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  empty: { fontFamily: fonts.regular, color: colors.onDarkMuted, fontSize: 14, textAlign: 'center' },
  views: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  viewTab: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
  },
  viewTabOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  viewText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.inkSoft },
  viewTextOn: { color: colors.onDark },
  overlayRow: { position: 'absolute', bottom: 10, flexDirection: 'row', gap: 6 },
  overlayLeft: { left: 10 },
  overlayRight: { right: 10 },
  mini: {
    minHeight: 30,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  miniOn: { backgroundColor: 'rgba(255,255,255,0.92)', borderColor: 'rgba(255,255,255,0.92)' },
  miniText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.onDarkMuted },
  miniTextOn: { color: '#0B0C0F' },
  hint: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  hintText: { fontFamily: fonts.regular, fontSize: 12, color: colors.onDarkMuted },
  controls: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, gap: spacing.md },
  play: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  speeds: { flexDirection: 'row', gap: spacing.sm },
  speed: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
  },
  speedOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  speedText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.inkSoft },
  speedTextOn: { color: colors.bg },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.line, marginTop: spacing.md, overflow: 'hidden' },
  trackFill: { height: 4, backgroundColor: colors.accent },
});
