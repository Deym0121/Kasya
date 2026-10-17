// @ts-nocheck
//
// Ephemeral video review on a DEVICE: plays the opt-in temp clip with the tracked
// skeleton drawn on top (react-native-svg), synced to playback. The Review screen
// deletes the temp file when it unmounts. Needs the dev build to verify.
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import Svg, { Line as SvgLine, Circle } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, radius } from '../theme';
import { isValid, poseAt, prepareReplay } from './motion';

const LINES = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],
  [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
];
const SPEEDS = [0.25, 0.5, 1];

export function VideoReplay({ videoUri, frames, height = 340 }) {
  const player = useVideoPlayer(videoUri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  const [clock, setClock] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  // Natural video size + measured stage box, so the overlay can match the
  // letterboxed content rect that contentFit="contain" produces.
  const [videoSize, setVideoSize] = useState(null);
  const [stage, setStage] = useState(null);
  const t0 = frames && frames.length ? frames[0].t : 0;
  const raf = useRef(0);
  // Cleaned for drawing (bridged dropouts, de-jittered) and blended between
  // captured frames so the skeleton tracks the video between pose samples.
  const replay = useMemo(() => prepareReplay(frames ?? []), [frames]);

  useEventListener(player, 'sourceLoad', ({ availableVideoTracks }) => {
    const size = availableVideoTracks?.[0]?.size;
    if (size && size.width > 0 && size.height > 0) setVideoSize(size);
  });

  // Follow the player every display frame (was a 60ms poll → visible lag).
  useEffect(() => {
    let mounted = true;
    const loop = () => {
      if (!mounted) return;
      setClock(player.currentTime || 0);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => {
      mounted = false;
      cancelAnimationFrame(raf.current);
    };
  }, [player]);

  const f = replay.length ? { landmarks: poseAt(replay, t0 + clock * 1000) } : null;
  const toggle = () => {
    if (player.playing) {
      player.pause();
      setPlaying(false);
    } else {
      player.play();
      setPlaying(true);
    }
  };
  const setRate = (s) => {
    player.playbackRate = s;
    setSpeed(s);
  };

  // Where the video pixels actually land inside the stage ("contain" letterbox).
  let rect = null;
  if (videoSize && stage) {
    const scale = Math.min(stage.width / videoSize.width, stage.height / videoSize.height);
    const w = videoSize.width * scale;
    const h = videoSize.height * scale;
    rect = { position: 'absolute', left: (stage.width - w) / 2, top: (stage.height - h) / 2, width: w, height: h };
  }
  // Native capture stores landmarks in upright-frame ISOTROPIC units — both
  // axes normalized by frame HEIGHT (see PoseScanCamera onResults) — so both
  // axes scale by the video's height to land in frame px.
  const sx = videoSize ? videoSize.width : 1;
  const sy = videoSize ? videoSize.height : 1;

  return (
    <View>
      <View style={[styles.stage, { height }]} onLayout={(e) => setStage(e.nativeEvent.layout)}>
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />
        <Svg
          style={rect ?? StyleSheet.absoluteFill}
          viewBox={`0 0 ${sx} ${sy}`}
          preserveAspectRatio="xMidYMid meet"
          pointerEvents="none"
        >
          {f &&
            LINES.map(([a, b], k) =>
              isValid(f.landmarks[a]) && isValid(f.landmarks[b]) ? (
                <SvgLine
                  key={`l${k}`}
                  x1={f.landmarks[a].x * sy}
                  y1={f.landmarks[a].y * sy}
                  x2={f.landmarks[b].x * sy}
                  y2={f.landmarks[b].y * sy}
                  stroke="#39FF14"
                  strokeWidth={0.012 * sx}
                  strokeLinecap="round"
                />
              ) : null,
            )}
          {f &&
            f.landmarks.map((p, k) =>
              isValid(p) ? <Circle key={`p${k}`} cx={p.x * sy} cy={p.y * sy} r={0.013 * sx} fill="#FF3B30" /> : null,
            )}
        </Svg>
      </View>
      <View style={styles.controls}>
        <Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel={playing ? 'Pause' : 'Play'} style={styles.play}>
          <Feather name={playing ? 'pause' : 'play'} size={20} color="#fff" />
        </Pressable>
        <View style={styles.speeds}>
          {SPEEDS.map((s) => (
            <Pressable
              key={s}
              onPress={() => setRate(s)}
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
      <Text style={styles.note}>Your clip · deleted when you leave this screen</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { backgroundColor: '#070B12', borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, overflow: 'hidden' },
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
  speedTextOn: { color: '#fff' },
  note: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, marginTop: spacing.sm },
});
