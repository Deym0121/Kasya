// @ts-nocheck
//
// Real on-device camera + BlazePose skeleton + landmark capture.
// Loaded ONLY by PoseScanScreen.native.tsx when NOT running in Expo Go, so its
// native imports (vision-camera / skia / pose) never execute in Expo Go.
// Runs in the Kasya custom dev build. See BUILD_NATIVE.md.
//
// Types suppressed (@ts-nocheck): native modules aren't verifiable headless.
// The data contract — toPoseFrame() — is unit-tested in poseMapper.test.ts.
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { usePoseDetection, RunningMode, Delegate } from 'react-native-mediapipe-posedetection';
import { Canvas, Line as SkLine, Circle as SkCircle, vec } from '@shopify/react-native-skia';
import Svg, { Circle as SvgCircle, Line as SvgLine } from 'react-native-svg';
import { colors, spacing, fonts, radius } from '../theme';
import { Button } from '../components';
import { toPoseFrame, analyzeGait } from '../gait';
import { BODY_GUIDE, BODY_GUIDE_VIEWBOX } from '../viz/bodyGuide';
import { setPendingVideo, clearPendingVideo } from '../viz/videoHolder';

// VisionCamera hands back a bare filesystem path; expo-file-system (and the
// review player) want a file:// URI.
const toFileUri = (p) => (p && p.startsWith('file://') ? p : `file://${p}`);

async function deleteFile(uri) {
  try {
    // SDK 56: deleteAsync on the main entry is legacy-removed and throws —
    // the File class is the supported API now.
    const FS = await import('expo-file-system');
    new FS.File(toFileUri(uri)).delete();
  } catch (e) {
    console.warn('Kasya: could not delete the temp review clip', e);
  }
}

const HIP_L = 23, HIP_R = 24, KNEE_L = 25, KNEE_R = 26, ANK_L = 27, ANK_R = 28;
const HEEL_L = 29, HEEL_R = 30, FOOT_L = 31, FOOT_R = 32;
const LEG_LINES = [
  [HIP_L, KNEE_L], [KNEE_L, ANK_L], [ANK_L, HEEL_L], [HEEL_L, FOOT_L], [ANK_L, FOOT_L],
  [HIP_R, KNEE_R], [KNEE_R, ANK_R], [ANK_R, HEEL_R], [HEEL_R, FOOT_R], [ANK_R, FOOT_R],
  [HIP_L, HIP_R],
];
const KEYPOINTS = [HIP_L, KNEE_L, ANK_L, HEEL_L, FOOT_L, HIP_R, KNEE_R, ANK_R, HEEL_R, FOOT_R];
const CAPTURE_MS = 10000;
const visible = (p) => p && (p.visibility ?? p.presence ?? 1) > 0.5;

export default function PoseScanCamera({ navigation, route }) {
  const { goal } = route.params;
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();

  const [size, setSize] = useState({ w: 1, h: 1 });
  const [landmarks, setLandmarks] = useState(null);
  const [recording, setRecording] = useState(false);
  const [retry, setRetry] = useState('');
  const [leadIn, setLeadIn] = useState(3); // "get ready" countdown, seconds
  const [count, setCount] = useState(0); // live countdown number
  const [counting, setCounting] = useState(false);
  const [recordVideo, setRecordVideo] = useState(false); // opt-in ephemeral clip
  const [engineNote, setEngineNote] = useState(null); // visible detector diagnostics

  const cameraRef = useRef(null);
  const capturing = useRef(false);
  const startedAt = useRef(0);
  const frames = useRef([]);
  const timer = useRef(null);
  const recordingVideoRef = useRef(false);
  // Set on Close / unmount: late recorder callbacks (camera teardown fires
  // onRecordingFinished AFTER we leave) must never advance a cancelled scan.
  const cancelledRef = useRef(false);
  const lastPoseAt = useRef(0);

  useEffect(
    () => () => {
      // Unmount = cancelled: stop any in-flight clip so it finalizes and the
      // guarded finish() below only deletes it; never leave a countdown running.
      // We do NOT clearPendingVideo here — a successful capture has already
      // handed its clip to the review holder.
      cancelledRef.current = true;
      if (timer.current) clearInterval(timer.current); // clears both setTimeout + setInterval in RN
      if (recordingVideoRef.current && cameraRef.current) {
        try {
          cameraRef.current.stopRecording();
        } catch {}
      }
    },
    [],
  );

  // Close mid-scan: mark cancelled first so the recorder callbacks become
  // no-ops (they still delete the temp clip), then leave.
  const closeScan = useCallback(() => {
    cancelledRef.current = true;
    capturing.current = false;
    if (timer.current) clearInterval(timer.current);
    if (recordingVideoRef.current && cameraRef.current) {
      try {
        cameraRef.current.stopRecording(); // its onRecordingFinished only deletes the file now
      } catch {}
    }
    navigation.goBack();
  }, [navigation]);

  // Evaluate the capture (+ keep or discard the opt-in clip), then advance.
  const finish = useCallback(
    (videoPath) => {
      // Screen closed (or unmounted) before the clip finalized: delete the temp
      // file, touch no state/navigation — a cancelled scan never advances.
      if (cancelledRef.current) {
        if (videoPath) deleteFile(videoPath);
        return;
      }
      capturing.current = false;
      recordingVideoRef.current = false;
      setRecording(false);
      try {
        const result = analyzeGait(frames.current);
        if (!result.captureQuality.ok) {
          if (videoPath) deleteFile(videoPath);
          setRetry(result.captureQuality.issues[0] || 'Stay fully in frame and walk for the whole ten seconds.');
          return;
        }
        if (videoPath) setPendingVideo(videoPath);
        else clearPendingVideo();
        navigation.replace('Processing', { goal, frames: frames.current });
      } catch {
        if (videoPath) deleteFile(videoPath);
        setRetry('Something went wrong analyzing that capture — try again.');
      }
    },
    [goal, navigation],
  );

  const pose = usePoseDetection(
    {
      onResults: (result) => {
        // The package wraps detections: { results: PoseLandmarkerResult[] }
        // (shared/types.ts ResultBundleMap). The bare-landmarks read kept the
        // Record button permanently disabled; old shape kept as fallback.
        const lm = result?.results?.[0]?.landmarks?.[0] ?? result?.landmarks?.[0];
        if (!lm) {
          // Body left the frame — drop the skeleton instead of freezing the last pose.
          lastPoseAt.current = 0;
          setLandmarks(null);
          return;
        }
        lastPoseAt.current = Date.now();
        setLandmarks(lm);
        setEngineNote(null);
        if (capturing.current) frames.current.push(toPoseFrame(lm, Date.now() - startedAt.current));
      },
      // A silent detector is indistinguishable from "step into frame" — surface it.
      onError: (e) => setEngineNote(String((e && e.message) || e || 'pose detector error')),
    },
    RunningMode.LIVE_STREAM,
    'pose_landmarker_lite.task',
    { numPoses: 1, minPoseDetectionConfidence: 0.5, delegate: Delegate.GPU },
  );

  // Staleness sweep: if detection just goes quiet (no onResults at all), the
  // skeleton must not stay frozen on screen.
  useEffect(() => {
    const sweep = setInterval(() => {
      if (lastPoseAt.current && Date.now() - lastPoseAt.current > 800) {
        lastPoseAt.current = 0;
        setLandmarks(null);
      }
    }, 400);
    return () => clearInterval(sweep);
  }, []);

  // Detector never delivering anything looks exactly like "step into frame".
  // If no pose has EVER arrived within 7s of mount, say so on screen — the
  // audit showed createDetector failures are otherwise swallowed silently.
  useEffect(() => {
    const t = setTimeout(() => {
      if (!lastPoseAt.current) {
        setEngineNote((prev) => prev ?? 'no pose data yet — if this persists, the detector failed to start');
      }
    }, 7000);
    return () => clearTimeout(t);
  }, []);

  const beginCapture = useCallback(() => {
    setCounting(false);
    frames.current = [];
    startedAt.current = Date.now();
    capturing.current = true;
    setRecording(true);

    // Opt-in clip: record the camera to a temp file. onRecordingFinished fires
    // after stopRecording and hands us the path; finish() keeps or deletes it.
    const withVideo = recordVideo && cameraRef.current;
    recordingVideoRef.current = !!withVideo;
    if (withVideo) {
      try {
        cameraRef.current.startRecording({
          video: true,
          audio: false,
          onRecordingFinished: (v) => finish(toFileUri(v.path)), // VisionCamera returns a bare path
          onRecordingError: () => finish(null),
        });
      } catch {
        recordingVideoRef.current = false;
      }
    } else {
      clearPendingVideo(); // a non-video scan must not inherit a stale clip
    }

    timer.current = setTimeout(() => {
      if (recordingVideoRef.current && cameraRef.current) {
        try {
          cameraRef.current.stopRecording(); // path arrives via onRecordingFinished → finish()
        } catch {
          finish(null);
        }
      } else {
        finish(null);
      }
    }, CAPTURE_MS);
  }, [goal, navigation, recordVideo, finish]);

  // Tap Record → a short "get ready" countdown (3/5/10s) → beginCapture().
  const startCapture = useCallback(() => {
    setRetry('');
    if (timer.current) clearInterval(timer.current);
    if (leadIn <= 0) {
      beginCapture();
      return;
    }
    let c = leadIn;
    setCount(c);
    setCounting(true);
    timer.current = setInterval(() => {
      c -= 1;
      if (c <= 0) {
        clearInterval(timer.current);
        beginCapture();
      } else {
        setCount(c);
      }
    }, 1000);
  }, [leadIn, beginCapture]);

  if (!hasPermission) {
    return (
      <View style={styles.perm}>
        <Text style={styles.permTitle}>Camera access needed</Text>
        <Text style={styles.permBody}>
          Kasya uses your camera to track your stride on-device. Nothing is recorded or uploaded.
        </Text>
        <View style={{ height: spacing.xl }} />
        <Button label="Allow camera" icon="camera" onPress={requestPermission} />
      </View>
    );
  }
  if (device == null) {
    return (
      <View style={styles.perm}>
        <Text style={styles.permTitle}>No camera found</Text>
      </View>
    );
  }

  const X = (p) => p.x * size.w;
  const Y = (p) => p.y * size.h;

  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive
        video={true}
        audio={false}
        frameProcessor={pose.frameProcessor}
        onLayout={pose.cameraViewLayoutChangeHandler}
      />
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        {landmarks &&
          LEG_LINES.map(([a, b], i) =>
            visible(landmarks[a]) && visible(landmarks[b]) ? (
              <SkLine
                key={`l${i}`}
                p1={vec(X(landmarks[a]), Y(landmarks[a]))}
                p2={vec(X(landmarks[b]), Y(landmarks[b]))}
                color="#39FF14"
                strokeWidth={6}
              />
            ) : null,
          )}
        {landmarks &&
          KEYPOINTS.map((k, i) =>
            visible(landmarks[k]) ? (
              <SkCircle key={`c${i}`} cx={X(landmarks[k])} cy={Y(landmarks[k])} r={7} color="#FF3B30" />
            ) : null,
          )}
      </Canvas>

      {!recording ? (
        <Svg
          style={StyleSheet.absoluteFill}
          viewBox={BODY_GUIDE_VIEWBOX}
          preserveAspectRatio="xMidYMid meet"
          pointerEvents="none"
        >
          <SvgCircle
            cx={BODY_GUIDE.head.cx}
            cy={BODY_GUIDE.head.cy}
            r={BODY_GUIDE.head.r}
            fill="none"
            stroke={landmarks ? '#39FF14' : 'rgba(255,255,255,0.55)'}
            strokeWidth={4}
            strokeDasharray="6 8"
          />
          {BODY_GUIDE.lines.map((l, i) => (
            <SvgLine
              key={i}
              x1={l[0]}
              y1={l[1]}
              x2={l[2]}
              y2={l[3]}
              stroke={landmarks ? '#39FF14' : 'rgba(255,255,255,0.55)'}
              strokeWidth={4}
              strokeLinecap="round"
              strokeDasharray="6 8"
            />
          ))}
        </Svg>
      ) : null}

      {counting ? (
        <View style={styles.countWrap} pointerEvents="none">
          <Text style={styles.countNum}>{count}</Text>
        </View>
      ) : null}

      <View style={styles.top} pointerEvents="box-none">
        <Pressable onPress={closeScan} hitSlop={12} style={styles.back}>
          <Text style={styles.backText}>Close</Text>
        </Pressable>
        <Text style={styles.hint}>
          {counting
            ? 'Get ready — start walking when it hits 0'
            : recording
              ? 'Recording — walk naturally'
              : retry || 'Stand side-on, full body in frame'}
        </Text>
        {engineNote ? (
          <Text style={styles.engineNote} numberOfLines={3}>
            Engine: {engineNote}
          </Text>
        ) : null}
      </View>

      <View style={styles.bottom} pointerEvents="box-none">
        {!recording && !counting ? (
          <View style={styles.leadRow}>
            <Text style={styles.leadLabel}>Get ready</Text>
            {[3, 5, 10].map((s) => (
              <Pressable
                key={s}
                onPress={() => setLeadIn(s)}
                style={[styles.leadChip, leadIn === s && styles.leadChipOn]}
              >
                <Text style={[styles.leadChipText, leadIn === s && styles.leadChipTextOn]}>{s}s</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {!recording && !counting ? (
          <Pressable style={styles.vidToggle} onPress={() => setRecordVideo((v) => !v)}>
            <View style={[styles.check, recordVideo && styles.checkOn]}>
              {recordVideo ? <Text style={styles.checkMark}>✓</Text> : null}
            </View>
            <Text style={styles.vidText}>Record my video (just this once) — shown only in review, then deleted</Text>
          </Pressable>
        ) : null}
        {/* Like the web screen, Record is gated on a body being detected right now. */}
        <Button
          label={
            counting
              ? `Starting in ${count}…`
              : recording
                ? 'Recording…'
                : landmarks
                  ? 'Record 10 seconds'
                  : 'Step fully into frame'
          }
          icon="camera"
          variant="accent"
          onPress={startCapture}
          disabled={recording || counting || !landmarks}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  perm: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  permTitle: { fontFamily: fonts.bold, fontSize: 20, color: colors.ink },
  permBody: { fontFamily: fonts.regular, fontSize: 15, color: colors.muted, textAlign: 'center', marginTop: spacing.sm },
  top: { position: 'absolute', top: 48, left: spacing.xl, right: spacing.xl, alignItems: 'center' },
  back: { position: 'absolute', left: 0, top: 0 },
  backText: { fontFamily: fonts.semibold, color: '#fff', fontSize: 15 },
  engineNote: {
    fontFamily: fonts.medium,
    color: '#F5A83C',
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 6,
  },
  hint: {
    fontFamily: fonts.medium,
    color: '#fff',
    fontSize: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  bottom: { position: 'absolute', left: spacing.xl, right: spacing.xl, bottom: 40 },
  countWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  countNum: { fontFamily: fonts.extra, fontSize: 140, color: '#fff' },
  leadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  leadLabel: { fontFamily: fonts.medium, fontSize: 14, color: '#fff', marginRight: spacing.md },
  leadChip: {
    minHeight: 40,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
    marginRight: spacing.sm,
  },
  leadChipOn: { backgroundColor: colors.ink },
  leadChipText: { fontFamily: fonts.semibold, fontSize: 14, color: '#fff' },
  leadChipTextOn: { color: colors.bg },
  vidToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  check: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkMark: { color: '#fff', fontSize: 13, fontFamily: fonts.bold },
  vidText: { flex: 1, fontFamily: fonts.medium, fontSize: 13, color: '#fff' },
});
