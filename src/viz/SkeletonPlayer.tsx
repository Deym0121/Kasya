import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Line as SvgLine, Circle } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, radius } from '../theme';
import { LANDMARK } from '../gait/types';
import type { PoseFrame } from '../gait/types';

const LEFT_TONE = '#1D9E75'; // teal — left leg
const RIGHT_TONE = '#FF5436'; // coral — right leg

// BlazePose bones (torso, arms, legs, feet).
const BONES = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],
  [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
];
const SPEEDS = [0.25, 0.5, 1];

// Dropped landmarks are stored as {x:0,y:0,visibility:0} — never draw those.
const valid = (p: any) => p && (p.visibility ?? 1) > 0.2 && !(p.x === 0 && p.y === 0);

/**
 * Slow-mo replay of the captured skeleton, reconstructed from saved landmarks.
 * `alignment` overlays a straight hip→ankle line down each leg (left teal, right
 * coral) — the rear-view "how each leg tracks" line, honest (not pronation).
 */
export function SkeletonPlayer({
  frames,
  height = 300,
  alignment = false,
}: {
  frames: PoseFrame[];
  height?: number;
  alignment?: boolean;
}) {
  const n = frames?.length ?? 0;
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(0.5);
  const raf = useRef(0);
  const tRef = useRef(0);

  useEffect(() => {
    if (!playing || n < 2) return;
    let mounted = true;
    let prev = 0;
    const total = Math.max(1, frames[n - 1].t - frames[0].t);
    const loop = (ts: number) => {
      if (!mounted) return;
      if (!prev) prev = ts;
      const dt = ts - prev;
      prev = ts;
      tRef.current += dt * speed;
      if (tRef.current > total) tRef.current = 0;
      const target = frames[0].t + tRef.current;
      let i = 0;
      while (i < n - 1 && frames[i + 1].t <= target) i++;
      setIdx(i);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => {
      mounted = false;
      cancelAnimationFrame(raf.current);
    };
  }, [playing, speed, n, frames]);

  if (n < 2) {
    return (
      <View style={[styles.stage, { height }]}>
        <Text style={styles.empty}>No motion to replay.</Text>
      </View>
    );
  }

  const f = frames[Math.min(idx, n - 1)];
  const progress = n > 1 ? idx / (n - 1) : 0;

  return (
    <View>
      <View style={[styles.stage, { height }]}>
        <Svg width="100%" height={height} viewBox="0 0 1 1" preserveAspectRatio="xMidYMid meet">
          {BONES.map(([a, b], k) => {
            const pa = f.landmarks[a];
            const pb = f.landmarks[b];
            if (!valid(pa) || !valid(pb)) return null;
            return (
              <SvgLine
                key={`b${k}`}
                x1={pa.x}
                y1={pa.y}
                x2={pb.x}
                y2={pb.y}
                stroke="#39FF14"
                strokeWidth={0.012}
                strokeLinecap="round"
              />
            );
          })}
          {f.landmarks.map((p, k) =>
            valid(p) ? <Circle key={`p${k}`} cx={p.x} cy={p.y} r={0.013} fill="#FF3B30" /> : null,
          )}
          {alignment
            ? ([
                [LANDMARK.LEFT_HIP, LANDMARK.LEFT_ANKLE, LEFT_TONE],
                [LANDMARK.RIGHT_HIP, LANDMARK.RIGHT_ANKLE, RIGHT_TONE],
              ] as const).map(([hip, ankle, tone], i) => {
                const h = f.landmarks[hip];
                const a = f.landmarks[ankle];
                if (!valid(h) || !valid(a)) return null;
                return (
                  <SvgLine
                    key={`al${i}`}
                    x1={h.x}
                    y1={h.y}
                    x2={a.x}
                    y2={a.y}
                    stroke={tone}
                    strokeWidth={0.008}
                    strokeLinecap="round"
                  />
                );
              })
            : null}
        </Svg>
      </View>

      <View style={styles.controls}>
        <Pressable
          onPress={() => setPlaying((p) => !p)}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause replay' : 'Play replay'}
          style={styles.play}
        >
          <Feather name={playing ? 'pause' : 'play'} size={20} color="#fff" />
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
    backgroundColor: colors.ink,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  empty: { fontFamily: fonts.regular, color: 'rgba(255,255,255,0.7)', fontSize: 14 },
  controls: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, gap: spacing.md },
  play: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  speedTextOn: { color: '#fff' },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.line, marginTop: spacing.md, overflow: 'hidden' },
  trackFill: { height: 4, backgroundColor: colors.accent },
});
