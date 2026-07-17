// @ts-nocheck
//
// Ephemeral video review on a DEVICE: plays the opt-in temp clip with the tracked
// skeleton drawn on top (react-native-svg), synced to playback. The Review screen
// deletes the temp file when it unmounts. Needs the dev build to verify.
import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import Svg, { Line as SvgLine, Circle } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, radius } from '../theme';

const LINES = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],
  [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
];
const valid = (p) => p && (p.visibility ?? 1) > 0.2 && !(p.x === 0 && p.y === 0);

export function VideoReplay({ videoUri, frames, height = 340 }) {
  const player = useVideoPlayer(videoUri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const t0 = frames && frames.length ? frames[0].t : 0;
  const timer = useRef(null);

  useEffect(() => {
    timer.current = setInterval(() => {
      if (!frames || !frames.length) return;
      const target = t0 + (player.currentTime || 0) * 1000;
      let i = 0;
      while (i < frames.length - 1 && frames[i + 1].t <= target) i++;
      setIdx(i);
    }, 60);
    return () => clearInterval(timer.current);
  }, [player, frames, t0]);

  const f = frames && frames.length ? frames[Math.min(idx, frames.length - 1)] : null;
  const toggle = () => {
    if (player.playing) {
      player.pause();
      setPlaying(false);
    } else {
      player.play();
      setPlaying(true);
    }
  };

  return (
    <View>
      <View style={[styles.stage, { height }]}>
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />
        <Svg style={StyleSheet.absoluteFill} viewBox="0 0 1 1" preserveAspectRatio="xMidYMid meet" pointerEvents="none">
          {f &&
            LINES.map(([a, b], k) =>
              valid(f.landmarks[a]) && valid(f.landmarks[b]) ? (
                <SvgLine
                  key={`l${k}`}
                  x1={f.landmarks[a].x}
                  y1={f.landmarks[a].y}
                  x2={f.landmarks[b].x}
                  y2={f.landmarks[b].y}
                  stroke="#39FF14"
                  strokeWidth={0.012}
                  strokeLinecap="round"
                />
              ) : null,
            )}
          {f &&
            f.landmarks.map((p, k) => (valid(p) ? <Circle key={`p${k}`} cx={p.x} cy={p.y} r={0.013} fill="#FF3B30" /> : null))}
        </Svg>
      </View>
      <View style={styles.controls}>
        <Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel={playing ? 'Pause' : 'Play'} style={styles.play}>
          <Feather name={playing ? 'pause' : 'play'} size={20} color="#fff" />
        </Pressable>
        <Text style={styles.note}>Your clip · deleted when you leave this screen</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { backgroundColor: '#070B12', borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, overflow: 'hidden' },
  controls: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, gap: spacing.md },
  play: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  note: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, flex: 1 },
});
