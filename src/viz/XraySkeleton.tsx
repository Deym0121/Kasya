import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Ellipse, G, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, radius } from '../theme';
import type { PoseFrame } from '../gait/types';
import { skeletonViewBoxAttr } from './skeletonFrame';
import { isValid, poseAt, prepareReplay } from './motion';
import { bodyMetrics, buildFigure, type Ellipse as Oval, type Figure, type Limb } from './bodyModel';

const GLOW_JOINTS = [23, 24, 25, 26, 27, 28]; // hips, knees, ankles
const SPEEDS = [0.25, 0.5, 1];
const GLOW_WARM = '#FF5A3C';
const JOINT_BLUE = '#8FD8F7';

export type ReplayView = 'human' | 'anatomy' | 'skeleton';
const VIEWS: { key: ReplayView; label: string }[] = [
  { key: 'human', label: 'Human' },
  { key: 'anatomy', label: 'Anatomy' },
  { key: 'skeleton', label: 'Skeleton' },
];

// Anatomy (X-ray)
const XRAY_BONE = '#EEF8FF';
const XRAY_EDGE = '#FFFFFF';
const XRAY_SKIN_EDGE = '#CFEBFF';
// Skeleton (bones only)
const IVORY = '#EDE6D6';
const IVORY_LIGHT = '#FFF9EE';
const IVORY_SHADE = '#B9AE98';
// Human
const SKIN_EDGE = '#6E4330';
const HAIR = '#2B1D16';
const SHORTS = '#232833';
const SHORTS_FAR = '#171A22';
const SHOE = '#F3F4F6';
const LACE = '#8C95A3';

/**
 * Gait replay of the user's captured movement, in three views:
 *  - Human: a runner (skin, tee, shorts, running shoes) re-enacting the motion;
 *  - Anatomy: a translucent "X-ray" body with the skeleton inside;
 *  - Skeleton: bones only — skull, spine, ribs, pelvis, limbs and a real foot
 *    skeleton (calcaneus, talus, navicular, cuboid, cuneiforms, metatarsals,
 *    phalanges) that pitches with the foot through strike and toe-off.
 * Everything is sized to the subject's own proportions (bodyModel.ts). In a side
 * view the far arm/leg sits behind, dimmer. The capture is cleaned for drawing
 * only (motion.ts: dropout bridging + zero-phase smoothing) and blended between
 * frames, so slow-mo stays fluid. Hips/knees/ankles flagged by the analysis glow
 * warm — a movement note, NOT an injury claim.
 */
export function XraySkeleton({
  frames,
  flagged = [],
  height = 340,
  initialView = 'human',
}: {
  frames: PoseFrame[];
  flagged?: number[];
  height?: number;
  initialView?: ReplayView;
}) {
  const n = frames?.length ?? 0;
  const replay = useMemo(() => prepareReplay(frames), [frames]);
  const metrics = useMemo(() => bodyMetrics(replay), [replay]);
  const t0 = n ? frames[0].t : 0;
  const total = n > 1 ? Math.max(1, frames[n - 1].t - t0) : 1;
  const [view, setView] = useState<ReplayView>(initialView);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(0.5);
  const raf = useRef(0);
  const tRef = useRef(0);

  useEffect(() => {
    if (!playing || n < 2) return;
    let mounted = true;
    let prev = 0;
    const loop = (ts: number) => {
      if (!mounted) return;
      if (!prev) prev = ts;
      tRef.current += (ts - prev) * speed;
      prev = ts;
      if (tRef.current > total) tRef.current = 0;
      setElapsed(tRef.current);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => {
      mounted = false;
      cancelAnimationFrame(raf.current);
    };
  }, [playing, speed, n, total]);

  // Centre the replay on where the body moved (see skeletonFrame.ts).
  const viewBox = useMemo(() => skeletonViewBoxAttr(frames), [frames]);

  if (n < 2) {
    return (
      <View style={[styles.stage, { height }]}>
        <Text style={styles.empty}>No motion to replay.</Text>
      </View>
    );
  }

  const L = poseAt(replay, t0 + elapsed);
  const fig = buildFigure(L, metrics);
  const progress = Math.min(1, elapsed / total);
  const H = metrics.stature;

  let scene: ReactNode;
  if (view === 'human') scene = <HumanScene fig={fig} />;
  else if (view === 'skeleton') scene = <SkeletonScene fig={fig} />;
  else scene = <AnatomyScene fig={fig} />;

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

      <View style={[styles.stage, { height }]}>
        <Svg width="100%" height={height} viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
          <Defs>
            <LinearGradient id="xray" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#BCE6FF" stopOpacity="0.5" />
              <Stop offset="1" stopColor="#2E6FCC" stopOpacity="0.4" />
            </LinearGradient>
            <LinearGradient id="xrayFar" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#7FB4E0" stopOpacity="0.32" />
              <Stop offset="1" stopColor="#1D4A8F" stopOpacity="0.3" />
            </LinearGradient>
            <LinearGradient id="skin" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#F2C6A5" />
              <Stop offset="1" stopColor="#D49274" />
            </LinearGradient>
            <LinearGradient id="skinFar" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#B98466" />
              <Stop offset="1" stopColor="#8F5E46" />
            </LinearGradient>
            <LinearGradient id="tee" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#FF7A3D" />
              <Stop offset="1" stopColor="#E0480F" />
            </LinearGradient>
            <LinearGradient id="teeFar" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#C55424" />
              <Stop offset="1" stopColor="#9E3409" />
            </LinearGradient>
            <LinearGradient id="ivory" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={IVORY_LIGHT} />
              <Stop offset="1" stopColor={IVORY} />
            </LinearGradient>
          </Defs>

          {scene}

          {/* joint glows: warm where the analysis flagged; blue joint dots in the anatomy view */}
          {GLOW_JOINTS.map((j) => {
            const p = L[j];
            if (!isValid(p)) return null;
            if (flagged.includes(j)) return <Circle key={`g${j}`} cx={p.x} cy={p.y} r={0.04 * H} fill={GLOW_WARM} opacity={0.3} />;
            return view === 'anatomy' ? <Circle key={`g${j}`} cx={p.x} cy={p.y} r={0.014 * H} fill={JOINT_BLUE} opacity={0.85} /> : null;
          })}
          {GLOW_JOINTS.filter((j) => flagged.includes(j)).map((j) =>
            isValid(L[j]) ? <Circle key={`gi${j}`} cx={L[j].x} cy={L[j].y} r={0.018 * H} fill={GLOW_WARM} /> : null,
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

const oval = (o: Oval, props: Record<string, unknown>) => (
  <Ellipse cx={o.cx} cy={o.cy} rx={o.rx} ry={o.ry} transform={`rotate(${o.rotate} ${o.cx} ${o.cy})`} {...props} />
);

/** A clothed runner: far leg + arm first, then trunk and head, then the near leg and arm. */
function HumanScene({ fig }: { fig: Figure }) {
  const sw = fig.strokes;
  const h = fig.human;
  const limbs = (far: boolean, part: Limb['part']) => (far ? fig.flesh.back : fig.flesh.front).filter((l) => l.part === part);
  const skin = (l: Limb, k: number, key: string) => (
    <Path
      key={`${key}${k}`}
      d={l.d}
      fill={l.far ? 'url(#skinFar)' : 'url(#skin)'}
      stroke={SKIN_EDGE}
      strokeOpacity={0.3}
      strokeWidth={sw.fine}
      strokeLinejoin="round"
    />
  );
  const cloth = (l: Limb, k: number, key: string, fill: string, farFill: string) => (
    <Path key={`${key}${k}`} d={l.d} fill={l.far ? farFill : fill} stroke="#000" strokeOpacity={0.18} strokeWidth={sw.fine} strokeLinejoin="round" />
  );
  const leg = (far: boolean) => {
    const shoes = h.shoes.filter((s) => s.far === far);
    return (
      <G>
        {limbs(far, 'leg').map((l, k) => skin(l, k, far ? 'lb' : 'lf'))}
        {/* no heel/toe landmarks → no shoe; show the bare foot rather than nothing */}
        {shoes.length ? null : limbs(far, 'foot').map((l, k) => skin(l, k, far ? 'pb' : 'pf'))}
        {h.shortsLegs.filter((l) => l.far === far).map((l, k) => cloth(l, k, far ? 'sb' : 'sf', SHORTS, SHORTS_FAR))}
        {shoes.map((s, k) => (
          <G key={`shoe${k}`} opacity={far ? 0.8 : 1}>
            <Path d={s.upper} fill={SHOE} stroke="#000" strokeOpacity={0.25} strokeWidth={sw.fine} strokeLinejoin="round" />
            <Path d={s.sole} fill={colors.accent} stroke="#000" strokeOpacity={0.2} strokeWidth={sw.fine * 0.6} />
            {s.laces.map((d, i) => (
              <Path key={i} d={d} fill="none" stroke={LACE} strokeWidth={sw.fine * 1.4} strokeLinecap="round" />
            ))}
          </G>
        ))}
      </G>
    );
  };
  const arm = (far: boolean) => (
    <G>
      {limbs(far, 'arm').map((l, k) => skin(l, k, far ? 'ab' : 'af'))}
      {h.sleeves.filter((l) => l.far === far).map((l, k) => cloth(l, k, far ? 'vb' : 'vf', 'url(#tee)', 'url(#teeFar)'))}
    </G>
  );
  return (
    <G>
      {leg(true)}
      {arm(true)}
      {h.shorts ? <Path d={h.shorts} fill={SHORTS} stroke="#000" strokeOpacity={0.2} strokeWidth={sw.fine} strokeLinejoin="round" /> : null}
      {h.shirt ? <Path d={h.shirt} fill="url(#tee)" stroke="#000" strokeOpacity={0.2} strokeWidth={sw.fine} strokeLinejoin="round" /> : null}
      {fig.flesh.neck ? <Path d={fig.flesh.neck} fill="url(#skin)" /> : null}
      {fig.flesh.head ? oval(fig.flesh.head, { fill: 'url(#skin)', stroke: SKIN_EDGE, strokeOpacity: 0.3, strokeWidth: sw.fine }) : null}
      {h.hair ? <Path d={h.hair} fill={HAIR} /> : null}
      {h.ear ? oval(h.ear, { fill: '#D9A084', stroke: SKIN_EDGE, strokeOpacity: 0.35, strokeWidth: sw.fine }) : null}
      {h.nose ? <Path d={h.nose} fill="url(#skin)" stroke={SKIN_EDGE} strokeOpacity={0.3} strokeWidth={sw.fine} strokeLinejoin="round" /> : null}
      {h.eyes.map((e, k) => (
        <G key={`eye${k}`}>{oval(e, { fill: '#2A1C16' })}</G>
      ))}
      {h.brows.map((d, k) => (
        <Path key={`brow${k}`} d={d} fill="none" stroke={HAIR} strokeWidth={sw.fine * 1.3} strokeLinecap="round" />
      ))}
      {h.mouth ? <Path d={h.mouth} fill="none" stroke="#8A4B3A" strokeWidth={sw.fine} strokeLinecap="round" /> : null}
      {leg(false)}
      {arm(false)}
    </G>
  );
}

/** Translucent X-ray body with the skeleton inside. */
function AnatomyScene({ fig }: { fig: Figure }) {
  const sw = fig.strokes;
  const fleshLimb = (l: Limb, k: number, key: string) => (
    <Path
      key={`${key}${k}`}
      d={l.d}
      fill={l.far ? 'url(#xrayFar)' : 'url(#xray)'}
      stroke={XRAY_SKIN_EDGE}
      strokeOpacity={l.far ? 0.18 : 0.38}
      strokeWidth={sw.fine}
      strokeLinejoin="round"
    />
  );
  const halo = [...fig.flesh.back, ...fig.flesh.front].map((l) => l.d);
  if (fig.flesh.torso) halo.push(fig.flesh.torso);
  return (
    <G>
      {/* soft glow around the whole body */}
      {halo.map((d, k) => (
        <Path key={`h${k}`} d={d} fill="none" stroke="#4FA8E8" strokeOpacity={0.12} strokeWidth={sw.bone * 6} strokeLinejoin="round" />
      ))}
      {fig.flesh.back.map((l, k) => fleshLimb(l, k, 'fb'))}
      <LimbBones fig={fig} far palette="xray" />
      {fig.flesh.torso ? <Path d={fig.flesh.torso} fill="url(#xray)" stroke={XRAY_SKIN_EDGE} strokeOpacity={0.4} strokeWidth={sw.fine} /> : null}
      {fig.flesh.neck ? <Path d={fig.flesh.neck} fill="url(#xray)" /> : null}
      {fig.flesh.head ? oval(fig.flesh.head, { fill: 'url(#xray)', stroke: XRAY_SKIN_EDGE, strokeOpacity: 0.4, strokeWidth: sw.fine }) : null}
      <AxialBones fig={fig} palette="xray" />
      {fig.flesh.front.map((l, k) => fleshLimb(l, k, 'ff'))}
      <LimbBones fig={fig} far={false} palette="xray" />
    </G>
  );
}

/** Bones only, ivory on the dark stage. */
function SkeletonScene({ fig }: { fig: Figure }) {
  return (
    <G>
      <LimbBones fig={fig} far palette="ivory" />
      <AxialBones fig={fig} palette="ivory" />
      <LimbBones fig={fig} far={false} palette="ivory" />
    </G>
  );
}

type Palette = 'xray' | 'ivory';
const TONES = {
  xray: { fill: XRAY_BONE, edge: XRAY_EDGE, line: XRAY_BONE, nearFill: 0.45, farFill: 0.25, nearEdge: 0.75, farEdge: 0.35 },
  ivory: { fill: 'url(#ivory)', edge: IVORY_SHADE, line: IVORY, nearFill: 0.95, farFill: 0.5, nearEdge: 0.9, farEdge: 0.55 },
};

/** Arm, leg and foot bones on one side of the body. */
function LimbBones({ fig, far, palette }: { fig: Figure; far: boolean; palette: Palette }) {
  const sw = fig.strokes;
  const t = TONES[palette];
  const mine = (list: Limb[]) => list.filter((l) => l.far === far);
  const solid = (l: Limb, k: number, key: string) => (
    <Path
      key={`${key}${k}`}
      d={l.d}
      fill={t.fill}
      fillOpacity={far ? t.farFill : t.nearFill}
      stroke={t.edge}
      strokeOpacity={far ? t.farEdge : t.nearEdge}
      strokeWidth={sw.fine}
      strokeLinejoin="round"
    />
  );
  return (
    <G>
      {mine(fig.bones.long).map((l, k) => solid(l, k, 'l'))}
      {mine(fig.bones.feet).map((l, k) => solid(l, k, 'f'))}
      {mine(fig.bones.toes).map((l, k) => solid(l, k, 't'))}
      {mine(fig.bones.thin).map((l, k) => (
        <Path
          key={`n${k}`}
          d={l.d}
          fill="none"
          stroke={t.line}
          strokeOpacity={far ? t.farEdge : t.nearEdge}
          strokeWidth={sw.bone}
          strokeLinecap="round"
        />
      ))}
      {far
        ? null
        : fig.bones.patellae.map((p, k) => (
            <Circle
              key={`k${k}`}
              cx={p.cx}
              cy={p.cy}
              r={p.r}
              fill={t.fill}
              fillOpacity={t.nearFill}
              stroke={t.edge}
              strokeOpacity={t.nearEdge}
              strokeWidth={sw.fine}
            />
          ))}
    </G>
  );
}

/** Skull, spine, ribs, collarbones and pelvis. */
function AxialBones({ fig, palette }: { fig: Figure; palette: Palette }) {
  const sw = fig.strokes;
  const b = fig.bones;
  const t = TONES[palette];
  const solid = palette === 'ivory';
  const plate = (d: string, key: string, opacity: number) => (
    <Path key={key} d={d} fill={t.fill} fillOpacity={opacity} stroke={t.edge} strokeOpacity={0.75} strokeWidth={sw.fine} strokeLinejoin="round" />
  );
  const s = b.skull;
  return (
    <G>
      {s ? (
        <G>
          {plate(s.cranium, 'cr', solid ? 0.95 : 0.22)}
          {plate(s.mandible, 'md', solid ? 0.95 : 0.28)}
          {s.cheeks.map((d, k) => plate(d, `ch${k}`, solid ? 0.95 : 0.3))}
          {s.teeth.map((d, k) => (
            <Path key={`te${k}`} d={d} fill={solid ? '#FBF7EE' : XRAY_BONE} fillOpacity={solid ? 1 : 0.5} stroke={t.edge} strokeOpacity={0.6} strokeWidth={sw.fine * 0.5} />
          ))}
          {s.holes.map((d, k) => (
            <Path key={`ho${k}`} d={d} fill="#0B1A2E" fillOpacity={solid ? 0.9 : 0.55} stroke={t.edge} strokeOpacity={0.5} strokeWidth={sw.fine} />
          ))}
          {s.sutures.map((d, k) => (
            <Path key={`su${k}`} d={d} fill="none" stroke={solid ? IVORY_SHADE : XRAY_EDGE} strokeOpacity={solid ? 0.8 : 0.35} strokeWidth={sw.fine * 0.6} strokeLinecap="round" />
          ))}
        </G>
      ) : null}
      {b.ribs.map((d, k) => (
        <Path key={`r${k}`} d={d} fill="none" stroke={t.line} strokeOpacity={solid ? 0.85 : 0.45} strokeWidth={solid ? sw.bone : sw.fine} strokeLinecap="round" />
      ))}
      {b.sternum ? <Path d={b.sternum} fill="none" stroke={t.line} strokeOpacity={solid ? 0.85 : 0.6} strokeWidth={sw.bone * (solid ? 1.4 : 1)} strokeLinecap="round" /> : null}
      {b.clavicles.map((d, k) => (
        <Path key={`c${k}`} d={d} fill="none" stroke={t.line} strokeOpacity={solid ? 0.9 : 0.75} strokeWidth={sw.bone} strokeLinecap="round" />
      ))}
      {b.spine ? <Path d={b.spine} fill="none" stroke={t.line} strokeOpacity={solid ? 0.5 : 0.35} strokeWidth={sw.bone * 1.6} strokeLinecap="round" /> : null}
      {b.vertebrae.map((v, k) => (
        <Path
          key={`v${k}`}
          d={v.d}
          fill={t.fill}
          fillOpacity={solid ? 0.95 : 0.6}
          stroke={t.edge}
          strokeOpacity={solid ? 0.8 : 0.6}
          strokeWidth={sw.fine * 0.6}
          strokeLinejoin="round"
        />
      ))}
      {b.pelvis.map((d, k) => (
        <Path key={`p${k}`} d={d} fill={t.fill} fillRule="evenodd" fillOpacity={solid ? 0.9 : 0.32} stroke={t.edge} strokeOpacity={0.7} strokeWidth={sw.fine} strokeLinejoin="round" />
      ))}
    </G>
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
