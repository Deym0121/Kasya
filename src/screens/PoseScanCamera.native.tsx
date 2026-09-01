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
import { View, Text, StyleSheet, Pressable, Linking, Platform } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { usePoseDetection, RunningMode, Delegate } from 'react-native-mediapipe-posedetection';
import { Canvas, Line as SkLine, Circle as SkCircle, vec } from '@shopify/react-native-skia';
import Svg, { Circle as SvgCircle, Line as SvgLine } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
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
  // Back camera is the gait-scan default (someone films you side-on); the flip
  // button switches to front for self-checks.
  const [position, setPosition] = useState('back');
  const device = useCameraDevice(position);
  const { hasPermission, requestPermission } = useCameraPermission();
  const [permDenied, setPermDenied] = useState(false);
  // 5.1.1(iv): the system permission dialog must follow the explainer
  // unconditionally — fire it as soon as the screen opens, exactly once.
  const askedPermission = useRef(false);
  useEffect(() => {
    if (hasPermission || askedPermission.current) return;
    askedPermission.current = true;
    requestPermission().then((granted) => {
      if (!granted) setPermDenied(true);
    });
  }, [hasPermission, requestPermission]);
  // GPU first; the first detector error retries once on CPU (GPU delegate is
  // the least-proven piece under static frameworks — the hook recreates the
  // detector when the delegate option changes).
  const [delegate, setDelegate] = useState(Delegate.GPU);

  const [size, setSize] = useState({ w: 1, h: 1 });
  const sizeRef = useRef({ w: 1, h: 1 });
  const [landmarks, setLandmarks] = useState(null);
  const [recording, setRecording] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(CAPTURE_MS / 1000); // capture countdown, UI only
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
  const secTimer = useRef(null); // 1s tick driving secondsLeft while recording (UI only)
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
      if (secTimer.current) clearInterval(secTimer.current);
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
    if (secTimer.current) clearInterval(secTimer.current);
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
      if (secTimer.current) clearInterval(secTimer.current);
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

  // One-shot GPU→CPU retry bookkeeping. iOS swallows detector-CREATION
  // failures entirely (createDetector resolves, a nil landmarker just no-ops),
  // so silence is the only signal a dead GPU delegate gives — the retry has to
  // live in the no-pose watchdog as well as onError.
  const triedCpu = useRef(false);
  const cpuSwitchAt = useRef(0);
  const switchToCpu = useCallback(() => {
    if (triedCpu.current) return false;
    triedCpu.current = true;
    cpuSwitchAt.current = Date.now();
    setEngineNote('restarting the pose engine…');
    setDelegate(Delegate.CPU);
    return true;
  }, []);

  // STABLE callbacks (refs + setters only): fresh arrows here make the hook
  // rebuild its frame processor every render — vision-camera then re-installs
  // it natively on every landmark tick.
  const onPoseResults = useCallback((result, vc) => {
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
    // The package's ViewCoordinator is the only correct frame→view mapping
    // (sensor/output rotation + cover-crop + front-camera mirroring). From the
    // view-space point we derive TWO spaces:
    //  - overlay: view-normalized, drawn as x*viewW / y*viewH — the skeleton
    //    sits on the body the user actually sees;
    //  - analysis + saved frames: upright frame coords with BOTH axes divided
    //    by frame HEIGHT — isotropic units. Per-axis normalization skews x
    //    against y by the aspect ratio, which pegged overstride and knee-angle
    //    math (they mix x and y).
    let draw = lm;
    let analysis = null;
    try {
      if (vc?.getFrameDims && vc?.convertPoint) {
        const fd = vc.getFrameDims(result);
        const { w: vw, h: vh } = sizeRef.current;
        // Invert convertPoint's cover-fit (same math as the package's
        // framePointToView) to recover upright frame px from view px.
        const fr = fd.width / fd.height;
        const vr = vw / vh;
        let scale, xoff = 0, yoff = 0;
        if (fr > vr) {
          scale = vh / fd.height;
          xoff = (vw - fd.width * scale) / 2;
        } else {
          scale = vw / fd.width;
          yoff = (vh - fd.height * scale) / 2;
        }
        const d = [];
        const a = [];
        for (const p of lm) {
          const v = vc.convertPoint(fd, p);
          d.push({ x: v.x / (vw || 1), y: v.y / (vh || 1), z: p.z, visibility: p.visibility, presence: p.presence });
          a.push({
            x: (v.x - xoff) / scale / fd.height,
            y: (v.y - yoff) / scale / fd.height,
            z: p.z,
            visibility: p.visibility,
            presence: p.presence,
          });
        }
        // NaN guard (a throw-based catch misses silent NaN dims): only trust
        // the mapping when it produced real numbers.
        if (Number.isFinite(d[0]?.x) && Number.isFinite(d[0]?.y)) {
          draw = d;
          analysis = a;
        }
      }
    } catch {}
    lastPoseAt.current = Date.now();
    setLandmarks(draw);
    setEngineNote(analysis ? null : 'skeleton mapping unavailable on this device');
    // No valid mapping → skip the frame rather than mixing coordinate spaces
    // inside one capture; an empty capture fails the quality gate honestly.
    if (capturing.current && analysis) frames.current.push(toPoseFrame(analysis, Date.now() - startedAt.current));
  }, []);

  const onPoseError = useCallback((e) => {
    // Raw exception text on screen read as "app is broken" to App Review
    // (build 24) — keep the diagnostics in the console, show calm copy.
    console.warn('[Kasya] pose detector error', e);
    if (switchToCpu()) return; // first error: silent retry on CPU
    // The released GPU detector can echo late errors for a beat after the
    // switch — don't let them clobber the "restarting" note.
    if (Date.now() - cpuSwitchAt.current > 2500) {
      setEngineNote('Live tracking isn’t working on this device right now — you can still run a demo scan below.');
    }
  }, [switchToCpu]);

  const pose = usePoseDetection(
    { onResults: onPoseResults, onError: onPoseError },
    RunningMode.LIVE_STREAM,
    'pose_landmarker_lite.task',
    {
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      delegate,
      // Mirror only the front camera (matches the mirrored preview iOS shows).
      mirrorMode: 'mirror-front-only',
      // The package's iOS layer throttles inference AND events to ~15fps
      // internally; 30 here just halves the wasted worklet→native calls.
      fpsMode: 30,
    },
  );

  // The package needs to know which physical camera is live (mirroring +
  // sensor orientation) — its own MediapipeCamera wires this; a raw Camera
  // must do it by hand.
  useEffect(() => {
    if (device) pose.cameraDeviceChangeHandler(device);
  }, [device, pose.cameraDeviceChangeHandler]);

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

  // Detector never delivering anything looks exactly like "step into frame",
  // and iOS gives NO error for a detector that failed to create (the promise
  // resolves; a nil landmarker silently no-ops). So the watchdog is the real
  // GPU→CPU fallback: 7s of total silence retries once on CPU (delegate change
  // recreates the detector); 7 more silent seconds says so on screen.
  useEffect(() => {
    const t = setTimeout(() => {
      if (lastPoseAt.current) return;
      if (switchToCpu()) return; // re-arms via the delegate dep below
      setEngineNote((prev) => prev ?? 'Live tracking isn’t starting on this device — you can still run a demo scan below.');
    }, 7000);
    return () => clearTimeout(t);
  }, [delegate, switchToCpu]);

  const beginCapture = useCallback(() => {
    setCounting(false);
    frames.current = [];
    startedAt.current = Date.now();
    capturing.current = true;
    setRecording(true);
    // Visible time feedback: tick secondsLeft down once a second (UI only —
    // the capture itself still ends on the single CAPTURE_MS timeout below).
    setSecondsLeft(CAPTURE_MS / 1000);
    if (secTimer.current) clearInterval(secTimer.current);
    secTimer.current = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);

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
    // App Review 5.1.1(iv), round-5 correction: a pre-permission message must
    // ALWAYS proceed to the system permission dialog — no button that skips or
    // delays it. So the system prompt fires immediately (the effect above),
    // the explainer is passive text visible beneath it, and the user's real
    // decision point is Apple's own dialog. Only AFTER a denial does the
    // screen offer recovery — Settings, the demo scan, and a way back — the
    // exact pattern Apple's guidance endorses (and what round 3 required).
    return (
      <View style={styles.perm}>
        <Text style={styles.permTitle}>{permDenied ? 'Camera is off for Kasya' : 'Camera access'}</Text>
        <Text style={styles.permBody}>
          {permDenied
            ? 'A live gait scan needs the camera, which you can turn on anytime in Settings. Video is never uploaded. You can also try a demo scan with sample data instead.'
            : 'Kasya uses the camera to analyze your stride on your device. Video is never uploaded; an optional review clip stays on your phone and is deleted after review.'}
        </Text>
        {permDenied ? (
          <>
            <View style={{ height: spacing.xl }} />
            <View style={{ alignSelf: 'stretch' }}>
              <Button label="Open Settings" icon="settings" onPress={() => Linking.openSettings()} />
              <View style={{ height: spacing.md }} />
              <Button
                label="Try a demo scan (sample data)"
                icon="play"
                variant="secondary"
                onPress={() => navigation.replace('Processing', { goal })}
              />
            </View>
            <Pressable
              onPress={() => navigation.goBack()}
              style={styles.permClose}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Text style={styles.permCloseText}>Back</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    );
  }
  if (device == null) {
    // Reachable via the Flip button on hardware lacking that camera — must
    // never dead-end: always offer a way back.
    return (
      <View style={styles.perm}>
        <Text style={styles.permTitle}>No camera found</Text>
        {position === 'front' ? (
          <>
            <Text style={styles.permBody}>This device doesn’t have a usable front camera for the scan.</Text>
            <View style={{ height: spacing.xl }} />
            <View style={{ alignSelf: 'stretch' }}>
              <Button label="Use back camera" icon="refresh-cw" onPress={() => setPosition('back')} />
            </View>
          </>
        ) : null}
        <View style={{ height: spacing.md, alignSelf: 'stretch' }} />
        <View style={{ alignSelf: 'stretch' }}>
          <Button label="Close" onPress={() => navigation.goBack()} />
        </View>
      </View>
    );
  }

  const X = (p) => p.x * size.w;
  const Y = (p) => p.y * size.h;

  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={(e) => {
        const d = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
        sizeRef.current = d;
        setSize(d);
      }}
    >
      {/* Wiring mirrors the package's own MediapipeCamera (its reference
          integration): on iOS pixelFormat="rgb" is REQUIRED — the plugin
          builds MPImage from the sample buffer and silently produces nothing
          on the YUV default (Android's MediaImageBuilder handles YUV natively,
          and RGB is unsupported on some Android cameras — keep yuv there).
          resizeMode="cover" must match the ViewCoordinator's crop math; the
          orientation handler feeds skeleton rotation. video stays on for the
          opt-in review clip. */}
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive
        video={true}
        audio={false}
        pixelFormat={Platform.OS === 'ios' ? 'rgb' : 'yuv'}
        resizeMode="cover"
        frameProcessor={pose.frameProcessor}
        onLayout={pose.cameraViewLayoutChangeHandler}
        onOutputOrientationChanged={pose.cameraOrientationChangedHandler}
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

      {recording ? <View style={styles.recDot} pointerEvents="none" /> : null}

      <View style={styles.top} pointerEvents="box-none">
        <Pressable onPress={closeScan} hitSlop={12} style={styles.back}>
          <Text style={styles.backText}>Close</Text>
        </Pressable>
        {!recording && !counting ? (
          <Pressable
            onPress={() => {
              // New camera = new geometry; drop the stale skeleton until the
              // detector reports against the flipped feed.
              setLandmarks(null);
              setPosition((p) => (p === 'back' ? 'front' : 'back'));
            }}
            hitSlop={12}
            style={styles.flip}
            accessibilityRole="button"
            accessibilityLabel={position === 'back' ? 'Switch to front camera' : 'Switch to back camera'}
          >
            <Feather name="refresh-cw" size={16} color="#fff" />
            <Text style={styles.backText}> Flip</Text>
          </Pressable>
        ) : null}
        <Text style={styles.hint}>
          {counting
            ? 'Get ready — start walking when it hits 0'
            : recording
              ? landmarks
                ? `Recording — ${secondsLeft}s · walk back and forth across the frame`
                : 'We lost you — step back into frame!'
              : retry ||
                (landmarks
                  ? 'Stand side-on, full body in frame'
                  : 'Stand side-on, full body in frame. No one in frame yet? Tap Record, then get into position during the countdown.')}
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
        {/* Record needs a detected body only for an instant start (no lead-in):
            with a 3s+ countdown a solo user taps Record, then gets into frame
            during it — the quality gate still fails an empty capture honestly. */}
        <Button
          label={
            counting
              ? `Starting in ${count}…`
              : recording
                ? `Recording… ${secondsLeft}s`
                : landmarks || leadIn >= 3
                  ? 'Record 10 seconds'
                  : 'Step fully into frame'
          }
          icon="camera"
          variant="accent"
          onPress={startCapture}
          disabled={recording || counting || (!landmarks && leadIn < 3)}
        />
        {/* Nobody to film? A reviewer at a desk (or anyone alone) can still see
            the full flow — clearly-labeled sample data, never a dead end. */}
        {!recording && !counting ? (
          <Pressable
            onPress={() => navigation.replace('Processing', { goal })}
            style={styles.demoLink}
            accessibilityRole="button"
            accessibilityLabel="Try a demo scan with sample data"
          >
            <Text style={styles.demoLinkText}>No one to film right now? Try a demo scan (sample data)</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  perm: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  permClose: { marginTop: spacing.lg, minHeight: 44, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  permCloseText: { fontFamily: fonts.medium, fontSize: 15, color: colors.muted },
  permTitle: { fontFamily: fonts.bold, fontSize: 20, color: colors.ink },
  permBody: { fontFamily: fonts.regular, fontSize: 15, color: colors.muted, textAlign: 'center', marginTop: spacing.sm },
  top: { position: 'absolute', top: 48, left: spacing.xl, right: spacing.xl, alignItems: 'center' },
  back: { position: 'absolute', left: 0, top: 0 },
  flip: { position: 'absolute', right: 0, top: 0, flexDirection: 'row', alignItems: 'center' },
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
  // Mirrors the web screen's recDot (minimal red "recording" indicator).
  recDot: { position: 'absolute', top: 16, right: 16, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.danger, zIndex: 2 },
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
  demoLink: { alignItems: 'center', marginTop: spacing.md, minHeight: 40, justifyContent: 'center' },
  demoLinkText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: '#fff',
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
});
