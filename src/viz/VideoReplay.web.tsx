// @ts-nocheck
//
// Ephemeral video review on the WEB: plays the opt-in clip the user just recorded
// (an in-memory object URL — never saved, never uploaded) with the tracked
// skeleton drawn on top, synced to playback. The Review screen deletes the clip
// when it unmounts.
import { useRef, useEffect, useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, radius } from '../theme';

const LINES = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],
  [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
];
const SPEEDS = [0.25, 0.5, 1];

export function VideoReplay({ videoUri, frames, height = 340 }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  // Autoplay is the browser's call, not ours — start pessimistic and let the
  // play() attempt below set the real state.
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const t0 = frames && frames.length ? frames[0].t : 0;

  const draw = useCallback(() => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (v && c && v.videoWidth) {
      if (c.width !== v.videoWidth) {
        c.width = v.videoWidth;
        c.height = v.videoHeight;
      }
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      if (frames && frames.length) {
        const target = t0 + v.currentTime * 1000;
        let i = 0;
        while (i < frames.length - 1 && frames[i + 1].t <= target) i++;
        const pts = frames[i].landmarks;
        ctx.strokeStyle = '#39FF14';
        ctx.lineWidth = Math.max(2, c.width * 0.006);
        ctx.lineCap = 'round';
        for (const [a, b] of LINES) {
          const pa = pts[a];
          const pb = pts[b];
          if (pa && pb && !(pa.x === 0 && pa.y === 0) && !(pb.x === 0 && pb.y === 0)) {
            ctx.beginPath();
            ctx.moveTo(pa.x * c.width, pa.y * c.height);
            ctx.lineTo(pb.x * c.width, pb.y * c.height);
            ctx.stroke();
          }
        }
        ctx.fillStyle = '#FF3B30';
        const r = Math.max(2, c.width * 0.006);
        for (const p of pts) {
          if (p && !(p.x === 0 && p.y === 0) && (p.visibility ?? 1) > 0.2) {
            ctx.beginPath();
            ctx.arc(p.x * c.width, p.y * c.height, r, 0, 6.2832);
            ctx.fill();
          }
        }
      }
    }
    rafRef.current = requestAnimationFrame(draw);
  }, [frames, t0]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  // Kick off playback ourselves and mirror what actually happened — if the
  // browser blocks it, the control honestly shows "play" over the first frame.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const p = v.play();
    if (p && typeof p.then === 'function') {
      p.then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      setPlaying(!v.paused);
    }
  }, []);

  // Slow-mo: drive the element's playbackRate from the selected speed chip.
  useEffect(() => {
    const v = videoRef.current;
    if (v) v.playbackRate = speed;
  }, [speed]);

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) {
      v.pause();
      setPlaying(false);
    } else {
      const p = v.play();
      if (p && typeof p.catch === 'function') p.catch(() => setPlaying(false));
      setPlaying(true);
    }
  };

  return (
    <View>
      <div style={{ ...stageStyle, height }}>
        <video ref={videoRef} src={videoUri} playsInline muted loop style={mediaStyle} />
        <canvas ref={canvasRef} style={mediaStyle} />
      </div>
      <View style={styles.controls}>
        <Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel={playing ? 'Pause' : 'Play'} style={styles.play}>
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
      <Text style={styles.note}>Your clip · deleted when you leave this screen</Text>
    </View>
  );
}

const stageStyle = {
  position: 'relative',
  width: '100%',
  background: '#070B12',
  borderRadius: 20,
  overflow: 'hidden',
  display: 'flex',
};
const mediaStyle = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' };

const styles = StyleSheet.create({
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
