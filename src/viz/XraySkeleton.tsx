import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, {
  Line as SvgLine,
  Circle,
  Ellipse,
  Polygon,
  Defs,
  LinearGradient,
  Stop,
} from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, radius } from '../theme';
import type { PoseFrame } from '../gait/types';
import { skeletonViewBoxAttr } from './skeletonFrame';

// Bone skeleton (drawn bright over the translucent body).
const BONES = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],
  [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
];
// Limbs drawn as tapered volumes: [proximal, distal, widthProximal, widthDistal].
const LIMBS: [number, number, number, number][] = [
  [23, 25, 0.085, 0.058], [25, 27, 0.055, 0.032], // left thigh, shin
  [24, 26, 0.085, 0.058], [26, 28, 0.055, 0.032], // right thigh, shin
  [27, 31, 0.03, 0.02], [28, 32, 0.03, 0.02], // feet
  [11, 13, 0.05, 0.04], [13, 15, 0.04, 0.026], // left arm
  [12, 14, 0.05, 0.04], [14, 16, 0.04, 0.026], // right arm
];
const GLOW_JOINTS = [23, 24, 25, 26, 27, 28]; // hips, knees, ankles
const SPEEDS = [0.25, 0.5, 1];
const GLOW_WARM = '#FF5A3C';
const JOINT_BLUE = '#8FD8F7';

const valid = (p: any) => p && (p.visibility ?? 1) > 0.2 && !(p.x === 0 && p.y === 0);
const mid = (a: any, b: any) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Tapered quad between two joints, wide at A, narrow at B. */
function limbPoly(a: any, b: any, wa: number, wb: number): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1e-6;
  const nx = -dy / len;
  const ny = dx / len;
  return [
    `${a.x + (nx * wa) / 2},${a.y + (ny * wa) / 2}`,
    `${b.x + (nx * wb) / 2},${b.y + (ny * wb) / 2}`,
    `${b.x - (nx * wb) / 2},${b.y - (ny * wb) / 2}`,
    `${a.x - (nx * wa) / 2},${a.y - (ny * wa) / 2}`,
  ].join(' ');
}

/**
 * A shaded, translucent "X-ray" human body that re-enacts the user's captured
 * movement — tapered limb volumes + torso + head with a blue gradient and a soft
 * glow, the bone skeleton bright on top, and the major joints glowing (flagged
 * ones warm — a movement note, NOT an injury claim). Side-view, no rotation.
 */
export function XraySkeleton({
  frames,
  flagged = [],
  height = 340,
}: {
  frames: PoseFrame[];
  flagged?: number[];
  height?: number;
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
      tRef.current += (ts - prev) * speed;
      prev = ts;
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

  // Centre the replay on where the body moved (see skeletonFrame.ts).
  const viewBox = useMemo(() => skeletonViewBoxAttr(frames), [frames]);

  if (n < 2) {
    return (
      <View style={[styles.stage, { height }]}>
        <Text style={styles.empty}>No motion to replay.</Text>
      </View>
    );
  }

  const f = frames[Math.min(idx, n - 1)];
  const L = f.landmarks;
  const progress = n > 1 ? idx / (n - 1) : 0;

  // torso + head anchors
  const sh = valid(L[11]) && valid(L[12]) ? mid(L[11], L[12]) : null;
  const hp = valid(L[23]) && valid(L[24]) ? mid(L[23], L[24]) : null;
  const headC = valid(L[7]) && valid(L[8]) ? mid(L[7], L[8]) : valid(L[0]) ? { x: L[0].x, y: L[0].y - 0.02 } : null;

  const limbs = LIMBS.filter(([a, b]) => valid(L[a]) && valid(L[b]));

  return (
    <View>
      <View style={[styles.stage, { height }]}>
        <Svg width="100%" height={height} viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
          <Defs>
            <LinearGradient id="body" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#BCE6FF" stopOpacity="0.62" />
              <Stop offset="1" stopColor="#2E6FCC" stopOpacity="0.5" />
            </LinearGradient>
          </Defs>

          {/* soft glow halo (wider, faint) */}
          {limbs.map(([a, b, wa, wb], k) => (
            <Polygon key={`h${k}`} points={limbPoly(L[a], L[b], wa + 0.03, wb + 0.03)} fill="#4FA8E8" fillOpacity={0.12} />
          ))}
          {sh && hp ? <Polygon points={limbPoly(sh, hp, 0.16, 0.14)} fill="#4FA8E8" fillOpacity={0.12} /> : null}

          {/* torso + head + limb volumes */}
          {sh && hp ? <Polygon points={limbPoly(sh, hp, 0.135, 0.115)} fill="url(#body)" stroke="#CFEBFF" strokeOpacity={0.4} strokeWidth={0.004} /> : null}
          {headC ? (
            <>
              <Ellipse cx={headC.x} cy={headC.y} rx={0.052} ry={0.062} fill="url(#body)" stroke="#CFEBFF" strokeOpacity={0.4} strokeWidth={0.004} />
              <Ellipse cx={headC.x - 0.014} cy={headC.y - 0.018} rx={0.018} ry={0.022} fill="#EAF8FF" opacity={0.25} />
            </>
          ) : null}
          {sh && headC ? <Polygon points={limbPoly(headC, sh, 0.04, 0.07)} fill="url(#body)" /> : null}
          {limbs.map(([a, b, wa, wb], k) => (
            <Polygon key={`l${k}`} points={limbPoly(L[a], L[b], wa, wb)} fill="url(#body)" stroke="#CFEBFF" strokeOpacity={0.35} strokeWidth={0.004} strokeLinejoin="round" />
          ))}

          {/* bright bone skeleton */}
          {BONES.map(([a, b], k) => {
            if (!valid(L[a]) || !valid(L[b])) return null;
            return <SvgLine key={`b${k}`} x1={L[a].x} y1={L[a].y} x2={L[b].x} y2={L[b].y} stroke="#EAFBFF" strokeOpacity={0.85} strokeWidth={0.007} strokeLinecap="round" />;
          })}

          {/* joint glows */}
          {GLOW_JOINTS.map((j) => {
            const p = L[j];
            if (!valid(p)) return null;
            return flagged.includes(j) ? (
              <Circle key={`g${j}`} cx={p.x} cy={p.y} r={0.03} fill={GLOW_WARM} opacity={0.3} />
            ) : (
              <Circle key={`g${j}`} cx={p.x} cy={p.y} r={0.012} fill={JOINT_BLUE} opacity={0.9} />
            );
          })}
          {GLOW_JOINTS.filter((j) => flagged.includes(j)).map((j) =>
            valid(L[j]) ? <Circle key={`gi${j}`} cx={L[j].x} cy={L[j].y} r={0.014} fill={GLOW_WARM} /> : null,
          )}
        </Svg>
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
    backgroundColor: '#070B12',
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  empty: { fontFamily: fonts.regular, color: colors.onDarkMuted, fontSize: 14 },
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
